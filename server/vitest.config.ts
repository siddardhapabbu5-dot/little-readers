import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/vitest.setup.ts"],
    testTimeout: 30000,
    // Shared Postgres seed DB — run files sequentially to avoid cross-suite pollution
    // (deactivate/unpublish in one file breaking Level-1 assertions in another).
    fileParallelism: false,
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});

