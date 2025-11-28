module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // NOTE: this is optional, you may want to remove it if you aren't using Tamagui
      // TEMPORARILY DISABLED FOR TESTING
      // [
      //   '@tamagui/babel-plugin',
      //   {
      //     components: ['@jarvis/ui-core', 'tamagui'],
      //     config: './tamagui.config.ts',
      //     logTimings: true,
      //     disableExtraction: process.env.NODE_ENV === 'development',
      //   },
      // ],
      // NOTE: this is required, you must add this plugin
      'react-native-reanimated/plugin',
    ],
  };
};
