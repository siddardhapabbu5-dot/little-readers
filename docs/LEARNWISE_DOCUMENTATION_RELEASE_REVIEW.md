# Learn Wise — Documentation-Only GitHub Release Review

**Date:** 2026-11-20  
**Mode:** Review only — **no staging, commit, push, edits to the six reports, deletions, moves, resets, or branch changes**  
**Branch:** `feature/student-id-login` @ `a4377fc`  
**Stash:** `stash@{0}` preserved  
**Staging area:** **empty** (no unrelated files staged)

---

## Verdict: **READY FOR OPERATOR APPROVAL** (with documented caveats)

The six proposed files exist, contain **no passwords/tokens/keystore material**, do **not** embed APK/media/source, and do **not** falsely claim VC29 on-device login or learning QA **PASS**.

Operator should **accept chronological conflicts** between older audit wording and later VC29 install/QA docs before approving a commit (see §4). Fixing those reports was **out of scope** for this review (no report modifications allowed).

---

## 1. Six files verified

| # | Path | Exists | Size (bytes) |
|---|------|--------|-------------:|
| 1 | `docs/LEARNWISE_GITHUB_RELEASE_PREFLIGHT_REPORT.md` | YES | 10,633 |
| 2 | `docs/LEARNWISE_GITHUB_RELEASE_FILE_MANIFEST.md` | YES | 16,418 |
| 3 | `docs/LEARNWISE_LEVEL1_PRODUCTION_APK_PREPARATION_REPORT.md` | YES | 5,637 |
| 4 | `docs/LEARNWISE_LEVEL1_PRODUCTION_GO_LIVE_READINESS.md` | YES | 7,984 |
| 5 | `docs/LEARNWISE_LEVEL1_VC29_PHYSICAL_ANDROID_QA_REPORT.md` | YES | 6,158 |
| 6 | `docs/LEARNWISE_LEVEL1_FINAL_PRODUCTION_READINESS.md` | YES | 11,982 |

All six are Markdown under `docs/` only.

---

## 2. Scope checks (commit contents)

| Check | Result |
|-------|--------|
| APK / AAB binaries included | **NO** — paths cited only; `*.apk` gitignored |
| Keystore / signing passwords included | **NO** — path `~/.lr-keystore/release.jks` cited; no passwords |
| `.env` / environment secrets included | **NO** |
| Generated media (batch-d1) included | **NO** |
| Application / server source included | **NO** |
| `exports/` evidence files included | **NO** (referenced by path only) |
| Unrelated files currently staged | **NONE** |

---

## 3. Sensitive information findings

**No secret values (passwords, tokens, JWT/Bearer strings, keystore passwords, OTP codes, private keys) found in the six files.**

| Finding | Severity | Files | Notes |
|---------|----------|-------|-------|
| Full signing cert SHA-256 | Low | APK prep, go-live | Public fingerprint of release cert; common in release notes |
| Full APK content SHA-256 | Low | APK prep | Artifact integrity hash — not a credential |
| Production API / web URLs | Low | All six (varied) | Public hostnames: `api.siwiapp.shop`, `siwiapp.shop` |
| Staging LAN IP `192.168.1.20:4100` | Low–Med | APK prep, go-live, final readiness | Cited as staging / “not in VC29”; private LAN address |
| Device serial `RZCX42381TM` | Med | VC29 physical QA | Device identifier — consider redacting in a future edit if publishing widely |
| Device model `SM-S921B` | Low | VC29 QA, go-live, preflight | Hardware model |
| Demo Parent email `parent@littlereaders.test` | Low | VC29 QA, go-live | Non-secret demo account name; noted as **401** on production |
| Keystore path `~/.lr-keystore/release.jks` | Low | APK prep | Location only; no password |
| Mentions of `.env` / `_stage2_secrets_*` | Info | Preflight, manifest | Exclusion warnings only — **no secret contents** |

**Recommendation:** Acceptable for an **internal** private-repo docs commit. If the remote is public or broadly shared, redact device serial (and optionally LAN IP) in a **later approved** edit — not done in this review.

---

## 4. Inaccurate or conflicting report statements

None of the six claim VC29 **on-device Admin/Parent/Student login** or **Grade 1 learning** as **PASS**. Those remain **BLOCKED** / **NOT TESTED** / go-live **NOT READY**.

| Conflict | Detail |
|----------|--------|
| **Install status** | APK prep (§1 / §11): physical install **“Not performed”** / awaiting approval. VC29 QA + go-live: install **Success** on SM-S921B. Chronological: prep predates install. |
| **Final readiness blockers B1–B3** | Final readiness still frames “no production Android binary” / VC28-vs-production proof as open blockers. Later APK prep records VC29 **config PASS**; go-live still **NOT READY** for *QA*, not for binary existence. |
| **Final readiness verdict wording** | Says blockers include “production Android binary” and “VC28 device proof against production” — partially **stale** relative to VC29 artifact + install. Overall **NOT READY** still correct for go-live. |
| **Preflight vs docs-only now** | Preflight final line: GitHub release **NOT READY**; also allows docs-only after operator approval. Proposing this six-file set is the docs-only exception, not a claim that go-live/QA are READY. |
| **Untracked count** | Preflight ≈986; manifest measured **990** (includes later docs such as the manifest itself). Harmless inventory drift. |
| **“Admin auth works on production API”** | Go-live/preflight: workstation Admin API **200** — explicitly **not** on-device Admin PASS. Correctly caveated; do not read as UI login PASS. |

**VC29 login / learning accuracy check:** **PASS** (no false PASS claims).

---

## 5. Git status confirmation

| Item | Value |
|------|--------|
| Branch | `feature/student-id-login` (unchanged) |
| HEAD | `a4377fc` |
| Staged files | **(none)** |
| Dirty tree | Yes — 17 modified + large untracked set remain **unstaged** |
| Stash | `stash@{0}` intact |

No unrelated files are staged. A future docs-only commit must **add only** the six paths below (and must not `git add .`).

---

## 6. Exact proposed commit file list

**Exactly these six paths (documentation only):**

1. `docs/LEARNWISE_GITHUB_RELEASE_PREFLIGHT_REPORT.md`  
2. `docs/LEARNWISE_GITHUB_RELEASE_FILE_MANIFEST.md`  
3. `docs/LEARNWISE_LEVEL1_PRODUCTION_APK_PREPARATION_REPORT.md`  
4. `docs/LEARNWISE_LEVEL1_PRODUCTION_GO_LIVE_READINESS.md`  
5. `docs/LEARNWISE_LEVEL1_VC29_PHYSICAL_ANDROID_QA_REPORT.md`  
6. `docs/LEARNWISE_LEVEL1_FINAL_PRODUCTION_READINESS.md`  

**Not in the proposed commit:**

- This review file (`docs/LEARNWISE_DOCUMENTATION_RELEASE_REVIEW.md`) — unless operator explicitly adds it  
- Any `apps/**`, `server/**`, `exports/**`, `.env`, APK, keystore, media  
- Admin Direct docs or other untracked LEARNWISE_* reports  

**Suggested commit message (for later, if approved):**  
`docs: add Level-1 VC29 production readiness and GitHub release classification reports`

---

## 7. Final gate

| Gate | Status |
|------|--------|
| Six files exist and reviewed | **YES** |
| No passwords / tokens / private keys / env secrets in content | **YES** |
| Docs-only (no APK/keystore/env/media/source) | **YES** |
| No false VC29 login/learning PASS | **YES** |
| Nothing staged yet | **YES** |
| Chronological conflicts accepted by operator? | **Awaiting** |

### **READY FOR OPERATOR APPROVAL**

Approve to allow a **later** docs-only stage+commit of the six files only (still requires a separate explicit commit instruction).  

Or request report redactions/updates first (device serial / install-status wording) — that would be a **new** approved edit task; not performed here.

---

## Stop

No files staged · no commit · no push · six reports unmodified · stash preserved · branch unchanged.  

**Awaiting operator approval.**
