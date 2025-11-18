'use client';

import { YStack, XStack, Text, Button, Card, Input } from 'tamagui';

/**
 * Smoke test component to verify Tamagui setup
 * Use this to test that Tamagui is properly configured in both web and mobile
 */
export function SmokeTest() {
  return (
    <YStack padding="$4" gap="$4" backgroundColor="$background">
      <Card padding="$4" backgroundColor="$background" borderWidth={1} borderColor="$borderColor" borderRadius="$4">
        <YStack gap="$3">
          <Text fontSize="$6" fontWeight="600" color="$color">
            Tamagui Smoke Test
          </Text>
          <Text fontSize="$4" color="$colorHover">
            If you can see this styled component, Tamagui is working!
          </Text>
        </YStack>
      </Card>

      <XStack gap="$3" flexWrap="wrap">
        <Button backgroundColor="$blue6" color="white" pressStyle={{ scale: 0.95 }}>
          Primary Button
        </Button>
        <Button variant="outlined" borderColor="$borderColor" color="$color">
          Outlined Button
        </Button>
      </XStack>

      <YStack gap="$2">
        <Text fontSize="$3" color="$colorHover">
          Input Test:
        </Text>
        <Input
          placeholder="Type something..."
          borderWidth={1}
          borderColor="$borderColor"
          borderRadius="$3"
          padding="$3"
        />
      </YStack>

      <Card padding="$4" backgroundColor="$gray2" borderRadius="$4">
        <Text fontSize="$3" color="$gray11">
          Theme tokens are working if colors appear correctly above.
        </Text>
      </Card>
    </YStack>
  );
}

