# Claude Session Log — EL-NODE ERP

This file is maintained by Claude to preserve cross-session memory. Each session appends a new entry. Read this file at the start of any new session to recall context, decisions, and pending tasks.

---

## Project Identity

- **App name**: EL-NODE
- **School**: The Elden Heights School (EHS)
- **Domain**: ehs.elnode.in (legacy: eldenheights.org)
- **Repo**: imagicity-stack/ELNODE-ERP-GEMINI
- **Active dev branch**: `claude/fix-google-oauth-login-EVN9I`
- **Deploy target**: Vercel (auto-deploy on push) + Firebase (rules deployed manually)

---

## Super Admin UIDs (must stay in sync in both places below)

```
Sev825sC9HSFIBUlYN3SGIWHMss1   ← primary UID (main developer account)
8uTs7freEPaiVtywgpg5G9in4JF2
ldnsKSufIyOLFiyPhdmmIErNi7P2
```

**Sync locations:**
1. `src/constants.ts` → `SUPER_ADMIN_UIDS` array
2. `firestore.rules` → `isSuperAdminByUID()` function

Auto-provisioning logic lives in `src/App.tsx` — on first login, if UID is in the list but has no Firestore `users` doc, one is created from the Google profile automatically.

---

## Session 1 — 2026-05-19

**Branch:** `claude/fix-google-oauth-login-EVN9I`

### Completed work

| # | Task | File(s) changed |
|---|---|---|
| 1 | Fix `user.name[0]` crash on Profile page for auto-provisioned super admin | `src/pages/shared/ProfileSettings.tsx` |
| 2 | Fix second super admin UID not logging in (auto-provisioning was missing) | `src/App.tsx`, `src/constants.ts` |
| 3 | Replace transport textarea with School/Private dropdown in student form | `src/pages/admin/StudentManagement.tsx` |
| 4 | Add optional student email field to student entry form | `src/pages/admin/StudentManagement.tsx` |
| 5 | Make gender field optional in student form and CSV import | `src/pages/admin/StudentManagement.tsx` |
| 6 | Advanced student list filters: house, class, section, gender, transport | `src/pages/admin/StudentManagement.tsx` |
| 7 | Add House column + expandable detail rows to student list table | `src/pages/admin/StudentManagement.tsx` |
| 8 | Fix Leave button on student mobile dashboard pointing to wrong route | `src/pages/student/StudentDashboard.tsx` |
| 9 | Download as CSV respecting active filters | `src/pages/admin/StudentManagement.tsx` |
| 10 | Fix address field not saved during bulk CSV import | `src/pages/admin/StudentManagement.tsx` |
| 11 | Expand AI insights to full school data (was finance-only) | `src/lib/aiContext.ts`, `src/components/AIInsightsPanel.tsx`, `api/ai/chat.ts` |
| 12 | Fix AI "missing or insufficient permissions" — add `grievances` Firestore rule | `firestore.rules` |
| 13 | Fix AI giving wrong/empty data — correct `leaves` → `studentLeaves` collection name | `src/lib/aiContext.ts` |
| 14 | Full rewrite of AI context — individual student/teacher/staff/salary/expense records | `src/lib/aiContext.ts` |
| 15 | Rewrite README with complete ERP documentation | `README.md` |

### Key code patterns introduced

**`safeGet()` wrapper** (`src/lib/aiContext.ts`):
```typescript
async function safeGet(ref: any) {
  try { return await getDocs(ref); }
  catch { return { docs: [] }; }
}
```
Always use this for AI context fetches. Never use bare `getDocs` in `buildAIContext` — a single permission denied will crash the entire context build.

**`str()` helper** (`src/lib/aiContext.ts`):
```typescript
const str = (v: any) => (v == null ? '' : String(v));
```
Use for any field that might be undefined/null before putting it in the AI context JSON.

**Lookup maps** (`src/lib/aiContext.ts`):
Built once from `classes`, `houses`, `subjects` snapshots, then reused throughout:
```typescript
const classMap = new Map(classDocs.map(d => [d.id, d.data().name as string]));
const houseMap = new Map(houseDocs.map(d => [d.id, d.data().name as string]));
const subjectMap = new Map(subjectDocs.map(d => [d.id, d.data().name as string]));
const studentMap = new Map(studentDocs.map(d => [d.id, d.data().name as string]));
```

**Expandable student rows** (`src/pages/admin/StudentManagement.tsx`):
```typescript
const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
// Each row is a React.Fragment with a detail panel <tr> that renders when
// expandedStudentId === student.id
```

### Bugs fixed / root causes

| Bug | Root Cause | Fix |
|---|---|---|
| `user.name[0]` TypeError on Profile | Auto-provisioned super admin has no `name` field set | `(user.name \|\| user.email \|\| 'U')[0].toUpperCase()` |
| Address not saved in CSV import | `address: row.address` line was simply absent from `addDoc` call | Add `address: row.address \|\| ''` |
| Leave button wrong route | Route is `/student/leaves` (plural) but link was `/student/leave` | Fix `to` prop |
| AI "missing permissions" error | `grievances` collection had no `match` block in `firestore.rules` — fell to catch-all deny | Add explicit match block |
| AI `leaves` collection empty | Collection is named `studentLeaves`, not `leaves` | Fix collection name |
| AI context empty on any permission error | `Promise.all` throws if any one `getDocs` throws | Wrap all with `safeGet()` |

### Pending / must-do after this session

- [ ] **CRITICAL: Deploy Firestore rules** — `firebase deploy --only firestore:rules`
  The `grievances` rule was added to `firestore.rules` but production still has the old rules until deployed.

---

## Session 1.5 — 2026-05-19 (continuation)

### Advanced student filters + custom CSV export

Upgraded the student list filter system from single-select to fully multi-select with presence (tri-state) filters and a column-picker export modal. All in `src/pages/admin/StudentManagement.tsx`.

**State changes:**
- All filter values changed from `string` → `string[]` for true multi-select:
  - `filterClass`, `filterSection`, `filterHouse`, `filterGender`, `filterTransport`
- Added tri-state presence filters (`'any' | 'yes' | 'no'`):
  - `filterPhoto`, `filterAddress`, `filterMedical`, `filterAcademic`, `filterStudentEmail`, `filterParentEmail`
- Added export modal state: `exportModalOpen`, `exportScope` (filtered/all), `exportCols` (per-column boolean)

**New helper components** (defined at bottom of `StudentManagement.tsx`):
- `MultiSelectDropdown` — popover-style dropdown with checkbox rows, select-all/clear shortcuts, click-outside-to-close, color-coded selection ring
- `TriStateFilter` — 3-button toggle (any / yes / no) with icon and label, for presence filters
- `FilterChip` — color-coded chip with remove button, replaces all the per-filter chip rendering

**New filter logic:**
- `toggleArrayValue(arr, value)` helper for clean multi-select toggling
- `matchTri(state, hasValue)` helper for presence matching
- `availableSections` now unions sections from all selected classes
- Section selection auto-prunes invalid sections when classes change
- Search now also matches phone, parent email, student email, address (in addition to name/admission/parent names)

**Export modal:**
- Lets user pick scope: filtered students or all students
- Lets user pick which of 16 columns to include (Name, Admission No., School No., Class, Section, Gender, House, Father, Mother, Phone, Parent Email, Student Email, Transport, Address, Medical, Academic History)
- Select all / Clear shortcuts
- Headers in CSV use friendly labels (not internal keys)
- Filename suffix `_filtered` or `_all` based on scope

**Key code patterns introduced:**

```tsx
// Multi-select toggle helper
const toggleArrayValue = (arr: string[], value: string): string[] =>
  arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];

// Tri-state matcher
const matchTri = (state: TriState, hasValue: boolean) =>
  state === 'any' || (state === 'yes' && hasValue) || (state === 'no' && !hasValue);
```

**Commits pushed:**
- `5f9f3c1` or next available — `feat: advanced multi-select student filters + custom column CSV export`

---

### Commits pushed this session (most recent first)

```
0bd7e71  feat: include full individual records in AI context
fdc6363  fix: make AI context fault-tolerant against permission denied errors
a4b6461  fix: correct collection names and add grievances Firestore rule
b790647  feat: expand AI insights to full school data coverage
d88a1e3  fix: save address field during bulk CSV student import
5bf4aea  fix: leave button path + filtered CSV export for student list
c24dbb4  feat: add House column and expandable detail rows to student list
2f700d8  feat: advanced student list filters (class, section, house, gender, transport)
7423504  fix: make student gender optional in form and CSV import
c152f96  fix: update CSV template with studentEmail and transport columns
b2969a3  feat: transport dropdown (School/Private) + optional student email
3479a44  fix: guard against undefined user.name in ProfileSettings
fd469e3  fix: auto-provision super admin Firestore doc on first Google sign-in
```

---

## Known Architecture Notes

### Fee system
- Fee requests are generated per student per month. Each request has multiple `heads[]`.
- Payments are recorded against requests and can be partial.
- Advance payments book future months; they are consumed FIFO when the fee request for that month is generated. See `src/services/advancePaymentService.ts`.
- Fine calculation uses `fineSettings` collection — each head can have its own grace period and per-day fine rate.

### Auth flow
1. Firebase Google OAuth → `firebaseUser`
2. `App.tsx` looks up `users/{uid}` in Firestore
3. If not found AND UID is in `SUPER_ADMIN_UIDS` → auto-create doc
4. If not found and not super admin → sign out (no orphan accounts allowed)
5. `user` context is set from the Firestore doc, not from Firebase Auth directly

### Firestore rules structure
- `isSignedIn()`, `isAdmin()`, `isTeacher()`, `isParent()`, `isStudent()`, `isGrievanceOfficer()`, `isPrincipal()`, `isAccounts()` — all helpers in `firestore.rules`
- `isSuperAdminByUID()` — checks against hardcoded UID list in rules
- Super admin always gets full read/write via `isAdmin()` which checks `isSuperAdminByUID() || resource.data.role == 'super_admin'`

### AI context flow
1. `AIInsightsPanel.tsx` calls `buildAIContext()` from `src/lib/aiContext.ts` once on panel open
2. Result is passed as `context` field in POST body to `/api/ai/chat.ts`
3. Server injects context JSON into the first user message before sending to Gemini
4. Gemini streams SSE; the server pipes it through; the panel renders token-by-token

### CSV import — student
- Template headers: `name, admissionNumber, class, section, gender, fatherName, motherName, phone, email, studentEmail, house, transport, medicalNotes, academicHistory, address`
- `class` is matched by name to get `classId`; `house` is matched by name to get `houseId`
- Old column `transportDetails` still accepted (backwards-compat)
- `gender` and `transport` are optional

---

## How to Start a New Session

1. Read this file (`CLAUDE_SESSION_LOG.md`) first
2. Check `git log --oneline -10` to see where things left off
3. Check `git status` for any uncommitted work
4. Remind the user if Firestore rules need deploying (check the pending section above)
5. Append a new session entry to this log when work begins

---
