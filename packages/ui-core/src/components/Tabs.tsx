'use client';

import type { ReactNode } from 'react';
import { SizableText, Tabs as TamaguiTabs, type TabsContentProps, YStack } from 'tamagui';
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
  const { activeTabId, selectTab } = useTabs(tabs, { defaultTabId: defaultTab });

  return (
    <TamaguiTabs
      value={activeTabId}
      onValueChange={selectTab}
      orientation="horizontal"
      flexDirection="column"
      width="100%"
      borderTopLeftRadius="$4"
      borderTopRightRadius="$4"
      borderBottomLeftRadius={0}
      borderBottomRightRadius={0}
      borderWidth={1}
      overflow="hidden"
      borderColor="$borderColor"
    >
        <TamaguiTabs.List
          disablePassBorderRadius="bottom"
          aria-label="Tabs"
          overflow="scroll"
          borderBottomWidth={1}
          borderBottomColor="$borderColor"
        >
          {tabs.map((tab) => (
            <TamaguiTabs.Tab key={tab.id} value={tab.id} flex={1}>
              <SizableText fontFamily="$body" textAlign="center">
                {tab.label}
              </SizableText>
            </TamaguiTabs.Tab>
          ))}
        </TamaguiTabs.List>
        {tabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} padding={0}>
            <YStack width="100%">
              {tab.content}
            </YStack>
          </TabsContent>
        ))}
      </TamaguiTabs>
  );
}

export interface SubTabsProps {
  tabs: TabItem[];
  defaultTab?: string;
}

export function SubTabs({ tabs, defaultTab }: SubTabsProps) {
  const { activeTabId, selectTab } = useTabs(tabs, { defaultTabId: defaultTab });

  return (
    <TamaguiTabs
      value={activeTabId}
      onValueChange={selectTab}
      orientation="horizontal"
      flexDirection="column"
      width="100%"
      borderRadius={0}
    >
      <TamaguiTabs.List
        aria-label="Sub tabs"
        overflow="scroll"
        borderBottomWidth={1}
        borderBottomColor="$borderColor"
        borderRadius={0}
      >
        {tabs.map((tab) => (
          <TamaguiTabs.Tab key={tab.id} value={tab.id} borderRadius={0}>
            <SizableText fontSize="$3">{tab.label}</SizableText>
          </TamaguiTabs.Tab>
        ))}
      </TamaguiTabs.List>
      {tabs.map((tab) => (
        <TabsContent key={tab.id} value={tab.id} padding={0}>
          <YStack width="100%" padding="$10">{tab.content}</YStack>
        </TabsContent>
      ))}
    </TamaguiTabs>
  );
}

const TabsContent = (props: TabsContentProps) => {
  return (
    <TamaguiTabs.Content
      backgroundColor="$background"
      padding="$4"
      alignItems="flex-start"
      justifyContent="flex-start"
      flex={1}
      {...props}
    >
      {props.children}
    </TamaguiTabs.Content>
  );
};
