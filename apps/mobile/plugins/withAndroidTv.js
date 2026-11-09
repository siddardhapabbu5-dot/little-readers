/**
 * Android TV / Google TV support for the same app (com.littlereaders.app):
 * - LEANBACK_LAUNCHER entry + 320x180 banner so the app shows on the TV home screen
 * - leanback / touchscreen / camera / portrait marked "not required" so Google Play
 *   offers the app to TVs (phones still get camera + portrait)
 * - phones stay locked to portrait; TVs run landscape (set in MainActivity.onCreate)
 * JS renders the TV-only screens when Platform.isTV (see tv/TvRoot.tsx).
 */
const fs = require("fs");
const path = require("path");
const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withDangerousMod,
  withMainActivity,
} = require("expo/config-plugins");

const OPTIONAL_FEATURES = [
  "android.software.leanback",
  "android.hardware.touchscreen",
  "android.hardware.camera",
  "android.hardware.camera.autofocus",
  "android.hardware.screen.portrait",
];
const MARKER = "// lw-android-tv-orientation";

function withTvManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    const features = (manifest["uses-feature"] = manifest["uses-feature"] ?? []);
    for (const name of OPTIONAL_FEATURES) {
      const existing = features.find((f) => f.$?.["android:name"] === name);
      if (existing) existing.$["android:required"] = "false";
      else features.push({ $: { "android:name": name, "android:required": "false" } });
    }

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.$["android:banner"] = "@drawable/tv_banner";

    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    // Orientation is chosen at runtime (portrait phone, landscape TV).
    activity.$["android:screenOrientation"] = "unspecified";
    const launcher = (activity["intent-filter"] ?? []).find((f) =>
      (f.action ?? []).some((a) => a.$?.["android:name"] === "android.intent.action.MAIN")
    );
    if (launcher) {
      launcher.category = launcher.category ?? [];
      const leanback = "android.intent.category.LEANBACK_LAUNCHER";
      if (!launcher.category.some((c) => c.$?.["android:name"] === leanback)) {
        launcher.category.push({ $: { "android:name": leanback } });
      }
    }
    return cfg;
  });
}

function withTvOrientation(config) {
  return withMainActivity(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes(MARKER)) return cfg;
    src = src.replace(
      /super\.onCreate\((null|savedInstanceState)\)/,
      (call) =>
        `${call}\n    ${MARKER}\n` +
        `    val lwUiMode = getSystemService(android.content.Context.UI_MODE_SERVICE) as android.app.UiModeManager\n` +
        `    requestedOrientation =\n` +
        `        if (lwUiMode.currentModeType == android.content.res.Configuration.UI_MODE_TYPE_TELEVISION)\n` +
        `            android.content.pm.ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE\n` +
        `        else android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT`
    );
    cfg.modResults.contents = src;
    return cfg;
  });
}

function withTvBanner(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const src = path.join(cfg.modRequest.projectRoot, "assets", "tv-banner.png");
      const dir = path.join(cfg.modRequest.platformProjectRoot, "app", "src", "main", "res", "drawable-xhdpi");
      fs.mkdirSync(dir, { recursive: true });
      fs.copyFileSync(src, path.join(dir, "tv_banner.png"));
      return cfg;
    },
  ]);
}

function withAndroidTv(config) {
  return withTvBanner(withTvOrientation(withTvManifest(config)));
}

module.exports = createRunOncePlugin(withAndroidTv, "withAndroidTv", "1.0.0");
