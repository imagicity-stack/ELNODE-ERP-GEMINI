import express, { Request, Response, NextFunction } from "express";
import path from "path";
import cors from "cors";
import Razorpay from "razorpay";
import crypto from "crypto";
import dotenv from "dotenv";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { initializeApp, cert, applicationDefault, App, getApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import fs from "fs";

dotenv.config();

// ── Load Firebase Config ──────────────────────────────────────────────────────
const configPath = path.join(process.cwd(), "firebase-applet-config.json");
let firebaseAppletConfig: any = {};
if (fs.existsSync(configPath)) {
  try {
    firebaseAppletConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch (e) {
    console.warn("[server] Could not parse firebase-applet-config.json:", e);
  }
}

// ── Startup environment guard ─────────────────────────────────────────────────
const REQUIRED_ENV = ["VITE_RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET"];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length) {
  console.warn(`[server] WARNING: missing environment variables for payments: ${missing.join(", ")}. Payment features will be disabled.`);
  // We don't process.exit(1) here anymore to allow the app to boot and show the UI
}

// ── Firebase Admin ────────────────────────────────────────────────────────────
const projectId = process.env.FIREBASE_PROJECT_ID || firebaseAppletConfig.projectId || process.env.VITE_FIREBASE_PROJECT_ID;
const databaseId = process.env.FIREBASE_DATABASE_ID || firebaseAppletConfig.firestoreDatabaseId || process.env.VITE_FIREBASE_DATABASE_ID;

let adminApp: App;
try {
  if (getApps().length === 0) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    adminApp = initializeApp({
      credential: serviceAccountJson ? cert(JSON.parse(serviceAccountJson)) : applicationDefault(),
      projectId: projectId,
    });
  } else {
    adminApp = getApp();
  }
} catch (e) {
  console.error("[server] Firebase Admin SDK initialization failed:", e);
  // Do not exit, allow server to run but API routes will fail with clear errors
}

// @ts-ignore - adminApp is used to get the specific firestore instance
const adminDb = getFirestore(adminApp!, (databaseId && databaseId !== "(default)") ? databaseId : undefined);

// ── Razorpay ──────────────────────────────────────────────────────────────────
let razorpay: Razorpay | null = null;
if (process.env.VITE_RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  try {
    razorpay = new Razorpay({
      key_id: process.env.VITE_RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  } catch (e) {
    console.error("[server] Failed to initialize Razorpay:", e);
  }
}

// ── Express app ───────────────────────────────────────────────────────────────
const app = express();
const PORT = 3000;

// Trust Proxy — REQUIRED for rate limiting to work behind Cloud Run/Nginx
app.set("trust proxy", 1);

// Security Middleware (Helmet)
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP in dev/preview as it can block Vite assets
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Global Rate Limiting
const globalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});
app.use(globalLimiter);

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
    const decoded = await getAuth(adminApp).verifyIdToken(token);
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

      if (!razorpay) {
        res.status(503).json({ error: "Payment service unavailable" });
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
        createdAt: FieldValue.serverTimestamp(),
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

      if (!razorpay) {
        res.status(503).json({ error: "Payment service unavailable" });
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
        createdAt: FieldValue.serverTimestamp(),
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
    const { createServer: createViteServer } = await import("vite");
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
