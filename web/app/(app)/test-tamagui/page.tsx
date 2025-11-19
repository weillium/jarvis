'use client';

import { SmokeTest, YStack, Heading } from '@jarvis/ui-core';

export default function TestTamaguiPage() {
  return (
    <YStack padding="$6" maxWidth={800} marginHorizontal="auto" width="100%" gap="$4">
      <Heading level={3}>Tamagui Smoke Test</Heading>
      <SmokeTest />
    </YStack>
  );
}
