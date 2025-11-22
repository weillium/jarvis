'use client';

import {
  YStack,
  XStack,
  Heading,
  Body,
  Label,
  Caption,
  Button,
  Card,
  Alert,
  Badge,
  Input,
  Textarea,
  SmokeTest,
} from '@jarvis/ui-core';

export default function TestTamaguiPage() {
  return (
    <YStack padding="$6" maxWidth={1000} marginHorizontal="auto" width="100%" gap="$6">
      <Heading level={1}>Tamagui Diagnostic Test</Heading>
      <Body tone="muted">This page tests if Tamagui is correctly configured and all tokens/components work.</Body>

      {/* Typography Tests */}
      <Card padding="$4" gap="$4">
        <Heading level={2}>Typography Components</Heading>
        
        <YStack gap="$3">
          <YStack gap="$2">
            <Label>Headings:</Label>
            <Heading level={1}>Heading Level 1</Heading>
            <Heading level={2}>Heading Level 2</Heading>
            <Heading level={3}>Heading Level 3</Heading>
            <Heading level={4}>Heading Level 4</Heading>
            <Heading level={5}>Heading Level 5</Heading>
          </YStack>

          <YStack gap="$2">
            <Label>Body Text Sizes:</Label>
            <Body size="sm">Body Small (size="sm")</Body>
            <Body size="md">Body Medium (size="md")</Body>
            <Body size="lg">Body Large (size="lg")</Body>
          </YStack>

          <YStack gap="$2">
            <Label>Body Text Weights:</Label>
            <Body weight="regular">Body Regular Weight</Body>
            <Body weight="medium">Body Medium Weight</Body>
            <Body weight="bold">Body Bold Weight</Body>
          </YStack>

          <YStack gap="$2">
            <Label>Body Text Tones:</Label>
            <Body tone="default">Default Tone</Body>
            <Body tone="muted">Muted Tone</Body>
            <Body tone="subtle">Subtle Tone</Body>
            <Body tone="success">Success Tone</Body>
            <Body tone="warning">Warning Tone</Body>
            <Body tone="danger">Danger Tone</Body>
            <Body tone="info">Info Tone</Body>
          </YStack>

          <YStack gap="$2">
            <Label>Labels:</Label>
            <Label size="xs">Label Extra Small</Label>
            <Label size="sm">Label Small</Label>
            <Label size="md">Label Medium</Label>
          </YStack>

          <YStack gap="$2">
            <Label>Captions:</Label>
            <Caption>This is a caption</Caption>
          </YStack>
        </YStack>
      </Card>

      {/* Font Size Token Tests */}
      <Card padding="$4" gap="$4">
        <Heading level={2}>Font Size Tokens Test</Heading>
        <Body tone="muted">Testing direct fontSize token usage:</Body>
        <YStack gap="$2">
          <Body fontSize="$1">Font Size $1</Body>
          <Body fontSize="$2">Font Size $2</Body>
          <Body fontSize="$3">Font Size $3</Body>
          <Body fontSize="$4">Font Size $4</Body>
          <Body fontSize="$5">Font Size $5</Body>
          <Body fontSize="$6">Font Size $6</Body>
          <Body fontSize="$7">Font Size $7</Body>
          <Body fontSize="$8">Font Size $8</Body>
        </YStack>
      </Card>

      {/* Component Tests */}
      <Card padding="$4" gap="$4">
        <Heading level={2}>Component Tests</Heading>
        
        <YStack gap="$4">
          <YStack gap="$2">
            <Label>Buttons:</Label>
            <XStack gap="$3" flexWrap="wrap">
              <Button>Default Button</Button>
              <Button variant="outline">Outlined Button</Button>
              <Button size="sm">Small Button</Button>
              <Button size="md">Medium Button</Button>
              <Button size="lg">Large Button</Button>
            </XStack>
          </YStack>

          <YStack gap="$2">
            <Label>Badges:</Label>
            <XStack gap="$3" flexWrap="wrap">
              <Badge>Default Badge</Badge>
              <Badge variant="success">Success</Badge>
              <Badge variant="warning">Warning</Badge>
              <Badge variant="danger">Danger</Badge>
              <Badge variant="info">Info</Badge>
            </XStack>
          </YStack>

          <YStack gap="$2">
            <Label>Input:</Label>
            <Input placeholder="Test input field" />
          </YStack>

          <YStack gap="$2">
            <Label>Textarea:</Label>
            <Textarea placeholder="Test textarea field" rows={4} />
          </YStack>

          <YStack gap="$2">
            <Label>Alerts:</Label>
            <Alert variant="info">Info Alert</Alert>
            <Alert variant="success">Success Alert</Alert>
            <Alert variant="warning">Warning Alert</Alert>
            <Alert variant="danger">Danger Alert</Alert>
          </YStack>
        </YStack>
      </Card>

      {/* Token Tests */}
      <Card padding="$4" gap="$4">
        <Heading level={2}>Token Tests</Heading>
        
        <YStack gap="$4">
          <YStack gap="$2">
            <Label>Space Tokens (padding test):</Label>
            <XStack gap="$2" flexWrap="wrap">
              <Card padding="$1" backgroundColor="$gray3">
                <Body size="sm">$1</Body>
              </Card>
              <Card padding="$2" backgroundColor="$gray3">
                <Body size="sm">$2</Body>
              </Card>
              <Card padding="$3" backgroundColor="$gray3">
                <Body size="sm">$3</Body>
              </Card>
              <Card padding="$4" backgroundColor="$gray3">
                <Body size="sm">$4</Body>
              </Card>
              <Card padding="$6" backgroundColor="$gray3">
                <Body size="sm">$6</Body>
              </Card>
            </XStack>
          </YStack>

          <YStack gap="$2">
            <Label>Color Tokens:</Label>
            <XStack gap="$2" flexWrap="wrap">
              <Card padding="$3" backgroundColor="$blue6">
                <Body color="white" marginBottom={0}>Blue 6</Body>
              </Card>
              <Card padding="$3" backgroundColor="$green6">
                <Body color="white" marginBottom={0}>Green 6</Body>
              </Card>
              <Card padding="$3" backgroundColor="$red6">
                <Body color="white" marginBottom={0}>Red 6</Body>
              </Card>
              <Card padding="$3" backgroundColor="$yellow6">
                <Body color="black" marginBottom={0}>Yellow 6</Body>
              </Card>
              <Card padding="$3" backgroundColor="$gray6">
                <Body color="white" marginBottom={0}>Gray 6</Body>
              </Card>
            </XStack>
          </YStack>
        </YStack>
      </Card>

      {/* Modal with Select Test */}
      <Card padding="$4" gap="$4">
        <Heading level={2}>Modal with Select & DateTimePicker Test</Heading>
        <Body tone="muted" marginBottom="$4">
          This section tests Select dropdown and DateTimePicker components inside a Modal to verify z-index stacking.
        </Body>
        <SmokeTest />
      </Card>

      {/* Error Display */}
      <Card padding="$4" backgroundColor="$red2" borderColor="$red6" borderWidth={1}>
        <Heading level={3} color="$red11">Check Browser Console</Heading>
        <Body color="$red11" marginTop="$2">
          If you see any errors above or in the browser console, Tamagui configuration may have issues.
          Check for:
        </Body>
        <YStack marginTop="$3" gap="$1">
          <Body color="$red11" fontSize="$2">• Font size token errors</Body>
          <Body color="$red11" fontSize="$2">• Missing token warnings</Body>
          <Body color="$red11" fontSize="$2">• Component rendering errors</Body>
        </YStack>
      </Card>
    </YStack>
  );
}
