import { Injectable } from "@nestjs/common";
import type { HealthResponse } from "@little-readers/types";
import { SUBSCRIPTION_PACKAGES } from "@little-readers/config";

@Injectable()
export class HealthService {
  getHealth(): HealthResponse & {
    packages: typeof SUBSCRIPTION_PACKAGES;
    redisConfigured: boolean;
  } {
    return {
      status: "ok",
      service: "little-readers-nestjs-api",
      phase: 1,
      architecture: "multi-tenant-school-saas",
      timestamp: new Date().toISOString(),
      packages: SUBSCRIPTION_PACKAGES,
      redisConfigured: Boolean(process.env.REDIS_URL),
    };
  }
}
