'use client';

import { Tabs, YStack, Heading, Body } from '@jarvis/ui-core';

export default function TestTabsPage() {
  const tabs = [
    { id: 'tab1', label: 'Tab 1', content: <Body padding="$4">Content 1</Body> },
    { id: 'tab2', label: 'Tab 2', content: <Body padding="$4">Content 2</Body> },
    { id: 'tab3', label: 'Tab 3', content: <Body padding="$4">Content 3</Body> },
  ];

  return (
    <YStack padding="$6" gap="$6" maxWidth={800} marginHorizontal="auto">
      <Heading level={1}>Tabs Styling Test</Heading>
      <Tabs tabs={tabs} defaultTab="tab1" />
    </YStack>
  );
}
