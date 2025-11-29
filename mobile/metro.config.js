// Learn more https://docs.expo.io/guides/customizing-metro
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withTamagui } = require("@tamagui/metro-plugin");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot, {
  // [Web-only]: Enables CSS support in Metro.
  isCSSEnabled: true
});

// Expo 49 issue: default metro config needs to include "mjs"
// https://github.com/expo/expo/issues/23180
config.resolver.sourceExts.push("mjs");

// Watch workspace root and packages for pnpm compatibility
config.watchFolders = [workspaceRoot, path.resolve(workspaceRoot, "packages")];

// Resolve modules from workspace root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules")
];

// Ensure pnpm hoisted modules resolve correctly (e.g., expo-router)
config.resolver.extraNodeModules = new Proxy(
  {},
  {
    get: (_target, name) =>
      path.join(workspaceRoot, "node_modules", name)
  }
);

// Block nested node_modules to prevent Metro from bundling nested dependencies
// This is a safety measure - with shamefully-hoist, nested deps should be hoisted
// But we keep this to prevent any edge cases
config.resolver.blockList = [
  // Block nested react-native specifically (common issue with tamagui)
  /node_modules\/[^/]+\/node_modules\/react-native\/.*/,
];

module.exports = withTamagui(config, {
  components: ["tamagui", "@jarvis/ui-core"],
  config: "./tamagui.config.ts"
});
