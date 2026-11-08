// Extends app.json. LR_ALLOW_CLEARTEXT is set only by the "smoke-local" EAS
// profile so a test APK can reach a laptop API over plain http on the LAN.
// LR_WEB_BASE_URL (e.g. "/app") is set only when exporting the web build that
// is served under a sub-path of siwiapp.shop.
module.exports = ({ config }) => {
  let next = config;
  if (process.env.LR_ALLOW_CLEARTEXT === "1") {
    const plugins = (next.plugins ?? []).map((p) => {
      if (Array.isArray(p) && p[0] === "expo-build-properties") {
        const opts = p[1] ?? {};
        return [
          p[0],
          { ...opts, android: { ...(opts.android ?? {}), usesCleartextTraffic: true } },
        ];
      }
      return p;
    });
    next = { ...next, plugins };
  }
  if (process.env.LR_WEB_BASE_URL) {
    next = {
      ...next,
      experiments: { ...(next.experiments ?? {}), baseUrl: process.env.LR_WEB_BASE_URL },
    };
  }
  return next;
};
