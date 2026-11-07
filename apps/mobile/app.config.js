// Extends app.json. LR_ALLOW_CLEARTEXT is set only by the "smoke-local" EAS
// profile so a test APK can reach a laptop API over plain http on the LAN.
module.exports = ({ config }) => {
  if (process.env.LR_ALLOW_CLEARTEXT !== "1") return config;
  const plugins = (config.plugins ?? []).map((p) => {
    if (Array.isArray(p) && p[0] === "expo-build-properties") {
      const opts = p[1] ?? {};
      return [
        p[0],
        { ...opts, android: { ...(opts.android ?? {}), usesCleartextTraffic: true } },
      ];
    }
    return p;
  });
  return { ...config, plugins };
};
