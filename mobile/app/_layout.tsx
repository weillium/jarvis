import React from 'react';
import { Slot } from 'expo-router';
import { TamaguiProvider, Theme, Text, YStack } from 'tamagui';
import { useFonts } from 'expo-font';
import { useColorScheme } from 'react-native';
import config from '../tamagui.config';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded] = useFonts({
    Inter: require('@tamagui/font-inter/otf/Inter-Medium.otf'),
    InterBold: require('@tamagui/font-inter/otf/Inter-Bold.otf'),
  });

  return (
    <TamaguiProvider config={config}>
      <Theme name={colorScheme === 'dark' ? 'dark' : 'light'}>
        {fontsLoaded ? (
          <Slot />
        ) : (
          <YStack f={1} jc="center" ai="center">
            <Text>Loading...</Text>
          </YStack>
        )}
      </Theme>
    </TamaguiProvider>
  );
}
