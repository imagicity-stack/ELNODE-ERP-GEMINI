#!/usr/bin/env node
/**
 * normalize-dotzero.mjs — one-off cleanup for ".0" school-number accounts.
 *
 * THE PROBLEM
 *   A batch of student/parent accounts were imported with a trailing ".0" baked
 *   into their Firebase Auth email (a spreadsheet/numeric artifact), e.g.
 *       1234567.0@ehs.elnode.in   (student)
 *       p1234567.0@ehs.elnode.in  (parent)
 *   Login authenticates against that Auth email. Renaming the school number in
 *   the admin UI only updates Firestore — it never renames the Auth account —
 *   so those users could not log in with their normal number.
 *
 * WHAT THIS DOES (two passes)
 *   Pass 1 — Identity:  rewrites each ".0" Auth email to its clean form and keeps
 *                       users/{uid}.email in lockstep with the Auth email.
 *   Pass 2 — Display:   strips a trailing ".0" from schoolNumber (users) and
 *                       schoolNumber / admissionNumber (students) so the records
 *                       and reports read cleanly.
 *
 * SAFETY
 *   - DRY RUN by default. Nothing changes unless you pass --apply.
 *   - Collision-safe: if the clean email already belongs to a *different*
 *     account (a genuine duplicate), it is reported and SKIPPED, never merged.
 *   - Idempotent: a second run after a successful apply finds nothing to do.
 *   - Surgical: only emails matching ^p?\d+\.0@{schoolDomain|legacyDomain}$ are
 *     touched. Staff / Google / CA accounts are never affected.
 *   - Passwords are preserved (an Auth email change keeps the password hash).
 *   - Writes a JSON audit file: dotzero-normalization-report.json
 *
 * USAGE
 *   # dry run (recommended first) — uses the same env var Vercel uses
 *   FIREBASE_SERVICE_ACCOUNT='<service-account-json>' node scripts/normalize-dotzero.mjs
 *
 *   # dry run from a key file
 *   node scripts/normalize-dotzero.mjs --sa ./service-account.json
 *
 *   # execute
 *   node scripts/normalize-dotzero.mjs --sa ./service-account.json --apply
 *
 *   # execute, but only the first N Auth rewrites (cautious first pass)
 *   node scripts/normalize-dotzero.mjs --sa ./service-account.json --apply --limit 5
 *
 * ENV
 *   FIREBASE_SERVICE_ACCOUNT          service-account JSON (string) — same value Vercel uses
 *   GOOGLE_APPLICATION_CREDENTIALS    OR a path to a service-account JSON file
 *   FIREBASE_DATABASE_ID / FIRESTORE_DATABASE_ID   override the Firestore database id
 *   SCHOOL_DOMAINS                    comma list to override the default domains
 *
 * The service account must be a Firebase Admin SDK key (it already powers the
 * Firestore writes in api/). It needs Identity Toolkit admin access, which the
 * default firebase-adminsdk service account has.
 */

import crypto from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

// ── Defaults mirrored from src/constants.ts ────────────────────────────────────
const DEFAULT_DOMAINS = ['ehs.elnode.in', 'eldenheights.org'];
const DEFAULT_DB_ID = 'ai-studio-cb22793f-2766-4225-bb0a-411c4a36f1b5';

// ── Args / config ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const hasFlag = (f) => argv.includes(f);
const flagVal = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };

const APPLY = hasFlag('--apply');
const LIMIT = flagVal('--limit') ? Math.max(0, parseInt(flagVal('--limit'), 10) || 0) : Infinity;
const SA_PATH = flagVal('--sa');
const DOMAINS = (process.env.SCHOOL_DOMAINS || DEFAULT_DOMAINS.join(','))
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const DB_ID = process.env.FIREBASE_DATABASE_ID || process.env.FIRESTORE_DATABASE_ID || DEFAULT_DB_ID;

// A ".0" email local-part: an optional parent "p" prefix, digits, then ".0".
const DOTZERO_EMAIL_RE = /^(p?)(\d+)\.0$/;
// A ".0" school-number / admission-number value: digits then ".0".
const DOTZERO_NUM_RE = /^(\d+)\.0$/;

function loadServiceAccount() {
  let raw;
  if (SA_PATH) raw = readFileSync(SA_PATH, 'utf8');
  else if (process.env.FIREBASE_SERVICE_ACCOUNT) raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) raw = readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8');
  else {
    console.error('No service account. Set FIREBASE_SERVICE_ACCOUNT, pass --sa <path>, or set GOOGLE_APPLICATION_CREDENTIALS.');
    process.exit(1);
  }
  let sa;
  try { sa = JSON.parse(raw); } catch (e) { console.error('Service account is not valid JSON:', e.message); process.exit(1); }
  if (typeof sa.private_key === 'string' && sa.private_key.includes('\\n')) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  if (!sa.client_email || !sa.private_key || !sa.project_id) { console.error('Service account JSON missing client_email / private_key / project_id.'); process.exit(1); }
  return sa;
}

// ── OAuth2 (service-account JWT → access token) ────────────────────────────────
function b64url(input) {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getAccessToken(sa) {
  const iat = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: sa.client_email,
    // datastore → Firestore REST; identitytoolkit → Auth admin (batchGet/update).
    scope: 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/identitytoolkit',
    aud: 'https://oauth2.googleapis.com/token',
    iat, exp: iat + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  const sig = b64url(signer.sign(sa.private_key));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${unsigned}.${sig}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`OAuth2 token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

// ── Identity Toolkit (Firebase Auth admin) ─────────────────────────────────────
async function authListAll(token, projectId) {
  const out = [];
  let pageToken = '';
  do {
    const url = `https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:batchGet?maxResults=1000`
      + (pageToken ? `&nextPageToken=${encodeURIComponent(pageToken)}` : '');
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`accounts:batchGet → ${r.status}: ${await r.text()}`);
    const j = await r.json();
    for (const u of j.users || []) out.push(u);
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}

async function authUpdateEmail(token, projectId, localId, email) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:update`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ localId, email }),
  });
  if (!r.ok) { const t = await r.text(); const e = new Error(`accounts:update → ${r.status}`); e.body = t; throw e; }
  return r.json();
}

// ── Firestore REST ─────────────────────────────────────────────────────────────
function fromFS(fields = {}) {
  const o = {};
  for (const [k, v] of Object.entries(fields)) {
    if ('stringValue' in v) o[k] = v.stringValue;
    else if ('integerValue' in v) o[k] = Number(v.integerValue);
    else if ('doubleValue' in v) o[k] = v.doubleValue;
    else if ('booleanValue' in v) o[k] = v.booleanValue;
    else if ('nullValue' in v) o[k] = null;
    // arrays/maps intentionally ignored — we never touch those fields here.
  }
  return o;
}

async function fsListAll(token, base, collection) {
  const out = [];
  let pageToken = '';
  do {
    const url = `${base}/${collection}?pageSize=300` + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`listDocuments ${collection} → ${r.status}: ${await r.text()}`);
    const j = await r.json();
    for (const d of j.documents || []) out.push({ id: d.name.split('/').pop(), data: fromFS(d.fields) });
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}

async function fsCommit(token, base, writes) {
  const r = await fetch(`${base}:commit`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes }),
  });
  if (!r.ok) throw new Error(`commit → ${r.status}: ${await r.text()}`);
  return r.json();
}

// ── Helpers (pure — exported for unit tests) ───────────────────────────────────
export function classifyEmail(email, domains = DOMAINS) {
  const at = (email || '').lastIndexOf('@');
  if (at < 0) return null;
  const local = email.slice(0, at).toLowerCase();
  const domain = email.slice(at + 1).toLowerCase();
  if (!domains.includes(domain)) return null;
  return { local, domain };
}

// The clean email for a ".0" address, or null if it isn't one of ours.
export function cleanEmailFor(email, domains = DOMAINS) {
  const c = classifyEmail(email, domains);
  if (!c) return null;
  const m = c.local.match(DOTZERO_EMAIL_RE);
  if (!m) return null;
  return `${m[1]}${m[2]}@${c.domain}`;
}

const sample = (arr, n = 12) => arr.slice(0, n);

/**
 * Pure planner: given the downloaded Auth users and Firestore users/students
 * docs, compute exactly what would change. No I/O — safe to unit-test.
 */
export function computePlan(authUsers, usersDocs, studentDocs, { domains = DOMAINS, limit = LIMIT } = {}) {
  // Map of existing emails → localId, used to detect collisions with clean targets.
  const emailToLocal = new Map();
  for (const u of authUsers) if (u.email) emailToLocal.set(u.email.toLowerCase(), u.localId);

  // Auth rewrites + conflicts.
  const rewrites = [];   // { localId, from, to }
  const conflicts = [];  // { localId, from, to, holder, reason }
  const targetSeen = new Map(); // cleanEmail(lower) → localId already queued
  for (const u of authUsers) {
    const to = u.email ? cleanEmailFor(u.email, domains) : null;
    if (!to) continue;
    const key = to.toLowerCase();
    const holder = emailToLocal.get(key);
    if (holder && holder !== u.localId) {
      conflicts.push({ localId: u.localId, from: u.email, to, holder, reason: 'clean email already exists' });
    } else if (targetSeen.has(key) && targetSeen.get(key) !== u.localId) {
      conflicts.push({ localId: u.localId, from: u.email, to, holder: targetSeen.get(key), reason: 'two ".0" accounts map to the same clean email' });
    } else {
      rewrites.push({ localId: u.localId, from: u.email, to });
      targetSeen.set(key, u.localId);
    }
  }
  const limitedRewrites = Number.isFinite(limit) ? rewrites.slice(0, limit) : rewrites;
  const intendedRewriteByLocal = new Map(limitedRewrites.map((r) => [r.localId, r.to.toLowerCase()]));

  // users/{uid}: email kept in lockstep with Auth + schoolNumber ".0" strip.
  const userUpdates = []; // { id, fields, mask, detail, emailFromRewrite }
  for (const ud of usersDocs) {
    const fields = {}; const mask = []; const detail = []; let emailFromRewrite = false;

    // email: target = clean form of the rewritten Auth email (case a), or the
    // clean form of a ".0" email value stored on the doc (case b). Surgical:
    // only ".0"-related rows are touched.
    let targetEmail = null;
    if (intendedRewriteByLocal.has(ud.id)) { targetEmail = intendedRewriteByLocal.get(ud.id); emailFromRewrite = true; }
    else if (typeof ud.data.email === 'string') targetEmail = cleanEmailFor(ud.data.email, domains);
    if (targetEmail && (ud.data.email || '').toLowerCase() !== targetEmail) {
      fields.email = { stringValue: targetEmail }; mask.push('email');
      detail.push(`email ${ud.data.email || '∅'} → ${targetEmail}`);
    }

    if (typeof ud.data.schoolNumber === 'string' && DOTZERO_NUM_RE.test(ud.data.schoolNumber)) {
      const clean = ud.data.schoolNumber.replace(/\.0$/, '');
      fields.schoolNumber = { stringValue: clean }; mask.push('schoolNumber');
      detail.push(`schoolNumber ${ud.data.schoolNumber} → ${clean}`);
    }

    if (mask.length) userUpdates.push({ id: ud.id, fields, mask, detail, emailFromRewrite });
  }

  // students/{id}: schoolNumber + admissionNumber ".0" strip.
  const studentUpdates = []; // { id, fields, mask, detail }
  for (const sd of studentDocs) {
    const fields = {}; const mask = []; const detail = [];
    for (const f of ['schoolNumber', 'admissionNumber']) {
      if (typeof sd.data[f] === 'string' && DOTZERO_NUM_RE.test(sd.data[f])) {
        const clean = sd.data[f].replace(/\.0$/, '');
        fields[f] = { stringValue: clean }; mask.push(f);
        detail.push(`${f} ${sd.data[f]} → ${clean}`);
      }
    }
    if (mask.length) studentUpdates.push({ id: sd.id, fields, mask, detail });
  }

  return { rewrites, limitedRewrites, conflicts, userUpdates, studentUpdates, intendedRewriteByLocal };
}

// ── Main ─────────────────────────────────────────────────────────────────────────
async function main() {
  const sa = loadServiceAccount();
  const token = await getAccessToken(sa);
  const base = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/${DB_ID}/documents`;
  const docPrefix = `projects/${sa.project_id}/databases/${DB_ID}/documents`;
  const docName = (col, id) => `${docPrefix}/${col}/${id}`;

  console.log(`\n=== ".0" school-number normalization ===`);
  console.log(`Project : ${sa.project_id}`);
  console.log(`Database: ${DB_ID}`);
  console.log(`Domains : ${DOMAINS.join(', ')}`);
  console.log(`Mode    : ${APPLY ? 'APPLY (will mutate live data)' : 'DRY RUN (no changes)'}${Number.isFinite(LIMIT) ? `, limit ${LIMIT}` : ''}\n`);

  // 1) Download every Auth account + load Firestore users/students.
  const authUsers = await authListAll(token, sa.project_id);
  console.log(`Auth accounts: ${authUsers.length}`);
  const usersDocs = await fsListAll(token, base, 'users');
  const studentDocs = await fsListAll(token, base, 'students');
  console.log(`Firestore users: ${usersDocs.length}; students: ${studentDocs.length}`);

  // 2) Compute the full plan (pure — see computePlan / its unit tests).
  const { rewrites, limitedRewrites, conflicts, userUpdates, studentUpdates } =
    computePlan(authUsers, usersDocs, studentDocs, { domains: DOMAINS, limit: LIMIT });

  // 5) Report the plan.
  console.log('\n──────────────── PLAN ────────────────');
  console.log(`Auth emails to rewrite : ${limitedRewrites.length}${rewrites.length > limitedRewrites.length ? ` (of ${rewrites.length}; capped by --limit)` : ''}`);
  console.log(`Conflicts (skipped)    : ${conflicts.length}`);
  console.log(`users docs to update   : ${userUpdates.length}`);
  console.log(`students docs to update: ${studentUpdates.length}`);
  if (limitedRewrites.length) { console.log('\nAuth rewrites (sample):'); for (const r of sample(limitedRewrites)) console.log(`  ${r.from}  →  ${r.to}`); }
  if (conflicts.length) { console.log('\nConflicts — NOT changed, review manually (likely true duplicate accounts):'); for (const c of sample(conflicts)) console.log(`  ${c.from}  →  ${c.to}  [${c.reason}; held by ${c.holder}]`); }
  if (userUpdates.length) { console.log('\nusers updates (sample):'); for (const u of sample(userUpdates)) console.log(`  users/${u.id}: ${u.detail.join('; ')}`); }
  if (studentUpdates.length) { console.log('\nstudents updates (sample):'); for (const s of sample(studentUpdates)) console.log(`  students/${s.id}: ${s.detail.join('; ')}`); }

  // 6) Write the audit file.
  const report = {
    generatedAt: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    project: sa.project_id, database: DB_ID, domains: DOMAINS,
    counts: {
      authAccounts: authUsers.length,
      rewritesTotal: rewrites.length, rewritesPlanned: limitedRewrites.length,
      conflicts: conflicts.length, userUpdates: userUpdates.length, studentUpdates: studentUpdates.length,
    },
    rewrites: limitedRewrites,
    conflicts,
    userUpdates: userUpdates.map((u) => ({ id: u.id, detail: u.detail })),
    studentUpdates: studentUpdates.map((s) => ({ id: s.id, detail: s.detail })),
  };
  writeFileSync('dotzero-normalization-report.json', JSON.stringify(report, null, 2));
  console.log('\nAudit written → dotzero-normalization-report.json');

  if (!APPLY) {
    console.log('\nDRY RUN only — nothing was changed. Re-run with --apply to perform these changes.\n');
    return;
  }

  if (!limitedRewrites.length && !userUpdates.length && !studentUpdates.length) {
    console.log('\nNothing to apply — data is already clean. ✓\n');
    return;
  }

  // 7) APPLY — Pass 1: rewrite Auth emails.
  console.log('\n──────────────── APPLY ────────────────');
  console.log(`Pass 1 — rewriting ${limitedRewrites.length} Auth email(s)...`);
  const succeeded = new Set();
  const authFailures = [];
  let i = 0;
  for (const r of limitedRewrites) {
    i++;
    try {
      await authUpdateEmail(token, sa.project_id, r.localId, r.to);
      succeeded.add(r.localId);
      console.log(`  [${i}/${limitedRewrites.length}] ${r.from} → ${r.to}  ✓`);
    } catch (e) {
      const msg = (e.body || e.message || '').slice(0, 160);
      authFailures.push({ ...r, error: msg });
      console.log(`  [${i}/${limitedRewrites.length}] ${r.from} → ${r.to}  ✗ ${msg}`);
    }
  }

  // 8) APPLY — Pass 2: commit Firestore field updates.
  //    Drop email changes whose Auth rewrite failed (keep users.email == Auth).
  const writes = [];
  for (const u of userUpdates) {
    const fields = { ...u.fields };
    let mask = [...u.mask];
    if (mask.includes('email') && u.emailFromRewrite && !succeeded.has(u.id)) {
      delete fields.email; mask = mask.filter((m) => m !== 'email');
    }
    if (mask.length) writes.push({ update: { name: docName('users', u.id), fields }, updateMask: { fieldPaths: mask }, currentDocument: { exists: true } });
  }
  for (const s of studentUpdates) {
    writes.push({ update: { name: docName('students', s.id), fields: s.fields }, updateMask: { fieldPaths: s.mask }, currentDocument: { exists: true } });
  }

  console.log(`\nPass 2 — committing ${writes.length} Firestore field update(s)...`);
  let committed = 0;
  for (let j = 0; j < writes.length; j += 200) {
    const chunk = writes.slice(j, j + 200);
    await fsCommit(token, base, chunk);
    committed += chunk.length;
    console.log(`  committed ${committed}/${writes.length}`);
  }

  console.log(`\n✅ DONE. Auth rewrites: ${succeeded.size} ok, ${authFailures.length} failed. Firestore docs updated: ${writes.length}.`);
  if (authFailures.length) {
    console.log('\nAuth failures (review):');
    for (const f of authFailures) console.log(`  ${f.from} → ${f.to}: ${f.error}`);
  }
  console.log('');
}

// Run only when invoked directly (so unit tests can import the pure helpers
// without triggering the live migration).
const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly || process.argv[1]?.endsWith('normalize-dotzero.mjs')) {
  main().catch((e) => { console.error('\nFATAL:', e.message); process.exit(1); });
}
