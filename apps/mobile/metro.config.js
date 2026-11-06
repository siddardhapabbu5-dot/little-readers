const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");
const sharedRoot = path.resolve(monorepoRoot, "packages/shared");
const typesRoot = path.resolve(monorepoRoot, "packages/types");
const appNodeModules = path.resolve(projectRoot, "node_modules");

// Prefer app-local packages; fall back to root hoisted copies when needed.
function resolveFromApp(...segments) {
  const local = path.join(appNodeModules, ...segments);
  if (require("fs").existsSync(local)) return local;
  return path.join(monorepoRoot, "node_modules", ...segments);
}

const reactRoot = resolveFromApp("react");
const reactNativeRoot = resolveFromApp("react-native");
const reactDomRoot = resolveFromApp("react-dom");

const config = getDefaultConfig(projectRoot);

// Keep Expo defaults, then add monorepo roots (required for workspaces).
const defaults = config.watchFolders ?? [];
config.watchFolders = Array.from(
  new Set([...defaults, monorepoRoot, sharedRoot, typesRoot])
);
config.resolver.nodeModulesPaths = [
  appNodeModules,
  path.resolve(monorepoRoot, "node_modules"),
];
config.resolver.extraNodeModules = {
  "@little-readers/shared": sharedRoot,
  "@little-readers/types": typesRoot,
  // Force singletons — root React 19 from web/ui must not enter the mobile bundle.
  react: reactRoot,
  "react-dom": reactDomRoot,
  "react-native": reactNativeRoot,
};

const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === "react" ||
    moduleName === "react/jsx-runtime" ||
    moduleName === "react/jsx-dev-runtime"
  ) {
    const filePath =
      moduleName === "react"
        ? path.join(reactRoot, "index.js")
        : path.join(reactRoot, `${moduleName.replace("react/", "")}.js`);
    return { type: "sourceFile", filePath };
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
