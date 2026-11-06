const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");
const sharedRoot = path.resolve(monorepoRoot, "packages/shared");
const typesRoot = path.resolve(monorepoRoot, "packages/types");

const config = getDefaultConfig(projectRoot);

// Keep Expo defaults, then add monorepo roots (required for workspaces).
const defaults = config.watchFolders ?? [];
config.watchFolders = Array.from(
  new Set([...defaults, monorepoRoot, sharedRoot, typesRoot])
);
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];
config.resolver.extraNodeModules = {
  "@little-readers/shared": sharedRoot,
  "@little-readers/types": typesRoot,
};

module.exports = config;
