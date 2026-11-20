# Learn Wise — Phone app live at https://siwiapp.shop/app (VC36 client)

**Date:** 2026-11-21  
**Surface:** Expo phone app (browser) — **not** a separate marketing site  
**URL:** https://siwiapp.shop/app  

## Deployed

| Item | Result |
|------|--------|
| Export | `exports/prod-app-web-dist-vc36` |
| Bundle | `index-f97ec356330c7beef07e828d46f90d75.js` |
| VPS path | `/var/www/siwi-app-root/app` |
| Backup | `app.bak-vc36-*` / `app.prev-vc36-*` |
| HTTP | **200** |
| Prod API in bundle | **3** |
| Session guard | **2** |
| Student Home bounce fix string | **1** |
| LAN API | **0** |

## Included client fixes

- Stale-401 session guard  
- Student-safe Home / Learn / Games / Rewards (no Parent-only 401 wipe)  
- Parent PIN / subscription-entry lineage  

Animals Listen attempts fix remains on **API** (already live earlier).
