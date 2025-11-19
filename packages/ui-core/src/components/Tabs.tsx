'use client';

import type { ReactNode } from 'react';
import { Card } from './Card';
import { YStack, XStack } from 'tamagui';
import { Button } from './Button';
import { useTabs } from '../hooks/useTabs';

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

export interface TabsProps {
  tabs: TabItem[];
  defaultTab?: string;
}

export function Tabs({ tabs, defaultTab }: TabsProps) {
  const { activeTabId, selectTab, activeTab } = useTabs(tabs, { defaultTabId: defaultTab });
  const activeTabContent = activeTab?.content;

  return (
    <Card variant="outlined" padding="$0" overflow="hidden">
      <XStack
        borderBottomWidth={1}
        borderBottomColor="$borderColor"
        backgroundColor="$gray1"
        overflow="auto"
      >
        {tabs.map((tab) => {
          const isActive = activeTabId === tab.id;
          return (
            <Button
              key={tab.id}
              onPress={() => selectTab(tab.id)}
              variant="ghost"
              borderBottomWidth={2}
              borderBottomColor={isActive ? '$blue6' : 'transparent'}
              color={isActive ? '$blue11' : '$gray11'}
              fontWeight={isActive ? '600' : '500'}
              borderRadius={0}
            >
              {tab.label}
            </Button>
          );
        })}
      </XStack>
      <YStack padding="$5">{activeTabContent}</YStack>
    </Card>
  );
}

export interface SubTabsProps {
  tabs: TabItem[];
  defaultTab?: string;
}

export function SubTabs({ tabs, defaultTab }: SubTabsProps) {
  const { activeTabId, selectTab, activeTab } = useTabs(tabs, { defaultTabId: defaultTab });
  const activeTabContent = activeTab?.content;

  return (
    <YStack>
      <XStack borderBottomWidth={1} borderBottomColor="$borderColor" overflow="auto" marginBottom="$4">
        {tabs.map((tab) => {
          const isActive = activeTabId === tab.id;
          return (
            <Button
              key={tab.id}
              variant="ghost"
              onPress={() => selectTab(tab.id)}
              borderBottomWidth={2}
              borderBottomColor={isActive ? '$blue6' : 'transparent'}
              color={isActive ? '$blue11' : '$gray11'}
              fontSize="$3"
              borderRadius={0}
            >
              {tab.label}
            </Button>
          );
        })}
      </XStack>
      <YStack>{activeTabContent}</YStack>
    </YStack>
  );
}
