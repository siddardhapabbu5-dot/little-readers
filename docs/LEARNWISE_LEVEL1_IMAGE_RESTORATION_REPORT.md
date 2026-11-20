# Learn Wise Level-1 Image Restoration Report (Staging)

**Date:** 2026-11-20  
**Scope:** Grade 1 / Level 1 `batch-d1` media on **local staging only**  
**Reference QA:** `docs/LEARNWISE_LEVEL1_VC28_RELEASE_QA_REPORT.md` (DEF-VC28-01)  
**Production:** **Not modified**. No deploy, commit, push, or Grades 2–4 activation.

---

## 1. Executive summary

| Metric | Count |
|--------|------:|
| Grade 1 active vocabulary images checked | **750** |
| Missing on staging before restore | **750** (directory absent) |
| Restored to staging storage | **750** |
| HTTP GET verification after restore | **750 OK / 0 FAIL** |
| Remaining failures | **0** |

**Root cause (two parts):**

1. **Missing files** — this worktree had no `server/storage/vocab-media/pilot/batch-d1/` (only `batch-d2` with 30 Level-2 pilot files).  
2. **Missing API routing** — `server/src/app.ts` in this worktree lacked the `/media/vocab` → `storage/vocab-media` static mount present in the sibling full app worktree, so even existing `batch-d2` files returned 404.

Database `imageUrl` values were already correct (`http://127.0.0.1:4100/media/vocab/pilot/batch-d1/<wordId>.jpg`). **No DB rewrite and no image regeneration.**

---

## 2. Investigation

### 2.1 Grade 1 batch-d1 references (staging DB `:5437`)

| Check | Result |
|-------|--------|
| Active LEVEL_1 words | 750 |
| `imageUrl` contains `batch-d1` | 750 / 750 |
| `imageUrl` contains `batch-d2` | 0 |
| Empty `imageUrl` | 0 |
| URL host pattern | `http://127.0.0.1:4100/media/vocab/pilot/batch-d1/…` |

Manifest: `exports/_g1_batch_d1_expected.csv` (750 rows).

### 2.2 Original storage locations found

| Location | Files | Role |
|----------|------:|------|
| `SIWI-Read IT & Spell IT\server\storage\vocab-media\pilot\batch-d1\` | **750** | **Canonical restore source** (byte-identical originals) |
| `SIWI-Read IT & Spell IT\server\storage\vocab-media-pilot\batch-d1\` | 750 | Duplicate mirror of same set |
| `SIWI-login-auth-only\server\storage\vocab-media\pilot\batch-d1\` | 0 → **750** | Staging destination (restored) |
| Docs `…\siwi-3d-visual-upgrade\batch-d1\` | 2 JSON maps | Not image binaries |

### 2.3 DB path vs storage path

| Layer | Path |
|-------|------|
| Public URL | `/media/vocab/pilot/batch-d1/<filename>.jpg` |
| Static mount (after fix) | `GET /media/vocab` → `server/storage/vocab-media` |
| On-disk file | `server/storage/vocab-media/pilot/batch-d1/<filename>.jpg` |

**Filename match:** 750/750 DB basenames present in sibling source; **0** missing in source; **0** extras.

### 2.4 Problem classification

| Hypothesis | Verdict |
|------------|---------|
| Missing files on this staging worktree | **YES** — primary |
| Incorrect DB URLs | **NO** — paths already correct |
| Storage configuration / static mount missing | **YES** — secondary (blocking serve even after copy) |
| Need to regenerate images | **NO** — originals available |
| API routing bug beyond static mount | **NO** — after mount restore, JPEG served with `200` / `image/jpeg` |

---

## 3. Recovery plan (executed)

1. Confirm staging isolation (`DATABASE_URL` → `localhost:5437`).  
2. Export expected filenames from staging DB (750).  
3. Diff against sibling worktree `batch-d1` (exact 750 match).  
4. Restore missing Express static mount in `server/src/app.ts` (same pattern as sibling app — staging serve only).  
5. **Copy** JPGs into `server/storage/vocab-media/pilot/batch-d1/` **only if absent** (no overwrite of existing media).  
6. Let staging `npm run dev` / `tsx` reload.  
7. HTTP-verify all 750 URLs.  
8. Document; **stop** (no production).

---

## 4. Restoration actions taken

### 4.1 Files

| Action | Detail |
|--------|--------|
| Source | `C:\Users\harsh\OneDrive\Documents\Desktop\SIWI-Read IT & Spell IT\server\storage\vocab-media\pilot\batch-d1\` |
| Destination | `…\SIWI-login-auth-only\server\storage\vocab-media\pilot\batch-d1\` |
| Method | `Copy-Item` per file; skip if target exists |
| Copied | **750** |
| Skipped (already present) | **0** |
| Failed | **0** |
| Sample SHA-256 | 10 random pairs source↔dest — **0 mismatches** |
| Regenerated | **None** |
| Overwrote originals | **No** |

### 4.2 API routing (staging worktree)

Restored in `server/src/app.ts`:

- `VOCAB_MEDIA` → `../storage/vocab-media`
- `app.use("/media/vocab", … Cross-Origin-Resource-Policy: cross-origin)`
- `express.static(VOCAB_MEDIA)`

Staging API process auto-restarted via `tsx` watch after the change.

### 4.3 What was not done

- No production / VPS media upload  
- No Play deploy  
- No git commit / push  
- No Grades 2–4 activation  
- No `imageUrl` database updates  
- No image regeneration / AI redraw  

---

## 5. Verification results

### 5.1 Bulk HTTP check

| Field | Value |
|-------|--------|
| Script | `exports/_verify_g1_images.mjs` |
| Results JSON | `exports/_g1_image_verify_results.json` |
| Base URL | `http://127.0.0.1:4100/media/vocab/pilot/batch-d1` |
| Total | 750 |
| OK (HTTP 200 + image body) | **750** |
| Fail | **0** |

### 5.2 Evidence of successful image loading (samples)

| Word | Filename | HTTP | Bytes |
|------|----------|-----:|------:|
| cat | `cmw6ugnmn004ghtzstce48ssy.jpg` | 200 | 181383 |
| dog | `cmw6ugnmp004ihtzsduz36nul.jpg` | 200 | 143768 |
| bird | `cmw6ugnmq004khtzsotr354e6.jpg` | 200 | 189100 |
| fish | `cmw6ugnmr004mhtzs0sehhx6m.jpg` | 200 | 146608 |
| cow | `cmw6ugnmt004ohtzs1wx1d3e9.jpg` | 200 | (see results JSON) |

Also confirmed:

- `Content-Type: image/jpeg`
- LAN URL `http://192.168.1.20:4100/media/vocab/pilot/batch-d1/cmw6ugnmn004ghtzstce48ssy.jpg` returns **200** (same file)
- Control: existing `batch-d2` sample also returns **200** after mount restore (routing fix validated)

### 5.3 Disk inventory after restore

| Path | JPG count |
|------|----------:|
| `server/storage/vocab-media/pilot/batch-d1` | 750 |
| `server/storage/vocab-media/pilot/batch-d2` | 30 (unchanged Level-2 pilot; not in this Grade-1 restore) |

---

## 6. Remaining failures

**None** for Grade 1 `batch-d1` on this staging host after restore + mount fix.

---

## 7. Restrictions compliance

| Rule | Status |
|------|--------|
| Staging only | Yes (`:5437` / `:4100`) |
| No production modification | Yes |
| No Grades 2–4 activation | Yes |
| No regenerate unless missing | Yes — copied existing originals only |
| No overwrite of original media | Yes — destination was empty; source untouched |
| Preserve stashes / local work | Yes (`stash@{0}` retained) |
| No commit / push / deployment | Yes |

---

## 8. Stop gate

Staging verification complete (**750/750**).  

**Stopped.** Do not proceed to production media sync or release until separately approved.
