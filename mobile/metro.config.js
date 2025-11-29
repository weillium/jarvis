// Learn more https://docs.expo.io/guides/customizing-metro
/**
 * @type {import('expo/metro-config').MetroConfig}
 */
const { getDefaultConfig } = require('expo/metro-config')
const { withTamagui } = require('@tamagui/metro-plugin')
const path = require('path')

const config = getDefaultConfig(__dirname, {
  // [Web-only]: Enables CSS support in Metro.
  isCSSEnabled: true,
})

config.resolver.sourceExts.push('mjs')

config.watchFolders = [
  ...(config.watchFolders || []),
  path.resolve(__dirname, '..', 'packages', 'ui-core'),
]

config.resolver.nodeModulesPaths = [
  ...(config.resolver?.nodeModulesPaths || []),
  path.resolve(__dirname, '../node_modules'),
]

module.exports = withTamagui(config, {
  components: ['tamagui', '@jarvis/ui-core'],
  config: './tamagui.config.ts',
  outputCSS: './tamagui-web.css',
  cssInterop: true,
})
