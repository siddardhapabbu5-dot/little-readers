# Learn Wise VC34 — Grade 1 Post-Activation Student Journey Report

**Date:** 2026-11-20  
**Device:** Samsung Galaxy S24 · ADB `RZCX42381TM`  
**Package:** `com.littlereaders.app` · **versionCode 34** / `1.0.0`  
**Student:** **DEPPU1727** (Deepika) · Grade 1 / `LEVEL_1`  
**Child ID:** `cmwp3gbqr0008koeh8g3an87z`  

**Final status:** **BLOCKED – WAITING FOR ADMIN GRADE 1 ACTIVATION**

No webpage deploy. No seat/subscription grant performed by this agent.

---

## 1. Device / app check

| Check | Result |
|-------|--------|
| VC34 installed | **PASS** — versionCode **34** |
| App foreground | **PASS** — `com.littlereaders.app/.MainActivity` |
| Production API health | **ok** (`https://api.siwiapp.shop/api/health`) |

---

## 2. Entitlement / unlock check (device UI)

On S24 while logged in as the student session, Subscription screen showed:

- “Ask your parent to manage your subscription”
- “Learning is not unlocked yet. Ask your parent to manage your subscription.”
- CTA: “Back to home”

| Field | Result |
|-------|--------|
| Learning unlocked | **false** |
| Grade 1 journey | **NOT RUN** — blocked at unlock gate |

Artifact: `exports/vc34-grade1-post-activation/00-current.png` + `00-ui.xml`

---

## 3–8. Journey steps

| Section | Result |
|---------|--------|
| Dashboard unlock | **FAIL / locked** |
| Grade 1 categories / Learn → Speak → Understand → Play → Complete | **NOT RUN** |
| Progress / Grades 2–4 HOLD | **NOT RUN** this pass |

---

## Restrictions

| Restriction | Status |
|-------------|--------|
| No Admin grade-grant / seat activation by agent | Observed |
| No webpage deploy | Observed |
| No Play upload / backend deploy / commit | Observed |

---

## Next step

Admin/Super Admin must grant Grade 1 for **Deepika / DEPPU1727** via existing Admin **Grade access** path (system sponsor lookup → grant 1/3/6/12 months). Then re-check on VC34 without reinstall.
