# Admin scripts

One-off / occasional maintenance scripts. Each is a plain Node script (Node 18+,
no extra dependencies) that authenticates with the Firebase **service-account
JSON** — the same credential already configured in Vercel as
`FIREBASE_SERVICE_ACCOUNT`.

## Getting the service account

Firebase Console → ⚙️ Project settings → **Service accounts** → **Generate new
private key**. Save the downloaded file as `service-account.json` (it is
git-ignored). Alternatively copy the value of the `FIREBASE_SERVICE_ACCOUNT`
environment variable from Vercel.

> The key grants full admin access — never commit it or share it.

---

## `normalize-dotzero.mjs` — fix `.0` school-number logins

A batch of student/parent accounts were imported with a trailing `.0` baked into
their **Firebase Auth email** (e.g. `1234567.0@ehs.elnode.in`,
`p1234567.0@ehs.elnode.in`). Login authenticates against that Auth email, so
renaming the school number in the admin UI (which only touches Firestore) does
**not** fix their login.

This script:

1. **Pass 1 — Identity:** rewrites each `.0` Auth email to its clean form
   (`1234567@…`) and keeps `users/{uid}.email` in sync.
2. **Pass 2 — Display:** strips a trailing `.0` from `schoolNumber` (users) and
   `schoolNumber` / `admissionNumber` (students).

Safety: **dry-run by default**, collision-safe (a `.0` account whose clean email
already belongs to a *different* account is reported and skipped, never merged),
idempotent, surgical (only `^p?<digits>.0@<school|legacy domain>` is touched —
staff / Google / CA accounts are never affected), and passwords are preserved.

### Run it

```bash
# 1. DRY RUN — shows exactly what would change, writes an audit file, changes nothing
node scripts/normalize-dotzero.mjs --sa ./service-account.json
#   (or, using the Vercel env value:)
FIREBASE_SERVICE_ACCOUNT='<json>' npm run fix:dotzero

# 2. Review the plan printed in the console and dotzero-normalization-report.json

# 3. (Optional) Apply to just the first few accounts to be cautious
node scripts/normalize-dotzero.mjs --sa ./service-account.json --apply --limit 5

# 4. APPLY for real
node scripts/normalize-dotzero.mjs --sa ./service-account.json --apply
```

After applying, affected users log in with their **normal** school number. The
login screen also tolerates `.0` either way, so nothing breaks mid-migration.

Re-running is safe — once data is clean it reports "Nothing to apply".

**Conflicts** in the report mean two real accounts collide (a `.0` one and an
already-clean one for the same number) — these are genuine duplicates and need a
human decision; the script leaves them untouched.

---

## `deploy-rules.mjs` — publish `firestore.rules`

Publishes the repo's `firestore.rules` to the live project.

```bash
FIREBASE_SERVICE_ACCOUNT='<json>' npm run deploy:rules
```
