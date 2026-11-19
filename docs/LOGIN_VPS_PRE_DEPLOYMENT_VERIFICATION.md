# Learn Wise – VPS Pre-Deployment Verification (Read-Only)

**Date (UTC):** 2026-11-18T16:26:25Z  
**Mode:** READ-ONLY inspection — no pull, checkout, reset, merge, cherry-pick, install, restart, build, env edit, or data change  
**Access method:** SSH key `~/.ssh/siwi_vps` → `root@201.18.220.29` (`srv2131305`, Hostinger VPS for `siwiapp.shop`)  
**Target merge commit:** `7b78f3b0d6a98cc80088b8f81a6815c6db2997b9`  

---

## 1. Production repository state (`/var/www/siwi`)

| Item | Value | Status |
|------|--------|--------|
| Host | `srv2131305` / `201.18.220.29` | **PASS** |
| Path | `/var/www/siwi` | **PASS** |
| Current branch | `feature/central-dictionary-expansion` | **PASS** |
| **PRE_SHA (HEAD)** | `39ec03d3832ecade2c6148f8e0ba6b9298a9aa74` | **PASS** (recorded) |
| HEAD short | `39ec03d` | |
| HEAD subject | `Stop auto-creating children on signup; require parent-chosen grade.` | |
| Upstream | `origin/feature/central-dictionary-expansion` | **PASS** |
| Working tree | **Dirty** (`39ec03d-dirty`) | **NEEDS ATTENTION** |
| Dirty porcelain lines | **15** | **NEEDS ATTENTION** |
| Merge `7b78f3b` in local object store | **NO** | Expected without fetch |
| Merge `7b78f3b` ancestor of HEAD | **NO** | Prod is **behind** tip |

### Working tree details (unchanged; not cleaned)

**Deleted tracked paths (still dirty):**
- `apps/mobile/data/pilot-batch-d1.json`
- `docs/documentation/siwi-3d-visual-upgrade/grade1/g1-3d-cutover-payload.json`
- `server/scripts/apply-g1-3d-cutover.mjs`

**Untracked (examples):**
- `docs/curriculum/apply-additional-vocab-local.json`
- `exports/`
- `server/lw-cert2.tmp.ts`
- `server/scripts/_vps-*.mjs`, `apply-l2-pilot-batch-d2-cutover.mjs`, `audit-l2-pilot-batch-d2-precutover.mjs`, `publish-grades-2-4.ts`
- `server/storage/content-correction-work/`
- `server/storage/vocab-media/`

**Risk:** A future `git pull`/`checkout` may conflict with dirty deletes or collide with untracked paths that also exist in the incoming tip (e.g. L2 pilot scripts / `exports/` / `vocab-media`).

---

## 2. Remote tip vs production HEAD

| Ref | SHA | How obtained |
|-----|-----|----------------|
| Production HEAD (`PRE_SHA`) | `39ec03d3832ecade2c6148f8e0ba6b9298a9aa74` | VPS `git rev-parse HEAD` |
| Remote `feature/central-dictionary-expansion` | `7b78f3b0d6a98cc80088b8f81a6815c6db2997b9` | VPS `git ls-remote origin` (no fetch) |
| Local VPS remote-tracking tip | Stale vs `ls-remote` (no fetch performed) | **NOT updated** (intentional) |

Compare `39ec03d...7b78f3b` (GitHub / local clone; VPS objects not fetched):

| Metric | Value |
|--------|--------|
| Status | Remote tip is **ahead** of production |
| Commits that would arrive on fast-forward pull | **3** |
| Files changed | **79** |
| Behind (prod has unique commits not on tip) | **0** |

### Exact commits that would be introduced

1. `eb296fe` — **Add Level-2 Types of Nouns 3D pilot assets, tooling, and cutover exports.**  
2. `122c627` — **fix(auth): improve login reliability and Redis rate limiting**  
3. `7b78f3b` — **Merge pull request #1 from siddardhapabbu5-dot/release/login-auth-only**

### Scope classification

| Slice | Commits | Files (approx) | Login-only? |
|-------|---------|----------------|-------------|
| `39ec03d` → `eb296fe` | 1 | 48 | **NO** — Level-2 3D pilot assets/tooling/exports |
| `eb296fe` → `7b78f3b` | 2 | 31 | **YES** — approved login PR |
| Full pull to tip | 3 | **79** | **NO** — mixed |

**Pulling the target branch tip would include unrelated Level-2 / central-dictionary pilot content, not only login auth.**  
It would **not** include local WIP from `fix/login-auth-reliability` (that branch is not on this path).

Login-related portion of the full 79-file delta includes auth/login/redis/lockout/password/session + docs/tests/`ioredis` lockfile changes. The remainder is largely `exports/level2-3d-*`, `server/storage/vocab-media/pilot/batch-d2/*`, and L2 pilot scripts.

---

## 3. Services and PM2

| Check | Result | Status |
|-------|--------|--------|
| `siwi-api` present | **Yes** — online, fork, pid live, uptime ~26h, restarts 36 | **PASS** |
| `siwi-web` present | **Yes** — online, cluster, uptime ~26h, restarts 17 | **PASS** |
| Other PM2 apps | None listed | **PASS** |
| API instance count | **1** process (`instances_cfg=1`, `SIWI_API_PROCESS_COUNT=1`) | **PASS** |
| Web instance count | **1** process | **PASS** |
| API cwd | `/var/www/siwi/server` | **PASS** |
| Web cwd | `/var/www/siwi/apps/web` | **PASS** |

---

## 4. Redis configuration (presence only — no secrets)

| Source | Configured? | Status |
|--------|-------------|--------|
| `/var/www/siwi/server/.env` `REDIS_URL` | **Present and non-empty** | **PASS** (presence) |
| `/var/www/siwi/.env` `REDIS_URL` | **Present and non-empty** | **PASS** (presence) |
| PM2 `siwi-api` runtime env `REDIS_URL` | **set_nonempty** | **PASS** (presence) |
| Secret value | **Not printed** | **PASS** |
| Connectivity / shared counters on prod | Not probed beyond presence | **NOT TESTED** |

**Implication:** Production already has Redis URL configured for the API process. Single-instance topology still means shared multi-process RL is less critical, but Redis path is likely active. Do **not** change `REDIS_URL` without separate approval.

---

## 5. Live health

| Endpoint | Result | Status |
|----------|--------|--------|
| `http://127.0.0.1:4100/api/health` | `status:"ok"`, `service:"little-readers-api"` | **PASS** |
| `https://api.siwiapp.shop/api/health` | `status:"ok"`, `service:"little-readers-api"` | **PASS** |

---

## 6. Risks

| ID | Priority | Risk | Status |
|----|----------|------|--------|
| VPS-01 | **P0** | Full `git pull` to `7b78f3b` ships **79 files / 3 commits**, including **Level-2 3D pilot** (`eb296fe`), not login-only | **NEEDS ATTENTION** |
| VPS-02 | **P0** | Dirty tree (deletes + untracked) may block or surprise a pull/checkout | **NEEDS ATTENTION** |
| VPS-03 | **P1** | Prod already has `REDIS_URL`; login deploy must not casually unset/overwrite it | **NEEDS ATTENTION** |
| VPS-04 | **P1** | Untracked L2 paths overlap incoming tip paths — conflict risk on pull | **NEEDS ATTENTION** |
| VPS-05 | **P2** | Local remote-tracking refs stale until a future approved fetch | **PASS** (documented) |
| VPS-06 | — | Services `siwi-api` / `siwi-web` online; API instances = 1 | **PASS** |
| VPS-07 | — | Health OK | **PASS** |

---

## 7. Deployment scope recommendation

### Recommendation: **DO NOT approve a blind full-branch pull yet**

**Preferred login-scoped options (require separate explicit approval):**

1. **Login-only onto current prod tip**  
   - Base: `PRE_SHA=39ec03d`  
   - Bring **only** `122c627` (or equivalent login file set) after a controlled dirty-tree plan  
   - Avoids shipping `eb296fe` Level-2 3D pilot assets in the same operation  

2. **Explicit combined release**  
   - Approve deploying **both** `eb296fe` (L2 pilot) **and** login (`122c627`/`7b78f3b`)  
   - First resolve/move aside dirty and overlapping untracked files  
   - Then pull/ff to `7b78f3b`, `npm ci`, restart API/web per runbook  

**Do not** treat “pull `feature/central-dictionary-expansion`” as login-only — production is at `39ec03d`, not `eb296fe`.

### Recorded rollback anchor

```
PRE_SHA=39ec03d3832ecade2c6148f8e0ba6b9298a9aa74
```

---

## 8. Actions performed / not performed

**Performed:** SSH read-only inspect; `git status` / `rev-parse` / `ls-remote`; PM2 list/jlist; Redis **presence** checks; health curls; offline GitHub/local compare of SHAs.

**Not performed:** `git fetch` / `pull` / `checkout` / `reset` / `merge` / `cherry-pick`; `npm install`/`ci`; PM2 restart; builds; env edits; DB changes; commits/pushes; printing credentials.

---

## 9. Stop condition

Verification complete. **Awaiting separate approval** before any production configuration change, dirty-tree cleanup, fetch/pull, Android build, or deployment.
