import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { ensureDemoLogins } from "./lib/ensure-demo-logins.js";
import { startProgrammePublisher } from "./programmes/publisher.service.js";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`Little Readers API listening on http://localhost:${env.PORT}`);
  console.log(`Health check: http://localhost:${env.PORT}/api/health`);
  startProgrammePublisher();
  void ensureDemoLogins()
    .then((result) => {
      if (result.skipped) return;
      console.log("Demo logins ready (auto-restored on API start):");
      for (const line of result.accounts) console.log(`  ${line}`);
    })
    .catch((err) => {
      console.warn("Demo login ensure failed:", err);
    });
});
