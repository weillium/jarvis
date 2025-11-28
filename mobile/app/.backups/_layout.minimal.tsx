import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

// Minimal layout to test if basic routing works
export default function RootLayout() {
  console.log('[RootLayout] Minimal layout rendering');
  
  return (
    <>
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}

