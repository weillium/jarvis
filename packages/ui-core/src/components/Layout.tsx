'use client';

import { styled, YStack, XStack, XGroup } from 'tamagui';

export const PageContainer = styled(YStack, {
  name: 'PageContainer',
  width: '100%',
  maxWidth: 1440,
  marginHorizontal: 'auto',
  paddingHorizontal: '$6',
  paddingVertical: '$6',
  gap: '$5',
});

export const PageHeader = styled(YStack, {
  name: 'PageHeader',
  gap: '$2',
  width: '100%',
  minWidth: 0,
  // Ensure proper spacing between title and subtitle
  // Tamagui space tokens are in px but scale responsively
  // $5 = 20px provides adequate spacing to prevent overlap
  // Container grows to fit content height naturally
});

const BaseToolbar = styled(XGroup, {
  name: 'Toolbar',
  gap: '$3',
  alignItems: 'center',
  width: '100%',
  flexWrap: 'nowrap',
  display: 'flex',
  minWidth: 0,
});

const ToolbarItemFrame = styled(XStack, {
  display: 'flex',
  alignItems: 'center',
  minWidth: 0,
  flexShrink: 1,
  flexBasis: 0,
  flexGrow: 0,
});

type ToolbarItemProps = React.ComponentProps<typeof ToolbarItemFrame>;

const ToolbarItem = (props: ToolbarItemProps) => (
  <XGroup.Item>
    <ToolbarItemFrame {...props} />
  </XGroup.Item>
);

type ToolbarComponent = typeof BaseToolbar & { Item: typeof ToolbarItem };

export const Toolbar: ToolbarComponent = Object.assign(BaseToolbar, { Item: ToolbarItem });

export const ToolbarSpacer = styled(XGroup.Item, {
  name: 'ToolbarSpacer',
  flex: 1,
  minWidth: 0,
});

export const HorizontalScrollArea = styled(XStack, {
  name: 'HorizontalScrollArea',
  gap: '$6',
  overflow: 'scroll',
  flexWrap: 'nowrap',
  paddingVertical: '$3',
  paddingHorizontal: '$1',
});
