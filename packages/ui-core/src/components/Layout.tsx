'use client';

import { styled, YStack, XStack } from 'tamagui';

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
  gap: '$5',
  width: '100%',
  minWidth: 0,
  // Ensure proper spacing between title and subtitle
  // Tamagui space tokens are in px but scale responsively
  // $5 = 20px provides adequate spacing to prevent overlap
  // Container grows to fit content height naturally
});

export const Toolbar = styled(XStack, {
  name: 'Toolbar',
  gap: '$3',
  flexWrap: 'wrap',
  alignItems: 'center',
  width: '100%',
});

export const ToolbarSpacer = styled(XStack, {
  name: 'ToolbarSpacer',
  flex: 1,
});

export const HorizontalScrollArea = styled(XStack, {
  name: 'HorizontalScrollArea',
  gap: '$6',
  overflow: 'scroll',
  flexWrap: 'nowrap',
  paddingVertical: '$3',
  paddingHorizontal: '$1',
});
