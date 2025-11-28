// Ultra-simple layout - minimal dependencies
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

console.log('[RootLayout] SIMPLE - Module loading started');

export default function RootLayout() {
  console.log('[RootLayout] SIMPLE - Component rendering');
  
  return (
    <>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}

