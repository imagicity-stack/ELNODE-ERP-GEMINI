import express, { Request, Response, NextFunction } from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
import Razorpay from "razorpay";
import crypto from "crypto";
import dotenv from "dotenv";
import { rateLimit } from "express-rate-limit";
import * as admin from "firebase-admin";

dotenv.config();

// ── Startup environment guard ─────────────────────────────────────────────────
const REQUIRED_ENV = ["VITE_RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[server] FATAL: missing required environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

// ── Firebase Admin ────────────────────────────────────────────────────────────
let adminApp: admin.app.App;
try {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountJson) {
    const serviceAccount = JSON.parse(serviceAccountJson) as admin.ServiceAccount;
    adminApp = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
  } else {
    // Application Default Credentials (works on Google Cloud Run automatically)
    adminApp = admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
  }
} catch (e) {
  console.error("[server] FATAL: Firebase Admin SDK initialization failed:", e);
  process.exit(1);
}

const FIRESTORE_DB_ID = process.env.FIREBASE_DATABASE_ID || "(default)";
const adminDb = admin.firestore(adminApp);
// Use non-default database if configured
if (FIRESTORE_DB_ID !== "(default)") {
  // @ts-ignore — setDatabaseId is available but not always in typings
  adminDb.settings({ databaseId: FIRESTORE_DB_ID });
}

// ── Razorpay ──────────────────────────────────────────────────────────────────
const razorpay = new Razorpay({
  key_id: process.env.VITE_RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();
const PORT = 3000;

// CORS — allow only the configured app origin (or same-origin in production)
const allowedOrigin = process.env.APP_URL
  ? process.env.APP_URL.replace(/\/$/, "")
  : undefined;

app.use(
  cors({
    origin: allowedOrigin ?? false,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "16kb" }));

// ── Auth middleware ───────────────────────────────────────────────────────────
interface AuthedRequest extends Request {
  firebaseUid?: string;
  firebaseEmail?: string;
}

async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = header.slice(7);
  try {
    const decoded = await admin.auth(adminApp).verifyIdToken(token);
    req.firebaseUid = decoded.uid;
    req.firebaseEmail = decoded.email;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function timingSafeEquals(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(a, "hex");
    const bBuf = Buffer.from(b, "hex");
    if (aBuf.length !== bBuf.length) return false;
    return crypto.timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}

// ── Payment API ───────────────────────────────────────────────────────────────

// POST /api/payment/create-order
// Authenticated. Derives the amount server-side from the feeRequest — client never dictates price.
app.post(
  "/api/payment/create-order",
  paymentLimiter,
  requireAuth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const { feeRequestId, currency } = req.body;

      if (!feeRequestId || typeof feeRequestId !== "string" || feeRequestId.length > 128) {
        res.status(400).json({ error: "Invalid feeRequestId" });
        return;
      }

      // Fetch the fee request to get the canonical amount
      const feeRequestSnap = await adminDb.collection("feeRequests").doc(feeRequestId).get();
      if (!feeRequestSnap.exists) {
        res.status(404).json({ error: "Fee request not found" });
        return;
      }
      const feeRequest = feeRequestSnap.data()!;

      // Verify the authenticated user is linked to this student
      const userSnap = await adminDb.collection("users").doc(req.firebaseUid!).get();
      if (!userSnap.exists) {
        res.status(403).json({ error: "User profile not found" });
        return;
      }
      const userProfile = userSnap.data()!;
      const linkedStudentIds: string[] = [
        userProfile.studentId,
        ...(userProfile.studentIds ?? []),
      ].filter(Boolean);

      const isLinked =
        linkedStudentIds.includes(feeRequest.studentId) ||
        ["super_admin", "admin", "accounts", "office_staff"].includes(userProfile.role);

      if (!isLinked) {
        res.status(403).json({ error: "Not authorized for this fee request" });
        return;
      }

      if (feeRequest.status === "paid") {
        res.status(400).json({ error: "This fee is already fully paid" });
        return;
      }

      // Calculate remaining amount server-side (fine not included here — fine is baked into
      // the stored fineAmount on the request when it exists; client passes current fine separately)
      const fineAmount: number = typeof feeRequest.fineAmount === "number" ? feeRequest.fineAmount : 0;
      const remaining =
        feeRequest.totalAmount + fineAmount - (feeRequest.waivedAmount ?? 0) - (feeRequest.paidAmount ?? 0);

      if (remaining <= 0) {
        res.status(400).json({ error: "No outstanding balance for this fee request" });
        return;
      }

      const amountInPaise = Math.round(remaining * 100);
      if (amountInPaise < 100) {
        res.status(400).json({ error: "Minimum payment amount is ₹1" });
        return;
      }

      const order = await razorpay.orders.create({
        amount: amountInPaise,
        currency: (typeof currency === "string" && /^[A-Z]{3}$/.test(currency)) ? currency : "INR",
        receipt: `rcpt_${Date.now()}`,
      });

      // Persist order metadata in Firestore so verify can look it up without trusting the client
      await adminDb.collection("paymentOrders").doc(order.id as string).set({
        feeRequestId,
        expectedAmountPaise: amountInPaise,
        studentId: feeRequest.studentId,
        userId: req.firebaseUid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: Date.now() + 30 * 60 * 1000, // 30-minute window
      });

      res.json(order);
    } catch (error) {
      console.error("[payment/create-order] error:", (error as Error).message);
      res.status(500).json({ error: "Failed to create order" });
    }
  }
);

// POST /api/payment/verify
// Authenticated. Verifies signature, confirms amount via Razorpay API, writes records server-side.
app.post(
  "/api/payment/verify",
  paymentLimiter,
  requireAuth,
  async (req: AuthedRequest, res: Response) => {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

      if (
        typeof razorpay_order_id !== "string" ||
        typeof razorpay_payment_id !== "string" ||
        typeof razorpay_signature !== "string"
      ) {
        res.status(400).json({ error: "Missing payment fields" });
        return;
      }

      // 1. Look up the server-stored order metadata
      const orderMetaSnap = await adminDb.collection("paymentOrders").doc(razorpay_order_id).get();
      if (!orderMetaSnap.exists) {
        res.status(400).json({ error: "Order not found or expired" });
        return;
      }
      const orderMeta = orderMetaSnap.data()!;

      // Verify expiry
      if (Date.now() > orderMeta.expiresAt) {
        await orderMetaSnap.ref.delete();
        res.status(400).json({ error: "Payment session expired" });
        return;
      }

      // Verify the token user matches who created the order
      if (orderMeta.userId !== req.firebaseUid) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      // 2. Verify Razorpay HMAC signature (timing-safe)
      const sign = `${razorpay_order_id}|${razorpay_payment_id}`;
      const expectedSign = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
        .update(sign)
        .digest("hex");

      if (!timingSafeEquals(razorpay_signature, expectedSign)) {
        res.status(400).json({ success: false, error: "Invalid payment signature" });
        return;
      }

      // 3. Fetch the actual payment from Razorpay to confirm amount paid
      const paymentDetails = await razorpay.payments.fetch(razorpay_payment_id) as any;
      const actualAmountPaise: number = paymentDetails.amount;

      if (actualAmountPaise < orderMeta.expectedAmountPaise) {
        console.error(
          `[payment/verify] amount mismatch: expected ${orderMeta.expectedAmountPaise}, got ${actualAmountPaise} for order ${razorpay_order_id}`
        );
        res.status(400).json({ success: false, error: "Payment amount does not match" });
        return;
      }

      // 4. Fetch feeRequest to compute new status
      const feeRequestSnap = await adminDb.collection("feeRequests").doc(orderMeta.feeRequestId).get();
      if (!feeRequestSnap.exists) {
        res.status(404).json({ error: "Fee request no longer exists" });
        return;
      }
      const feeRequest = feeRequestSnap.data()!;

      const amountPaidRupees = actualAmountPaise / 100;
      const newPaidAmount = (feeRequest.paidAmount ?? 0) + amountPaidRupees;
      const fineAmount: number = typeof feeRequest.fineAmount === "number" ? feeRequest.fineAmount : 0;
      const totalRequired = feeRequest.totalAmount + fineAmount - (feeRequest.waivedAmount ?? 0);
      const newStatus = newPaidAmount >= totalRequired ? "paid" : "partially_paid";
      const now = new Date().toISOString();
      const receiptNumber = `REC-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;

      const batch = adminDb.batch();

      // Write feePayment
      const paymentRef = adminDb.collection("feePayments").doc();
      batch.set(paymentRef, {
        studentId: feeRequest.studentId,
        classId: feeRequest.classId ?? "",
        feeRequestId: orderMeta.feeRequestId,
        feeHead: feeRequest.heads?.[0]?.name ?? "Academic Fee",
        amount: amountPaidRupees,
        date: now.split("T")[0],
        method: "online",
        transactionId: razorpay_payment_id,
        receiptNumber,
        remarks: `Online Payment - ${feeRequest.month ?? ""}`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update feeRequest
      batch.update(feeRequestSnap.ref, {
        paidAmount: newPaidAmount,
        status: newStatus,
        updatedAt: now,
      });

      // Update student feeStatus if fully paid
      if (newStatus === "paid") {
        const studentRef = adminDb.collection("students").doc(feeRequest.studentId);
        batch.update(studentRef, { feeStatus: "paid", updatedAt: now });
      }

      await batch.commit();

      // Clean up the pending order record
      await orderMetaSnap.ref.delete();

      res.json({
        success: true,
        transactionId: razorpay_payment_id,
        receiptNumber,
        newStatus,
        amountPaid: amountPaidRupees,
      });
    } catch (error) {
      console.error("[payment/verify] error:", (error as Error).message);
      res.status(500).json({ error: "Verification failed" });
    }
  }
);

// ── Vite / static serving ─────────────────────────────────────────────────────
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[server] running on http://localhost:${PORT}`);
  });
}

startServer();
