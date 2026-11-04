# Admin Mobile Dashboard UI — Implementation Plan

**Date:** 2026-11-05  
**Scope:** Expo mobile Admin dashboard redesign only (not Parent/Child, not website).  
**Status:** PLAN LOCKED before code changes.

---

## 1. Inspection summary

| Area | Finding |
|------|---------|
| Entry | `/admin` (`admin.tsx`) — list-style overview, AuthGate `ROLE_SETS.admin` |
| Existing admin routes | `admin-schools`, `admin-seats`, `admin-structure`, `admin-words`, `admin-lessons`, `admin-dictionary`, `super-admin` |
| Bottom nav today | Kids `(tabs)` only — **no Admin tab bar** |
| APIs | `GET /admin/schools` (counts), `GET /payments/admin`, `GET /subscriptions/admin`, `GET /children/admin/parents`, vocab/content admin |
| Activity feed API | **None** |
| Reports API | Stub (`server/src/reports`) — **no mobile/report endpoints** |
| Dedicated Teachers / Classrooms screens | **Missing** — managed inside `admin-schools` |
| Dedicated Payments screen | **Missing** on mobile (API exists) |
| Icons / gradient | `@expo/vector-icons` (via Expo), `expo-linear-gradient` already installed |
| Reference image | Not present in repo assets; implement from written design tokens in the brief |

---

## 2. Approach

1. **Redesign `/admin`** into the premium dashboard (header, stats, quick actions, recent activity, more-tools section).  
2. **Add `AdminTabBar`** shared on Admin primary screens — does not replace kids tabs.  
3. **Add real destinations only:**
   - `admin-payments.tsx` → `GET /payments/admin` (needed; API exists).  
   - `admin-settings.tsx` → links to existing admin tools + logout (no fake settings).  
   - `admin-reports.tsx` → honest empty state: no reports API (not a fake working reports product).  
4. **Quick Actions:** Schools / Teachers / Classrooms → `/admin-schools` (existing). Payments → `/admin-payments`.  
5. **Stats:** derive from `/admin/schools` + `/payments/admin` (SUCCEEDED this calendar month). No hardcoded design numbers.  
6. **Recent Activity:** client-compose from payments + schools (`createdAt`) + subscriptions — real rows only. Document proposed `GET /admin/activity` as future optional API.  
7. **Preserve** all existing admin tool links (structure, words, lessons, dictionary, seats, devices, subscription).  
8. Keep **AuthGate** + backend 403; no schema changes.

---

## 3. Files to touch

| File | Action |
|------|--------|
| `components/AdminTabBar.tsx` | Create |
| `app/admin.tsx` | Redesign dashboard |
| `app/admin-payments.tsx` | Create (real list) |
| `app/admin-reports.tsx` | Create (honest unavailable) |
| `app/admin-settings.tsx` | Create (hub + logout) |
| `app/admin-schools.tsx` | Add AdminTabBar; keep CRUD |
| `theme.ts` | Add admin design tokens |
| `docs/audit/LITTLE_READERS_ADMIN_MOBILE_DASHBOARD_UI.md` | Final report |

---

## 4. Non-goals

- No Parent/Child redesign  
- No website UI changes  
- No live payments / store submit  
- No fabricated stats or activity  
- No new DB schema  

**Proceed to implementation.**
