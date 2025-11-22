'use client';

import { ReactNode } from 'react';
import { XStack, YStack, styled, type StackProps } from 'tamagui';
import { Body } from './Typography';

const BulletListContainer = styled(YStack, {
  name: 'BulletList',
  gap: '$3',
});

const BulletListItem = styled(XStack, {
  name: 'BulletListItem',
  gap: '$2',
  alignItems: 'flex-start',
});

interface BulletListProps<T> extends Omit<StackProps, 'children'> {
  items: T[];
  renderItem?: (item: T, index: number) => ReactNode;
  emptyMessage?: ReactNode;
}

export function BulletList<T>({
  items,
  renderItem,
  emptyMessage,
  ...props
}: BulletListProps<T>) {
  if (!items.length && emptyMessage) {
    return <>{emptyMessage}</>;
  }

  if (!items.length) {
    return null;
  }

  return (
    <BulletListContainer {...props}>
      {items.map((item, index) => (
        <BulletListItem key={index}>
          <Body size="sm" tone="muted" width="auto" flexShrink={0}>
            •
          </Body>
          <Body size="sm" width="auto" flex={1}>
            {renderItem ? renderItem(item, index) : (item as ReactNode)}
          </Body>
        </BulletListItem>
      ))}
    </BulletListContainer>
  );
}

export const TagGroup = styled(XStack, {
  name: 'TagGroup',
  flexWrap: 'wrap',
  gap: '$3',
});
