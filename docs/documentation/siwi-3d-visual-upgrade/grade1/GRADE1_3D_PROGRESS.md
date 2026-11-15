# Grade 1 — 3D text-free image progress

**Rule:** Every new image is **text-free** — no letters, no words, no answer printed on the picture (unlike old 2D flashcards).

**Date:** 15 Nov 2026  
**Scope:** Staging overlay only · no DB cutover · no production deploy yet

---

## Totals

| Item | Count |
|------|------:|
| Grade 1 words | 750 |
| Categories | 10 |
| 3D mapped so far | **750** |
| Remaining | **0** |

## Category status

| Category | Words | 3D done | Status |
|----------|------:|--------:|--------|
| Family and People | 75 | 75 | **Done** |
| Animals | 75 | 75 | **Done** |
| Body Parts | 75 | 75 | **Done** |
| Colors and Shapes | 75 | 75 | **Done** |
| Fruits and Vegetables | 75 | 75 | **Done** |
| Food and Drinks | 75 | 75 | **Done** |
| Action Words (Verbs) | 75 | 75 | **Done** |
| Household Objects | 75 | 75 | **Done** |
| Nature and Environment | 75 | 75 | **Done** |
| School and Classroom | 75 | 75 | **Done** |

## Quality gate

- Reject / regenerate images with letters, words, or numbers on the artwork.
- Soft Pixar-like 3D, lavender/cream studio background, square 1024×1024 JPG.
- Served at `/media/vocab/pilot/batch-d1/{wordId}.jpg` via staging overlay map `apps/mobile/data/pilot-batch-d1.json`.
- Synced map copy: `C:\siwi-clean\apps\mobile\data\pilot-batch-d1.json`.
