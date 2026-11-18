# Level-2 Pilot Production Pre-Cutover Report

Generated: 2026-11-17T15:41:17.582Z
Mode: READ-ONLY (no UPDATE / no --apply)

## Summary

| Check | Result |
|------|--------|
| Mapping rows | 30 |
| DB records found | 30 |
| Valid LEVEL_2 targets | 30 |
| Proposed imageUrl changes | 30 |
| Already at proposed URL | 0 |
| Missing records | 0 |
| Duplicate wordIds | 0 |
| Wrong-level / conflicts | 0 |
| Level-1 targets in mapping | 0 |
| Database writes | **0** |

## Database connection

- Mode: `local`
- Host (redacted): `loca…`

## Public URL verification (from CSV)

- Source: `exports/level2-3d-image-pilot-30-url-verification.csv`
- PASS count: 30 / 30

## Level-1 protection

- Update scope: exact 30 wordIds only
- LEVEL_1 IDs among targets: 0
- batch-d1 not targeted: yes (URLs use `pilot/batch-d2` only)

## Errors

- none

## Warnings

- none

## Backup

`exports/level2-3d-image-pilot-30-production-precutover-backup-2026-11-17T15-41-17-233Z.json`

## Sample proposed changes (first 5)

- `cmwczbkik006fkoeuf2lekxiu` (bunch): `null` → `https://api.siwiapp.shop/media/vocab/pilot/batch-d2/cmwczbkik006fkoeuf2lekxiu.jpg`
- `cmwczbkih006dkoeudx49i6jt` (class): `null` → `https://api.siwiapp.shop/media/vocab/pilot/batch-d2/cmwczbkih006dkoeudx49i6jt.jpg`
- `cmwczbkim006hkoeuiog08c3v` (crowd): `null` → `https://api.siwiapp.shop/media/vocab/pilot/batch-d2/cmwczbkim006hkoeuiog08c3v.jpg`
- `cmwczbkia0067koeu65wdwo7q` (flock): `null` → `https://api.siwiapp.shop/media/vocab/pilot/batch-d2/cmwczbkia0067koeu65wdwo7q.jpg`
- `cmwczbkic0069koeuf06u51px` (herd): `null` → `https://api.siwiapp.shop/media/vocab/pilot/batch-d2/cmwczbkic0069koeuf06u51px.jpg`

## Production dry-run (`apply-l2-pilot-batch-d2-cutover.mjs`)

- Command: `PUBLIC_MEDIA_ORIGIN=https://api.siwiapp.shop node server/scripts/apply-l2-pilot-batch-d2-cutover.mjs` (no `--apply`)
- `apply`: **false**
- matched: **30**
- errors: **0**
- `previousImageUrl`: all **null** (sample)
- `nextImageUrl` pattern: `https://api.siwiapp.shop/media/vocab/pilot/batch-d2/{wordId}.jpg`
- Script dry-run backup: `exports/level2-3d-image-pilot-30-cutover-script-dryrun-backup-2026-11-17T15-41-40-843Z.json`
- Database writes from dry-run: **0**

## Public URL re-check

- `node server/scripts/verify-l2-pilot-batch-d2-urls.mjs` → **30 / 30 PASS**

## Note on DB host

- Audit ran on the production VPS against the app database URL configured there (reported as localhost on the VPS). No credentials were printed.

## Gate

**READY** for separate explicit production cutover approval.
