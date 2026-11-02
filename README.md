# Little Readers — Multi-School Educational SaaS

Central platform for **many independent schools**.  
English literacy for ages **3–12** · School + Home · Teacher tasks + adaptive learning · **Annual school subscription**

## Architecture

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for multi-tenant design, roles, engines, and target structure.  
Phase roadmap: **[docs/PHASES.md](docs/PHASES.md)**

## Phase status

| Phase | Focus | Status |
|------:|-------|--------|
| **1** | Monorepo setup and architecture | **Current** |
| 2 | Database, authentication, tenant isolation | Next |
| 3–12 | Schools → teachers → students → curriculum → speech → parents → payments → mobile → hardening | Pending |

## Monorepo

```
apps/api          NestJS REST API (primary)
apps/web          Next.js portals (super-admin / school / teacher / student / parent / kids)
apps/mobile       Expo scaffold
server            Legacy Express API (preserved working auth/children)
packages/*        types, validation, shared, ui, config, tenant
docs/             Architecture & API notes
```

## Quick start (Phase 1)

```powershell
npm install --include=dev
Copy-Item .env.example .env   # if needed

docker compose up -d          # postgres :5437 + redis :6379

# NestJS foundation API
npm run dev:api               # http://localhost:4200/api/health

# Optional: keep legacy parent auth working
npm run dev:legacy-server     # http://localhost:4100/api/health

# Website
npm run dev:web               # http://localhost:3100
```

## Verify Phase 1

```powershell
Invoke-RestMethod http://localhost:4200/api/health
npm run test:api
```

Open portal shells (no fake stats):

- http://localhost:3100/super-admin
- http://localhost:3100/school
- http://localhost:3100/teacher
- http://localhost:3100/student
- http://localhost:3100/parent
- http://localhost:3100/kids

## Subscription packages (config defaults)

| Package | Capacity | Annual (INR) |
|---------|----------|--------------|
| Starter | 100 | 15,000 |
| Standard | 300 | 35,000 |
| Premium | 750 | 75,000 |
| Enterprise | 1500+ | Custom |

Super Admin can edit prices in later phases. **No unverified payment activation.**

## Notes

- Existing parent/kids Express features are **preserved** under `server/` during NestJS cutover.
- Full multi-tenant Prisma schema + RLS starts in **Phase 2**.
- Windows folder names containing `&` should use PowerShell / node-invoked scripts.

## License

UNLICENSED — all rights reserved.
