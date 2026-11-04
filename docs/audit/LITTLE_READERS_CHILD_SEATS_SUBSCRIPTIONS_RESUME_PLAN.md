# Little Readers — Child Seats, Subscriptions & Independent Lesson Resume

**Status:** Seats Phase A/B implemented (2026-11-04) — base 2 seats + `hasLearningSeat` + learn gate; resume (Phase C) still pending  
**Date:** 2026-11-04  
**Note:** Seat enforcement shipped after parent reported 3rd child learning without a subscription prompt. Extra seats via admin `POST /subscriptions/seats/grant` (no fake checkout).

---

## 1. Executive summary

| Area | Current state | Target |
|------|---------------|--------|
| Subscription | One parent-level `Subscription` (plan string + status + expiry/grace). No seat count. | Base plan = **2 included child seats**; add-on seats paid & activated before learning |
| Child create | Unlimited active children if parent is authenticated | Profiles may be created freely **or** gated; **learning** requires an assigned active seat (backend-enforced) |
| Seat model | **Does not exist** | Atomic seat allocation; one seat ↔ one active child; soft-deleted children do not consume seats |
| Learning progress | Mostly **child-scoped** in DB | Keep child scoping; add **resumable IN_PROGRESS session** with cursor |
| Play UI | Always `POST /learning/sessions` (new session); local `qIndex` only | Resume unfinished session for `(childId, categoryId)`; never share cursor across children |
| Device lock | One `StudentDevice` per child | Preserve; seat assignment must not bypass device registration |
| Payments | `Payment` rows exist; live checkout not fully wired in mobile | Seat add-ons activate only after verified payment (no fake activation) |

---

## 2. Current architecture (inspected)

### 2.1 Prisma models (relevant)

**Parent subscription (no seats today)** — `server/prisma/schema.prisma`

- `Subscription`: `userId`, `plan` (free-form string: seed/tests use `YEARLY` / `MONTHLY` — not an enum), `status` (`ACTIVE|TRIALING|PAST_DUE|EXPIRED|CANCELLED|PENDING|SUSPENDED|GRACE`), `startedAt`, `expiresAt`, `graceEndsAt`, `provider`, `providerRef`
- `Payment`: `userId`, `subscriptionId?`, `amountCents`, `status` (`PENDING|SUCCEEDED|FAILED|REFUNDED`), `provider`, `paidAt?` — **schema only; no Express create/update payment routes**
- Seed (`server/prisma/seed.ts`): demo `parent@littlereaders.test` gets one `YEARLY`/`ACTIVE`/`manual_seed` sub + child `"Ava"`; **no Payment rows**, no seat fields
- `packages/config` `SUBSCRIPTION_PACKAGES` (`STARTER`…`ENTERPRISE` school `studentCapacity`) are **not** wired into the parent B2C subscription service — keep school packages separate from home seats
- **Missing:** `includedSeats`, `extraSeats`, seat assignment, add-on activation path

**Child**

- `Child`: `parentId`, `displayName`, `birthYear`, `birthDate?`, `isActive`, level/ageGroup
- Soft-delete sets `isActive=false` (does not hard-delete progress); list/admin counts use `isActive: true` only
- **Missing:** seat assignment / learning entitlement flag

**Device (preserve — already enforced)**

- `StudentDevice`: **unique `childId`** → one registered phone per student
- `DeviceTransferEvent`: REGISTER / TRANSFER / REVOKE audit
- Soft-delete child revokes device; logout does **not** clear installation id
- Learning enforces device only when `X-Client-Platform` is `mobile`/`ios`/`android` + `X-Installation-Id` (web/desktop can skip)
- Parent/admin accounts are **not** device-bound
- Tests: `server/tests/device-subscription.test.ts`

**Learning (already child-scoped)**

- `LearningSession`: `childId`, `categoryId`, `status` (`IN_PROGRESS|COMPLETED|ABANDONED`), scores, points, stars, `questionsTotal`, timestamps. Indexes: `[childId, startedAt]`. **`ABANDONED` is in the enum but never written by the service.**
- `QuestionAttempt`: `sessionId`, `wordId`, `round` (`LISTEN|LETTER|SPELL`), `isCorrect`, `pointsAwarded`, …. Index `[sessionId, round]` only — **no unique `(sessionId, wordId, round)`** (correct-duplicate guard is application-level).
- `ChildCategoryProgress`: unique `(childId, categoryId)` — category stars/points/completion (**updated only on session complete**, not mid-session)
- `LearningProgress`: unique `childId` — aggregate
- `Achievement`: unique `(childId, code)`
- **Missing for resume:** question order + listen options are returned from `startLearningSession` but **not persisted**; no cursor fields; no resume/lookup of open `IN_PROGRESS`; each play start creates a **new** session

### 2.2 APIs today

| API | Behavior |
|-----|----------|
| `GET /subscriptions/me` | Newest sub by `createdAt` + last 5 payments + `eligible` |
| `GET /subscriptions/admin` | Admin list |
| `POST /subscriptions/verify`, `GET /subscriptions/status` | **501 Phase 8 stubs** |
| `assertParentSubscriptionEligible` | Eligible: `ACTIVE`/`TRIALING`/`GRACE`/`PAST_DUE`; if `expiresAt` passed, still OK only while `graceEndsAt > now`; else **402**. Used on **device register** + **start learning session** only — **not** on create/list child or progress reads |
| `POST /children` | Unlimited create; **no seat or subscription check** |
| `GET/PATCH/DELETE /children/:id` | Ownership / admin bypass; soft-delete |
| `POST /devices/register` | One active device per child; requires eligible parent sub |
| `POST /devices/transfer` | Revoke; optional immediate rebind of `newInstallationId` |
| Payment HTTP APIs | **None** |
| Seat purchase / assign APIs | **None** |
| `POST /learning/sessions` | Always new session; subscription (+ device on native) |
| `POST …/attempts` | Correct duplicate → `duplicate: true` |
| `POST …/complete` | Idempotent if already COMPLETED |
| `GET /learning/progress/:childId` | Child-scoped overview |

**Files:**  
`server/src/subscriptions/subscription.service.ts` (logic)  
`server/src/subscriptions/index.ts` (Phase-8 placeholder `export {}`)  
Subscription HTTP routes currently live alongside devices in `server/src/devices/device.routes.ts`  
`server/src/children/children.service.ts`, `device.service.ts`, `learning.service.ts`  
Mobile: `subscription.tsx` (read-only; notes checkout not mocked), `parent.tsx`, `devices.tsx`, `play.tsx`, `(tabs)/learn.tsx`, `(tabs)/home.tsx`, `(tabs)/profile.tsx`

### 2.3 Mobile / web play behaviour today

- **Active child** stored in SecureStore (`lr_active_child` via `apps/mobile/services/secure.ts`); Home/Learn/Rewards fetch progress for that child only.
- **Play** (`apps/mobile/app/play.tsx`) trusts **route `params.childId`** — does **not** call `getActiveChild`. On mount always `POST /learning/sessions` (`questionCount: 8`); local `qIndex` / `round` / `lockedKeys` only; no AppState / SecureStore session persistence; no offline retry queue.
- Leaving mid-game leaves a server `IN_PROGRESS` **orphan**; reopen → **new session at Q1** (same shuffle not recoverable from attempts alone).
- Home “Continue Learning” uses **category** aggregate (`wordsLearned > 0 && !completed` from completed sessions), **not** an open session cursor.
- Web kids play (`apps/web/src/app/kids/level-1/play/page.tsx`) follows the same non-resume pattern.
- Parent web uses explicit `selectedChildId` → `/learning/progress/{id}`; parent mobile loads a multi-child `progressMap` plus one active pointer for Kids tabs.
- **Cross-child contamination today is low** (no shared global `qIndex`) — independence is “everyone restarts,” not designed resume. Residual risks: stale play route `childId` vs SecureStore active child; Learn device-register binds **active** child while play may use a different param.

### 2.3.1 Idempotency today

| Operation | Status |
|-----------|--------|
| Correct attempt same `sessionId+wordId+round` | Yes — `duplicate: true`, no extra points |
| Incorrect attempts | New row each time (no dedupe) |
| Complete | Idempotent if already `COMPLETED` |
| Start session | Always creates another `IN_PROGRESS` |

### 2.4 What is already good (do not break)

1. Progress tables are **per childId** (not parent-global).  
2. Session create/attempt/complete require child ownership.  
3. Duplicate correct attempt + double-complete guards exist.  
4. One-device-per-child + transfer/revoke.  
5. Subscription eligibility gate on session start (parent-level).  
6. Soft-deleted children excluded from list/access (`isActive: true`).

---

## 3. Gaps vs requirements

### 3.1 Child seats

| Requirement | Gap |
|-------------|-----|
| Max 2 seats in base plan | Not modelled or enforced |
| 3rd+ child needs paid add-on seat | Not modelled |
| Seat required before Kids Zone / learning | Only parent subscription eligible; any active child of eligible parent can learn |
| Backend enforce (not UI-only) | Missing |
| One seat not assignable to two children | N/A (no seats) |
| Atomic allocation | N/A |
| Soft-deleted don’t count | Soft-delete exists; seat counting must use `isActive: true` only |

### 3.2 Independent resume

| Requirement | Gap |
|-------------|-----|
| Child 1 stop at Q5; Child 2 starts Q1 | Sessions are child-scoped, but **no resume API**; each open starts Q1 with new random words |
| Autosave after each answer | Attempts POST exists; **cursor** (next index / round) not stored on session |
| Save on navigate / background | Mobile does not pause/persist session cursor |
| Offline / retry / don’t overwrite newer server | No offline queue; no `updatedAt` conflict check on session cursor |
| Idempotent scoring | Partially done for correct duplicates |

### 3.3 Subscription lifecycle

| Requirement | Gap |
|-------------|-----|
| Base + add-on seats after payment | `Payment` unused; verify/status stubs 501; **no seat grant path** (do not invent fake checkout) |
| Renewal / failed payment / expiry / cancel | Status enums + grace exist on eligibility; seat revocation on expiry not defined |
| Refund / chargeback | `PaymentStatus.REFUNDED` exists; no service that decrements `extraSeats` / suspends learning |

### 3.4 Device security

Preserve as-is. Seat entitlement must be checked **in addition to** device lock for native clients — never instead of.

---

## 4. Proposed commercial / domain model (plan only)

Capacity always lives on the existing parent `Subscription` (do not duplicate a sub per child; do not overload school `SUBSCRIPTION_PACKAGES`):

```
seatCapacity = includedSeats (default 2) + extraSeats (default 0)
```

### Option A — Active children = seats (minimal)

- `seatsUsed = count(Child where parentId AND isActive)`
- Enforce on `createChild`: refuse when `seatsUsed >= seatCapacity`
- Soft-delete automatically frees a seat
- **Pros:** tiny schema (`includedSeats`/`extraSeats` only); matches soft-delete semantics already in list APIs  
- **Cons:** cannot create a 3rd profile while waiting to buy a seat; no reassignment without soft-delete; weaker match to “activation screen for unseated child”

### Option B — Explicit seat assignment (matches product brief)

```
Subscription
  ├── includedSeats = 2
  ├── extraSeats = N
  └── ChildSeat[] (AVAILABLE | ASSIGNED | SUSPENDED)
        ├── childId?  (unique when set among active assignments)
        ├── source: INCLUDED | ADDON
        └── paymentId? for ADDON ledger link

learningAllowed iff:
  eligible parent sub
  AND child.isActive
  AND ASSIGNED seat for this childId
  AND (native) device allowed
```

- Profiles may exceed capacity; learning blocked until assign  
- Atomic assign/unassign/reassign; one seat not shared by two children  
- Soft-delete → unassign → seat AVAILABLE  

**Recommendation:** **Option B** (aligns with §1–2 of the product request). Option A is a fallback if product prefers “block create” over “create then activate.”

### Add-on activation (no fake checkout)

Until a real provider (Phase 10 / Stripe / RevenueCat):

1. Admin/manual (or future webhook) writes `Payment` `SUCCEEDED` linked to `subscriptionId` (`provider: "manual"` or real).  
2. Same DB transaction: `extraSeats += n` and/or create AVAILABLE `ChildSeat` ADDON rows.  
3. Never expose a client-trusted “I paid” endpoint that grants seats without a verified ledger row.

### Shared rules

1. One parent subscription commercial object — never a subscription per child.  
2. Soft-deleted / inactive children do **not** consume seats.  
3. Seat entitlement is **in addition to** device lock — never a bypass.  
4. `MONTHLY`/`YEARLY` → `includedSeats = 2`; leave school package codes alone.

---

## 5. Proposed learning resume model (plan only)

### 5.1 Session identity

Resume key: `(childId, categoryId)` where `status = IN_PROGRESS` (latest).

On Play open:

1. `GET /learning/sessions/active?childId=&categoryId=`  
2. If found → return stored `questions` snapshot + `cursor` (questionIndex + round) + attempts so far.  
3. If not → `POST /learning/sessions` as today (persist **question order snapshot** + cursor at 0).

### 5.2 Fields to add later (not now)

On `LearningSession` (future migration):

- `questionPlanJson` — ordered word ids + option keys for this run (stable resume)  
- `currentIndex` Int  
- `currentRound` VocabRound  
- `contentVersion` String?  
- `lastSavedAt` DateTime  
- Optional unique partial index: one IN_PROGRESS per `(childId, categoryId)`

### 5.3 Autosave

- After each successful attempt POST → also PATCH cursor (`currentIndex` / `currentRound` / `lastSavedAt`).  
- On Next / exit / AppState background → PATCH cursor (mobile).  
- Idempotency: keep existing correct-attempt duplicate guard; cursor PATCH must be monotonic (`lastSavedAt` / version) so older offline writes cannot move cursor backward past server.

### 5.4 Cross-child guarantee

- No module-level / parent-global question index.  
- Play screen state always derived from `params.childId` + server session for that child.  
- Active-child switch clears local play state and reloads.

---

## 6. Implementation plan (phased — after approval)

### Phase A — Documented seats (schema + backend) *[requires approved migration]*

1. Add `Subscription.includedSeats` (default 2) + `extraSeats` (default 0); seed demo parent accordingly.  
2. If Option B: add `ChildSeat` (+ unique assigned `childId`); migrate existing active children onto included seats in `createdAt` order (max capacity).  
3. If Option A: enforce capacity in `createChild` only (no assignment table).  
4. APIs (Option B):  
   - `GET /subscriptions/me` → `seats: { included, extra, assigned, available }` + per-child entitlement  
   - `POST /subscriptions/seats/assign|unassign` — atomic transactions  
   - Admin `POST …/seats/grant` (or payment-ledger hook) — increments `extraSeats` + creates AVAILABLE seats **with** linked `Payment SUCCEEDED`; **no** fake mobile checkout  
5. Enforce `assertChildLearningEntitlement(childId)` inside `startLearningSession` (and optionally device register).  
6. Tests: 3rd child learning blocked; double-assign race; soft-delete frees seat; device 403 unchanged; grant without payment row rejected.

### Phase B — Mobile seat UX

1. Parent dashboard: show seat usage `2/2 used`, list which children have seats.  
2. Kids Learn/Play: if no seat → **Subscription activation** screen (not silent 402).  
3. Set active still works; without seat, active child cannot play.  
4. Do not hide seat errors only in UI — mirror backend codes (`SEAT_REQUIRED`, `NO_SEAT_AVAILABLE`).

### Phase C — Resume + autosave *[requires approved session fields]*

1. Persist question plan on create (`questionsJson` or `LearningSessionQuestion` rows) — reuse existing vocabulary shuffle only; no new words.  
2. Optional cursor fields (`currentIndex`, `currentRound`) **or** derive from attempts; mark superseded opens as `ABANDONED` (enum already exists).  
3. Change `startLearningSession` (or `resume?: boolean`): if `IN_PROGRESS` for `(childId, categoryId)` → reload plan + attempts + cursor; else create and **persist** plan before return. Optional `GET /learning/sessions/:id`.  
4. Mobile + web play: hydrate from server; PATCH/save cursor after attempt / navigate / AppState background; align play `childId` with active child (reject or redirect on mismatch).  
5. Home “Continue” prefers open `IN_PROGRESS` over category aggregate alone.  
6. Tests: Child1 Q5 / Child2 Q1 / Child1 resumes Q5; duplicate correct still blocked; stale offline cursor cannot rewind server.  
7. Parent/Home/Rewards: verify active-child switch reloads correct child’s data only.

### Phase D — Lifecycle hardening

1. Map EXPIRED/CANCELLED/refund → suspend seats / block learning (keep history).  
2. PAST_DUE/GRACE: follow existing eligibility; define whether add-on seats stay assignable.  
3. Admin tools to grant/revoke extra seats with audit log.  
4. No fake payment success in production paths.

---

## 7. Explicit non-goals (this initiative)

- Inventing vocabulary or Levels 2–4 content.  
- Separate Teacher/School seat system (still deferred).  
- Weakening one-device-per-student.  
- Activating paid seats without verified payment (or explicit admin grant).  
- Shared parent-level “current question” store.

---

## 8. Test matrix (when implementing)

| # | Case | Expect |
|---|------|--------|
| 1 | Parent with eligible sub, 0 children, create 1–2 | Seats assign / learning OK |
| 2 | Create 3rd child | Profile OK (if allowed); learning **blocked** until add-on seat |
| 3 | Parallel assign last seat | Exactly one succeeds |
| 4 | Soft-delete seated child | Seat freed; learning blocked for that id |
| 5 | Native second phone | Device 403 unchanged |
| 6 | Child1 Animals stop mid-way; Child2 Animals | Child2 at start; Child1 resumes |
| 7 | Duplicate correct attempt | No double points |
| 8 | Complete twice | Idempotent |
| 9 | Switch active child on Parent | Home/Learn/Rewards show other child’s data only |
| 10 | Expired subscription | All seats learning blocked |

---

## 9. Open product decisions (need confirmation before coding)

1. **Seat model:** Option B (explicit assign + activation screen) vs Option A (active children = seats, block create)?  
   - **Recommendation:** Option B.  
2. **Create vs learn gate:** (only if B) unlimited profiles with “Activate seat,” or soft-cap create?  
   - **Recommendation:** Allow create; block learning + show activation screen.  
3. **Add-on payment:** Manual admin grant + `Payment` ledger now, vs wait for Stripe/RevenueCat?  
   - **Recommendation:** Admin/manual ledger first; no fake checkout endpoints.  
4. **Unassign / reassign:** Move seat Child A → Child B without repurchase?  
   - **Recommendation:** Yes, if subscription eligible; atomic swap.  
5. **Resume scope:** Per category only, or per category+activity?  
   - **Recommendation:** One `IN_PROGRESS` per `(childId, categoryId)` (Listen→Letter→Spell).  
6. **Abandoned sessions:** Auto-abandon `IN_PROGRESS` older than N days?

---

## 10. Approval gate

**Stop here.**  

No Prisma migrations, seat tables, or resume fields will be applied until this plan (and the open decisions in §9) are approved.

**Next step after approval:** Phase A backend seats + tests, then Phase B mobile activation UX, then Phase C resume.
