require('dotenv/config');

module.exports = {
  expo: {
    name: 'mobile',
    slug: 'mobile',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    scheme: 'mobile',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    ios: {
      icon: './assets/icon.png',
      supportsTablet: true,
      jsEngine: 'hermes', // Enable Hermes for iOS (required for React Native DevTools)
      bundleIdentifier: 'com.jarvis.mobile',
    },
    android: {
      package: 'com.jarvis.mobile',
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/icon.png'
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      jsEngine: 'hermes', // Enable Hermes for Android (required for React Native DevTools)
    },
    web: {
      output: 'static',
      favicon: './assets/icon.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          image: './assets/images/splash-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
          backgroundColor: '#ffffff',
          dark: {
            backgroundColor: '#000000',
          },
        },
      ],
      'expo-font',
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      // Load from .env.local or .env files
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY,
      // Make all EXPO_PUBLIC_ variables available
      ...Object.keys(process.env)
        .filter((key) => key.startsWith('EXPO_PUBLIC_'))
        .reduce((acc, key) => {
          acc[key] = process.env[key];
          return acc;
        }, {}),
    },
  },
};
