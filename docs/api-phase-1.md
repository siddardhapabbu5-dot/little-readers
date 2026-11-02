# API — Multi-School Phase 1

## NestJS (primary foundation)

Base URL: `http://localhost:4200/api`

### `GET /health`

Returns architecture health for Phase 1 (no fake school metrics).

```json
{
  "data": {
    "status": "ok",
    "service": "little-readers-nestjs-api",
    "phase": 1,
    "architecture": "multi-tenant-school-saas",
    "packages": [ ... ],
    "redisConfigured": true
  }
}
```

Auth, tenant guards, schools, and BullMQ processors begin in **Phase 2**.

## Legacy Express (preserved)

Base URL: `http://localhost:4100/api`

Still serves working parent register/login and children APIs from the previous build so existing accounts keep working during the NestJS cutover.
