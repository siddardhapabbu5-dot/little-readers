# Learn Wise VC33 — Grade 1 Post-Activation Student Journey Report

**Date:** 2026-11-20  
**Device:** Samsung Galaxy S24 · ADB `RZCX42381TM` (device briefly offline at check end; entitlement verified via API)  
**Package:** `com.littlereaders.app` · VC33  
**Student:** **DEPPU1727** (Deepika) · Grade 1 / `LEVEL_1`  
**Child ID:** `cmwp3gbqr0008koeh8g3an87z`  

**Final status:** **BLOCKED – WAITING FOR ADMIN ACTIVATION**

---

## 1. Entitlement check (read-only)

| Field | Result |
|-------|--------|
| `hasLearningSeat` | **false** |
| `entitled` | **false** |
| `via` | `null` |
| `gradeLabel` / `levelCode` | Grade 1 / `LEVEL_1` |
| `expiresAt` | `null` |
| Reason | `A Grade 1 subscription is needed for this child. Ask a parent to subscribe.` |
| Groups while locked | `[]` |

**Method:** production student login probe + `GET /api/learning/levels/1/groups?childId=…`  
Passwords and tokens were not retained in this report.

**Activation:** Not performed by this agent. Admin path remains: Child Seats → Grade Access → DEPPU1727 / Deepika (1 / 3 / 6 / 12 month options unchanged).

---

## 2–7. Journey and regression tests

| Section | Result |
|---------|--------|
| Student login / dashboard (post-activation) | **NOT RUN** |
| Grade 1 categories / topics | **NOT RUN** |
| Learn → Speak → Understand → Play → Complete | **NOT RUN** |
| Progress persistence | **NOT RUN** |
| Grades 2–4 locked | **NOT RUN** this pass |
| Subscription / Profile / cold start / resume | **NOT RUN** this pass |

Stopped after a single entitlement check per instructions (no retries, no production writes).

---

## 8. Restrictions compliance

| Restriction | Status |
|-------------|--------|
| No seat/subscription activation or modification | Observed |
| No production data / content / grade unlock changes | Observed |
| No APK rebuild/reinstall / backend deploy / commit | Observed |

---

## Next step

After Admin completes Grade 1 grant for Deepika / DEPPU1727, re-run post-activation journey testing on existing VC33.
