# Learn Wise VC33 — Grade 1 Complete Student Journey Report

**Date:** 2026-11-20  
**Device:** Samsung Galaxy S24 SM-S921B · ADB `RZCX42381TM`  
**Package:** `com.littlereaders.app` · **versionCode 33** / `1.0.0`  
**Student:** **DEPPU1727** (Deepika) · Grade 1 / `LEVEL_1`  
**Child ID:** `cmwp3gbqr0008koeh8g3an87z`  

**Final status:** **BLOCKED – WAITING FOR ADMIN GRADE 1 SEAT ACTIVATION**

No learning-journey steps (Learn / Speak / Understand / Play / Complete) were executed.  
No seat, subscription, production data, content, APK, or backend changes were made.

---

## 1. Student seat status

| Check | Result |
|-------|--------|
| `hasLearningSeat` | **false** |
| Grade 1 entitlement (`access.entitled`) | **false** |
| Access `via` | `null` |
| Reason | `A Grade 1 subscription is needed for this child. Ask a parent to subscribe.` |
| Effective level | `LEVEL_1` / Grade 1 |
| Groups returned while locked | `[]` (expected when not entitled / empty catalog payload for locked probe) |

**Read-only inspection method:** production student session probe + `GET /api/learning/levels/1/groups?childId=…` (tokens/passwords not recorded).

**Admin activation options (existing, not used):** 1 / 3 / 6 / 12 months via Admin grade grant — **not invoked** this task.

**Conclusion:** DEPPU1727 does **not** have an active Grade 1 learning seat / grade subscription. Journey verification **stopped** per instructions.

---

## 2. Login and dashboard results

| Item | Result |
|------|--------|
| VC33 installed | **PASS** — versionCode **33** |
| App launches | **PASS** |
| Student login for journey | **Not completed for journey** — seat gate failed first |
| Dashboard / Grade 1 unlock banner | Prior VC33 QA showed locked Home copy; API confirms still locked |
| Subscription / Profile navigation | **Deferred** — blocked before journey |

Artifacts: `exports/vc33-grade1-journey/01-launch.*` (login welcome at check time).

---

## 3–8. Grade 1 category / Learn / Speak / Understand / Play / Complete / Progress

| Section | Result |
|---------|--------|
| 3. Grade 1 category and topic | **NOT RUN** — blocked |
| 4. Learn | **NOT RUN** — blocked |
| 5. Speak | **NOT RUN** — blocked |
| 6. Understand | **NOT RUN** — blocked |
| 7. Play | **NOT RUN** — blocked |
| 8. Complete | **NOT RUN** — blocked |
| 9. Progress persistence | **NOT RUN** — blocked |
| 10. Grades 2–4 restrictions | **NOT RUN** this pass (prior VC33 QA: Grades 2–4 locked; no entitlement change) |

---

## 9. Regression (Subscription / Profile / cold start / resume)

**Not re-run** in this task (stopped at seat gate).  
Prior VC33 S24 report remains the last PASS evidence for Subscription parent-guidance, Profile without logout, cold start, and resume:

`docs/LEARNWISE_VC33_SAMSUNG_S24_INSTALL_AND_STUDENT_TEST_REPORT.md`

---

## 10. Screenshots and logs

| Path | Notes |
|------|--------|
| `exports/vc33-grade1-journey/00-current.*` | Initial foreground check |
| `exports/vc33-grade1-journey/01-launch.*` | VC33 launch at seat-check time |

API responses were inspected then deleted from disk; no secrets retained in this report.

---

## 11. Restrictions compliance

| Restriction | Status |
|-------------|--------|
| No seat/subscription activation or modification | Observed |
| No new student / content / Grades 2–4 unlock | Observed |
| No backend deploy / APK rebuild-reinstall / Play upload | Observed |
| No commit / push | Observed |
| Existing VC33 + DEPPU1727 only | Observed |

---

## 12. Next step (requires separate Admin approval)

1. Admin/Super Admin: grant Grade 1 entitlement for Deepika / DEPPU1727 (1 month recommended first) via existing Admin grade-grant workflow.  
2. Re-run this journey verification on VC33 without reinstall.  

Until then: **BLOCKED – WAITING FOR ADMIN GRADE 1 SEAT ACTIVATION.**
