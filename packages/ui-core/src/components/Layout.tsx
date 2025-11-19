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
  gap: '$1.5',
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
  overflowX: 'auto',
  flexWrap: 'nowrap',
  paddingVertical: '$3',
  paddingHorizontal: '$1',
  scrollSnapType: 'x mandatory',
  scrollbarWidth: 'none',
  msOverflowStyle: 'none',
  '&::-webkit-scrollbar': {
    display: 'none',
  },
});
