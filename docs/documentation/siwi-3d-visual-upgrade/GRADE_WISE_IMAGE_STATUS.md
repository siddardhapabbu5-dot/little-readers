# Grade-wise image status

**Date:** 15 Nov 2026  

---

## Summary

| Grade | Words | Text-free 3D ready | Live cutover |
|-------|------:|-------------------:|--------------|
| 1 | 750 | **750** | Hostinger script `HOSTINGER-GO-LIVE-G1-3D.txt` |
| 2 | 1,100 | 0 | Pending |
| 3 | 1,074 | 0 | Pending |
| 4 | 1,431 | 0 | Pending |

## Grade 1 notes

- Assets: `server/storage/vocab-media/pilot/batch-d1/{wordId}.jpg`
- Public URL: `https://api.siwiapp.shop/media/vocab/pilot/batch-d1/{wordId}.jpg`
- Map: `apps/mobile/data/pilot-batch-d1.json` (750 ids)
- Cutover script: `server/scripts/apply-g1-3d-cutover.mjs`
- Legacy PNGs are kept on disk for rollback
