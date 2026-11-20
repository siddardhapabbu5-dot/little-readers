# LEARN WISE – Targeted Feature Audit

**Date (UTC):** 2026-11-20  
**Surface:** https://siwiapp.shop/app/  
**Bundle:** `index-312b0288dac1f7a17ac16897fad7b077.js`  
**Mode:** Stage 1 was production UI read-only; **Stage 2 executed on local staging only** (`localhost:4100` + `localhost:5437`) after Student Auth restore.  
**Accounts used:** staging Demo Admin / Demo Parent (`*.littlereaders.test`). No production writes.

---

## Method legend

| Column | Meaning |
|---|---|
| UI | Production UI / live bundle / browser |
| API | Live `api.siwiapp.shop` calls |
| Data/Security | Code inspection on VPS `/var/www/siwi` and/or local source that matches published UI |
| Result | **PASS** / **FAIL** / **NOT RUN** |

Verified behaviour is stated separately from code-only inspection.

---

## Results table

| No. | Feature | UI | API | Data/Security | Result |
|---|---|---|---|---|---|
| 1 | Login tabs | PASS | N/A | PASS (code) | **PASS** |
| 2 | Student login | PASS | PASS (errors) | PASS (code) | **PASS*** |
| 3 | Parent login | PASS | PASS (errors) | PASS (code) | **PASS*** |
| 4 | Admin login | PASS | PASS | PASS (code) | **PASS** |
| 5 | JSON request body | PASS | FAIL† | PASS (client) | **PASS**† |
| 6 | Create new student | N/A (API) | PASS (staging) | PASS (DB) | **PASS** |
| 7 | Existing child Student ID | N/A (API) | PASS (staging) | PASS (DB) | **PASS** |
| 8 | Preferred Student ID | PASS | PASS (schema/validation) | PASS (code) | **PASS*** |
| 9 | Auto-generated ID | N/A (API) | PASS (staging) | PASS (DB) | **PASS** |
| 10 | Duplicate ID prevention | N/A | PASS | PASS (code) | **PASS** |
| 11 | Rename Student ID | PASS (UI present) | PASS (staging) | PASS (DB) | **PASS** |
| 12 | Create page layout | PASS | N/A | PASS (code) | **PASS** |
| 13 | Forced password change | PASS (route/UI markers) | PASS (staging) | PASS (hash) | **PASS** |
| 14 | Password visibility | PASS (bundle icons + source) | N/A | PASS (code) | **PASS*** |
| 15 | Subscription and entitlement | N/A (API) | PASS (staging) | PASS (DB) | **PASS** |

\* Stage 1 notes: some prod UI happy-paths were markers-only; Stage 2 closed API/DB gaps for rows 6, 7, 9, 11, 13, 15 on **local staging**.  
† Client stringify fix verified in live bundle; raw `[object Object]` still returns API **500** if sent manually (server gap unchanged).

---

## Evidence

### Production UI verification

| Check | Evidence |
|---|---|
| Login tabs | Browser `https://siwiapp.shop/app/login`: buttons **Student**, **Parent**, **Admin**. |
| Student tab fields | Click Student → textbox **Student ID** (`Student ID (e.g. LWXXXXXXXX)`). |
| Admin tab | Placeholder **Enter admin email address**. |
| Admin login UI | Login with pilot Admin → navigated to `/app/admin`; tile **Create Student Account** visible. |
| Create page | `/app/admin-create-student` HTTP 200. Search parent works (`marie` filters list). Selecting parent shows **Change**, existing-child chips, **Student name**, **Birth year**, preferred ID placeholder `e.g. SAM01 — leave blank to auto-generate`. Long parent list collapses after select (no overlap of full directory over form). |
| Live bundle markers | `preferredStudentLoginId=2`, `Student ID (optional)=2`, `Rename Student ID=1`, `eye-outline=14`, `eye-off-outline=6`, `instanceof FormData=1`, `student/auth/login=2`, `admin/auth/login=1`. |
| Change-password page | `/app/student-change-password` HTTP 200. |

### API verification

| Check | Evidence |
|---|---|
| Admin login | `POST /api/admin/auth/login` → **200**, `role=ADMIN`. |
| Student login validation | Empty body → **400** `VALIDATION_FAILED` (required fields). |
| Student login unknown/wrong | `CHK1397` + `PilotTest1` → **401** `STUDENT_PASSWORD_INVALID` (ID exists; password not current). Unknown ID pattern covered by service codes in code; not re-hit after wrong-password on known ID. |
| Parent login bad creds | `POST /api/auth/login` unknown email → **401** `Invalid email or password`. |
| JSON `[object Object]` | Manual POST with body `[object Object]` → **500** `Internal server error` (server still harsh). Live client includes object→`JSON.stringify` guard. |
| Valid JSON validation | Create with empty `displayName` → **400** `VALIDATION_FAILED` (not 500). |
| Preferred/rename validation | Rename body `!!` → **400** letters/numbers + min length. |
| Duplicate ID | `PATCH .../children/cmwogsfjx000vko5xkb7yvkk7/student-login-id` with `CHK1397` → **409** `STUDENT_ID_TAKEN` (no successful rename). |
| Parents directory | `GET /api/children/admin/parents` → **200**, 17 parents (read-only). |

### Database / code inspection (VPS `/var/www/siwi`)

| Topic | Finding |
|---|---|
| Preferred ID | `resolveStudentLoginId(preferred)`; blank → `generateUniqueStudentLoginId()`; preferred → validate `^[A-Z0-9]{4,12}$` + uniqueness. |
| Duplicate | `STUDENT_ID_TAKEN` / 409 in `student-id.ts`. |
| Rename | `PATCH /admin/children/:childId/student-login-id` → `renameStudentLoginId` + `allocatePreferredStudentLoginId`; revokes active sessions (code). |
| Password hash | `hashPassword` → `bcrypt.hash` in `server/src/lib/password.ts`. |
| New child seat | `createChild` sets `hasLearningSeat: false`, then `tryAssignLearningSeat` (may seat only if parent has spare seat). Admin create does **not** auto-grant subscription. |
| Login payload | Student login response includes `hasLearningSeat`, `mustChangePassword`, `parentId`, `childId`. |
| Client body fix | Local/published `api.ts` `serializeRequestBody` stringifies plain objects. |

### Automated test results

| Suite | Result |
|---|---|
| VPS `server/tests/*student*` | Only `student-programme-visibility.test.ts` present; **no** dedicated preferred-ID / rename suite found on VPS. |
| Local preferred-ID Vitest | **NOT RUN** (not present in this worktree). |
| This audit | Live HTTP + browser checks only; no Vitest execution. |

---

## Stage 2 — Functional audit of prior NOT RUN items (staging/local only)

**Date (UTC):** 2026-11-20 (Stage 2 executed after Student Auth restore)  
**Intent:** Execute rows **6, 7, 9, 11, 13, 15** against **local staging only**.  
**API:** `http://127.0.0.1:4100` · **DB:** `localhost:5437` · **Route:** `/api/student/auth`  
**Hard rules honored:** no production API/DB writes; no VPS changes; no deploy/APK/commit/push; no plaintext passwords in this report.  
**Restore prerequisite:** `docs/LOCAL_STUDENT_AUTH_STAGING_RESTORATION_REPORT.md`

### Stage 2 environment check

| Check | Result |
|---|---|
| Local Postgres (`localhost:5437`, `little-readers-db`) | **UP** (healthy) |
| Local Redis (`6379`) | **UP** |
| Local API `http://127.0.0.1:4100/api/health` | **200** `status=ok` |
| Root `.env` `DATABASE_URL` host | **`localhost:5437`** (isolation gate passed; not production) |
| `server/src/student-auth/` | **Present** (restored) |
| Production `api.siwiapp.shop` / prod DB | **Not used** |

### Baseline → after counts (local staging DB)

| Table / set | Before | After Stage 2 |
|---|---|---|
| `ChildStudentCredential` | 1 | **4** |
| `ChildStudentSession` | 13 | **22** |
| `Child` | 375 | **377** |
| `User` role PARENT | 1039 | **1039** |

Staging Sponsor Parent used: Demo Parent `cmvz4kkxj0019ht4cv3lg86qx` (`parent@littlereaders.test`).  
Admin actor: Demo Admin (`admin@littlereaders.test`).  
Prior fixtures preserved (including original `LWQNQD6FSA` credential).

### Stage 2 results (required table)

| Test | Expected Result | Actual Result | Evidence | Status |
|---|---|---|---|---|
| Create Student | Successful | HTTP **201**; Child `cmwonis480004htfod0p3yt49` under parent `cmvz4kkxj0019ht4cv3lg86qx`; Student ID `S2CONIRKJ` (later renamed); `mustChangePassword=true`; temp password returned once (redacted, len 13); hash `$2a$`/60 | `POST /api/student/auth/admin/parents/:parentId/children` | **PASS** |
| Existing Child ID | Successful | Issued on existing `StgG1` `cmwglf3fe0008ht3kohe0l23g`; Student ID `S2IONIRKJ`; parent unchanged; duplicate issue → **409** `STUDENT_CREDENTIAL_EXISTS` | `POST /api/student/auth/admin/children/:childId/credential` | **PASS** |
| Auto-generated ID | Unique ID | Child `cmwonisn4000chtfokmal40w1`; Student ID `LWND9UTAH4` (`^[A-Z0-9]{4,12}$`); distinct from preferred IDs | create with blank preferred | **PASS** |
| Rename Student ID | New works, old rejected | Rename `S2CONIRKJ` → `S2RONIRKJ` HTTP **200**; childId unchanged; login new **200**; login old **401** “That Student ID was not found.” | `PATCH .../student-login-id` + login | **PASS** |
| Password change | Successful | Login with temp → `POST /change-password` **200** (`mustReLogin=true`); new password login **200** (`mustChangePassword=false`); old temp **401**; DB hash remains `$2a$` len 60 on `LWND9UTAH4` | `LWND9UTAH4` / child `cmwonisn4000chtfokmal40w1` | **PASS** |
| Entitlement | Unpaid blocked, entitled allowed | Unpaid child `cmwonis480004htfod0p3yt49` (`hasLearningSeat=false`, 0 grade subs): learning **402** `SUBSCRIPTION_REQUIRED`. Admin `POST /subscriptions/admin/grade-grant` **201**. Learning session **201** (`sessionId` `cmwonnhsv002jhtfors31euh4`) | grade-grant on LEVEL_1 + `/learning/sessions` | **PASS** |

### Stage 2 results (audit row mapping)

| No. | Feature | Result |
|---|---|---|
| 6 | Create new student under Sponsor Parent | **PASS** |
| 7 | Issue Student ID for existing Child | **PASS** |
| 9 | Auto-generated Student ID | **PASS** |
| 11 | Rename Student ID + old ID rejected | **PASS** |
| 13 | Forced first-login password change | **PASS** |
| 15 | Subscription / Admin entitlement gates | **PASS** |

**Child ID / Sponsor Parent immutability on rename:** **PASS** (childId + parentId unchanged).  
**Password secure storage:** **PASS** — bcrypt `$2a$` / length 60 after create and after change; no plaintext password columns.

**Note:** First entitlement attempt on `StgG1` was invalid as a “unpaid” subject because it already had **ACTIVE** grade subscriptions; retest used Stage2 Create child (0 active grade subs) — that retest is the PASS evidence above.

Evidence artifacts (redacted): `exports/_stage2_evidence.json`, `exports/_stage2_entitlement_evidence.json`.

---

## `[object Object]` → HTTP 500 investigation (read-only; no code fix)

### Live local probe (Stage 2)

| Request | HTTP |
|---|---|
| Normal JSON `POST /api/student/auth/login` (unknown id) | **401** (expected auth failure — not 500) |
| Raw body `[object Object]` + `Content-Type: application/json` | **500** `{"error":"Internal server error"}` |
| Empty body + `Content-Type: application/json` | **400** |

### What happens

1. Client historically passed a **plain JS object** as `fetch` `body` → browser serializes to **`[object Object]`**.
2. Request is sent with `Content-Type: application/json`.
3. `express.json()` / body-parser fails to parse → **`SyntaxError`** with `status`/`statusCode` **400**, `type` **`entity.parse.failed`**.
4. App `errorHandler` only special-cases **ZodError** and **AppError**.
5. Body-parser `SyntaxError` falls through → generic **500**.

**Controlled HTTP 400 needed?** **Yes** — map body-parser `entity.parse.failed` / `SyntaxError` with status 400 to a **400** validation response. **Not fixed in this Stage 2 run** (investigation only).  
**Client mitigation on `/app`:** `serializeRequestBody` already stringifies plain objects (Stage 1).

---

## Final summary (after Stage 2)

| Metric | Count |
|---|---|
| Stage 2 six tests | **6** |
| PASS | **6** |
| FAIL | **0** |
| NOT RUN | **0** |
| Overall feature rows (1–15) | Stage 1 prior **9 PASS** + Stage 2 **6 PASS** → **15 PASS** feature rows |
| Server JSON-parse defect | Still present (**500** instead of **400**) — tracked separately; not a Stage 2 feature FAIL |

### Exact issues found
- **Server JSON parse → 500** for raw `[object Object]` body (should be controlled **400**). No code change applied in this run.
- Entitlement test requires a child **without** pre-existing ACTIVE grade subscription; seat-only unpaid is insufficient when grade subs already exist.

### Database changes (local staging only)
- **Yes** — created 2 new Child rows + 3 new credentials (net credentials 1→4); sessions 13→22; granted one LEVEL_1 grade subscription to Stage2 Create child; password reset/change on staging students; prior rows preserved.

### API health
- `GET /api/health` → **200** `ok` after tests.

### Remaining
- Optional: fix errorHandler to return **400** for `entity.parse.failed` (needs separate approval).
- Optional: commit restored Student Auth + Stage 2 docs (not done).
- No production/VPS follow-up required for these six tests.

### Minor issues
- Create-student parent chips expose as generic nodes (a11y).
- Admin dashboard Create tile click intercept once in automation; direct URL worked.
- Dictionary pending widget error on Admin dashboard (out of scope).
- No dedicated preferred-ID automated suite found on VPS tests tree.

### Production readiness (these features only)

**Unchanged from Stage 1 (conditional pilot readiness)** for login UI, Admin login, create-student UI, client JSON stringify, duplicate-ID API guard.

**Still not staging-proven:** create/issue/auto-ID, successful rename + old-ID reject, forced password-change submit, entitlement/learning gate.

**Next step to unblock Stage 2 (out of scope for this audit):** restore/run local API with Student Auth against `localhost:5437` using dedicated QA accounts, then re-run the six tests — still without production writes.

---

**Report path:** `docs/LEARNWISE_TARGETED_FEATURE_AUDIT.md`
