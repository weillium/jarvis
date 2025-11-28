import { YStack, Text, Heading } from '@jarvis/ui-core';

export default function TestSimple() {
  return (
    <YStack flex={1} backgroundColor="red" alignItems="center" justifyContent="center" padding="$6">
      <Heading>Test Page</Heading>
      <Text>If you see this, basic rendering works!</Text>
    </YStack>
  );
}

