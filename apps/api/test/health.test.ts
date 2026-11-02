import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { HealthController } from "../src/health/health.controller";
import { HealthService } from "../src/health/health.service";

describe("NestJS Health (Phase 1)", () => {
  it("returns multi-tenant architecture health payload", () => {
    const controller = new HealthController(new HealthService());
    const result = controller.health();

    expect(result.data.status).toBe("ok");
    expect(result.data.phase).toBe(1);
    expect(result.data.architecture).toBe("multi-tenant-school-saas");
    expect(result.data.packages.length).toBeGreaterThanOrEqual(4);
  });
});
