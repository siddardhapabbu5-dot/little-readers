/**
 * Forces Kotlin 1.9.25 for Expo SDK 52 / expo-modules-core Compose Compiler 1.5.15.
 * Managed workflow: mutates android/gradle.properties during prebuild only.
 */
const {
  withGradleProperties,
  createRunOncePlugin,
} = require("expo/config-plugins");

function withAndroidKotlinFix(config) {
  return withGradleProperties(config, (cfg) => {
    const keys = new Set([
      "kotlinVersion",
      "android.kotlinVersion",
      "android.suppressKotlinVersionCompatibilityCheck",
    ]);
    cfg.modResults = cfg.modResults.filter(
      (item) => !(item.type === "property" && keys.has(item.key))
    );
    cfg.modResults.push(
      { type: "property", key: "kotlinVersion", value: "1.9.25" },
      { type: "property", key: "android.kotlinVersion", value: "1.9.25" },
      {
        type: "property",
        key: "android.suppressKotlinVersionCompatibilityCheck",
        value: "true",
      }
    );
    return cfg;
  });
}

module.exports = createRunOncePlugin(
  withAndroidKotlinFix,
  "withAndroidKotlinFix",
  "1.0.0"
);
