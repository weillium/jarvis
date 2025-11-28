const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// Find the project and workspace directories
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// Fix for expo-router route discovery cache issue
// On second reload, expo-router's route manifest cache can become stale
// This ensures file watching works correctly for route discovery
config.watchFolders = [workspaceRoot, projectRoot];

// 1. Watch all files within the monorepo
config.watchFolders = [workspaceRoot];

// 2. Let Metro know where to resolve packages and in what order
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Enable symlinks for monorepo packages
config.resolver.unstable_enableSymlinks = true;

// 4. Enable package exports for ESM packages (but blocklist web-only ones)
config.resolver.unstable_enablePackageExports = true;

// 5. Add source extensions to handle ESM packages
config.resolver.sourceExts = [...new Set([
  'mjs', // Add mjs first for ESM packages
  ...(config.resolver.sourceExts || []),
])];

// 6. Blocklist web-only packages that don't work in React Native
// These packages are used by web-only components like MarkdownEditor and DateTimePicker
const webOnlyPackages = [
  '@uiw/react-md-editor',
  '@uiw/react-markdown-preview',
  'rehype-rewrite',
  'react-datepicker', // DateTimePicker uses this but it's web-only (uses DOM APIs)
];

// Create empty module stubs for web-only packages
const emptyModulePath = path.resolve(__dirname, 'metro-empty-module.js');

// Override resolveRequest to blocklist web-only packages
// IMPORTANT: Don't interfere with expo-router's internal module resolution
const defaultResolver = require('metro-resolver');
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // NEVER blocklist expo-router or its internal modules - it needs these for route discovery
  if (moduleName.startsWith('expo-router') || moduleName === 'expo-router') {
    return defaultResolver.resolve(context, moduleName, platform);
  }

  // NEVER blocklist app directory files or relative imports
  if (moduleName.startsWith('./') || moduleName.startsWith('../') || moduleName.startsWith('@/')) {
    return defaultResolver.resolve(context, moduleName, platform);
  }

  // Blocklist web-only packages (exact matches)
  if (webOnlyPackages.includes(moduleName)) {
    console.warn(`[Metro] Blocklisting web-only package: ${moduleName}`);
    return {
      type: 'empty',
    };
  }

  // Blocklist all @uiw packages (web-only markdown editor packages)
  if (moduleName.startsWith('@uiw/')) {
    console.warn(`[Metro] Blocklisting web-only package: ${moduleName}`);
    return {
      type: 'empty',
    };
  }

  // Blocklist rehype-* packages (web-only markdown processing)
  if (moduleName.startsWith('rehype-')) {
    console.warn(`[Metro] Blocklisting web-only package: ${moduleName}`);
    return {
      type: 'empty',
    };
  }

  // Use default resolver for everything else
  try {
    return defaultResolver.resolve(context, moduleName, platform);
  } catch (error) {
    // If resolution fails and it's a web-only package pattern, return empty
    if (moduleName.includes('markdown') || moduleName.includes('rehype')) {
      console.warn(`[Metro] Failed to resolve ${moduleName}, returning empty module`);
      return {
        type: 'empty',
      };
    }
    throw error;
  }
};

module.exports = config;
