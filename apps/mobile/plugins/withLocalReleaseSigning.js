/**
 * Local Gradle release signing for `gradlew bundleRelease` outside EAS.
 * Reads the upload keystore from Gradle properties (keep them in
 * ~/.gradle/gradle.properties, never in the repo):
 *   LW_UPLOAD_STORE_FILE, LW_UPLOAD_STORE_PASSWORD,
 *   LW_UPLOAD_KEY_ALIAS, LW_UPLOAD_KEY_PASSWORD
 * Without them the release build keeps the debug key, so EAS builds
 * (which inject their own signing) are unaffected.
 */
const { withAppBuildGradle, createRunOncePlugin } = require("expo/config-plugins");

const MARKER = "// lw-local-release-signing";

function withLocalReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes(MARKER)) return cfg;

    src = src.replace(
      /signingConfigs\s*\{\s*\n(\s*)debug\s*\{/,
      (match, indent) =>
        `signingConfigs {\n${indent}${MARKER}\n` +
        `${indent}if (project.hasProperty('LW_UPLOAD_STORE_FILE')) {\n` +
        `${indent}    release {\n` +
        `${indent}        storeFile file(LW_UPLOAD_STORE_FILE)\n` +
        `${indent}        storePassword LW_UPLOAD_STORE_PASSWORD\n` +
        `${indent}        keyAlias LW_UPLOAD_KEY_ALIAS\n` +
        `${indent}        keyPassword LW_UPLOAD_KEY_PASSWORD\n` +
        `${indent}    }\n` +
        `${indent}}\n` +
        `${indent}debug {`
    );

    src = src.replace(
      /(release\s*\{[^}]*?)signingConfig(?:\s*=\s*|\s+)signingConfigs\.debug/,
      (match, head) =>
        `${head}signingConfig = project.hasProperty('LW_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug`
    );

    cfg.modResults.contents = src;
    return cfg;
  });
}

module.exports = createRunOncePlugin(withLocalReleaseSigning, "withLocalReleaseSigning", "1.0.0");
