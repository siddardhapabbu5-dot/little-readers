# Little Readers — Admin Mobile Dashboard UI

**Date:** 2026-11-05  
**Plan:** `docs/audit/LITTLE_READERS_ADMIN_MOBILE_DASHBOARD_UI_PLAN.md`  
**Platform:** Expo / React Native (`apps/mobile`)  
**Constraint:** No Parent/Child redesign, no website UI changes, no fabricated stats, AuthGate + backend RBAC preserved.

---

## 1. Status summary

| Area | Status |
|------|--------|
| Admin dashboard redesign (`/admin`) | **IMPLEMENTED** |
| Stats wired to live APIs | **IMPLEMENTED** |
| Quick Actions → existing destinations | **IMPLEMENTED** |
| Recent Activity (composed from live APIs) | **IMPLEMENTED** (no dedicated activity API) |
| Admin bottom navigation (5 tabs) | **IMPLEMENTED** |
| Payments list screen | **IMPLEMENTED** |
| Reports product | **PARTIAL** — honest empty (no reports API) |
| Dedicated Teachers / Classrooms screens | **PARTIAL** — reuse `/admin-schools` |
| Mobile TypeScript | **TESTED** — **PASS** |
| Related server API tests | **TESTED** — **14 PASS / 0 FAIL** |
| Physical Android / iPhone UI QA | **NOT TESTED** |
| Screenshots | **NOT TESTED** / not captured this session |

**Overall:** **COMPLETED** for the dashboard UI implementation against existing APIs. Not claimed device-verified.

### Visual polish pass (mockup alignment)

Closer match to the supplied Admin Dashboard reference image:
- Solid purple header with curved white wave
- Shield + title block (no card chrome)
- Stat cards: large number + short label (`Schools`, `Revenue (This Month)`)
- Quick Actions as full-width pastel rows
- Activity list with relative times (`2h ago`) and time on the right
- Bottom tabs: home icon + purple underline (no bubble)
- Primary `#5D3FD3`

---

## 2. Files created and modified

### Created
| File | Purpose |
|------|---------|
| `apps/mobile/components/AdminTabBar.tsx` | Fixed Admin bottom nav (5 tabs, safe area) |
| `apps/mobile/app/admin-payments.tsx` | Live `GET /payments/admin` list |
| `apps/mobile/app/admin-reports.tsx` | Honest “not available yet” (no fake KPIs) |
| `apps/mobile/app/admin-settings.tsx` | Hub for existing admin tools + logout |
| `docs/audit/LITTLE_READERS_ADMIN_MOBILE_DASHBOARD_UI_PLAN.md` | Pre-impl plan |
| `docs/audit/LITTLE_READERS_ADMIN_MOBILE_DASHBOARD_UI.md` | This report |

### Modified
| File | Change |
|------|--------|
| `apps/mobile/app/admin.tsx` | Full premium dashboard UI |
| `apps/mobile/app/admin-schools.tsx` | AdminTabBar + header polish; CRUD preserved |
| `apps/mobile/theme.ts` | `adminColors` design tokens |

---

## 3. Screens implemented

| Screen | Route | Notes |
|--------|-------|-------|
| Admin Dashboard | `/admin` | Gradient header, stats, quick actions, activity, more tools |
| Schools | `/admin-schools` | Existing create school / teacher / classroom |
| Payments | `/admin-payments` | New list from payments admin API |
| Reports | `/admin-reports` | Empty / unavailable (API missing) |
| Settings | `/admin-settings` | Links to structure, words, lessons, dictionary, seats, devices, super-admin |

**Preserved (linked from Settings + “More admin tools”):**  
`admin-structure`, `admin-words`, `admin-lessons`, `admin-dictionary`, `admin-seats`, `devices`, `subscription`, `super-admin`.

---

## 4. APIs connected

| UI element | Endpoint | Notes |
|------------|----------|-------|
| Total Schools / Students / Teachers | `GET /admin/schools` | Sums `length`, `studentCount`, `teacherCount` |
| Monthly Revenue | `GET /payments/admin` | Sum `amountCents` where `status === SUCCEEDED` in current calendar month; format via `currency` (paise→major) |
| Recent Activity | schools + payments + `GET /subscriptions/admin` | Client-composed, sorted by date — **no fabricated rows** |
| Payments tab | `GET /payments/admin?take=100` | Real statuses |
| Auth | `AuthGate` + `GET /auth/me` | Parent/Teacher redirected; APIs still 403 unauthorized |

### Missing destinations / APIs (reported, not faked)

| Need | Finding |
|------|---------|
| Dedicated Manage Teachers screen | **Missing** — navigates to `/admin-schools` |
| Dedicated Manage Classrooms screen | **Missing** — navigates to `/admin-schools` |
| Admin notifications feed | **Missing** — bell explains no API |
| Platform reports / analytics API | **Missing** — Reports tab is honest empty |
| Unified activity feed | **Missing** — proposed: `GET /admin/activity` returning typed events (payment, school, teacher, enrollment, subscription) with cursor pagination. Current client merge is the smallest safe approach without schema changes. |

---

## 5. Navigation changes

- Added **AdminTabBar** on Dashboard, Schools, Payments, Reports, Settings.
- Kids `(tabs)` navigation **unchanged**.
- Profile → “Admin overview” still opens `/admin`.
- Quick Actions:
  - Manage Schools / Teachers / Classrooms → `/admin-schools`
  - View Payments → `/admin-payments`

---

## 6. Existing features preserved

- Admin / Super Admin / School Admin AuthGate roles  
- School CRUD + teacher + classroom create on mobile  
- Vocabulary / structure / lessons / dictionary / seats / devices / subscription screens  
- Super Admin route (Settings, SUPER_ADMIN only)  
- Backend authorization unchanged (no schema changes)  
- Parent and Child UIs not redesigned  
- Website UI not modified  

---

## 7. Design system applied

| Token | Value |
|-------|-------|
| Primary | `#5136D9` |
| Secondary | `#7555EA` |
| Background | `#F8F8FD` |
| Card | `#FFFFFF` |
| Text | `#17152F` / `#666783` |
| Border | `#E7E7F3` |
| Accents | Blue schools, green students, purple teachers, orange payments |

Uses existing `expo-linear-gradient` and `@expo/vector-icons` (Expo transitive). No new npm dependencies.

---

## 8. Test results

| Check | Result |
|-------|--------|
| `apps/mobile` `npm run typecheck` | **PASS** |
| Mobile unit/UI test suite | **NOT TESTED** — none present for Admin dashboard |
| `children-admin-authz` + `batch9-schools` + `batch10-payments` | **14 PASS / 0 FAIL** |
| Parent cannot call admin APIs | **PASS** (server 403 covered in suites) |
| Physical device layout / safe area | **NOT TESTED** |
| Screenshots of completed dashboard | **NOT TESTED** / unavailable |

---

## 9. Remaining issues

1. **Reports** remain unavailable until a real reports API exists.  
2. **Teachers / Classrooms** share Schools screen — optional dedicated screens later.  
3. **Notifications** bell is informational only.  
4. **Activity feed** is composed client-side; a dedicated `GET /admin/activity` would be cleaner.  
5. **Physical-device polish** (Dynamic Island, small Android widths) still needs manual QA.  
6. Reference image was not found in the repo; layout follows the written brief + design tokens.

---

## 10. Launch / product note

Admin mobile dashboard UI is **IMPLEMENTED** and type-checked. It does **not** by itself make Little Readers production-ready (EAS, device QA, Razorpay merchant E2E, hosting remain separate).

No live payments enabled. No store submission.
