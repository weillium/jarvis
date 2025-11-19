'use client';

import type { ReactNode, KeyboardEvent } from 'react';
import { XStack, YStack, type StackProps } from 'tamagui';
import { Input } from './Input';
import { Body } from './Typography';

export interface FileListItemProps extends StackProps {
  icon?: ReactNode;
  name: string;
  secondaryText?: ReactNode;
  editable?: boolean;
  value?: string;
  onValueChange?: (value: string) => void;
  onInputKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  actions?: ReactNode;
  backgroundColor?: string;
}

export function FileListItem({
  icon,
  name,
  secondaryText,
  editable = false,
  value,
  onValueChange,
  onInputKeyDown,
  disabled = false,
  actions,
  backgroundColor = '$gray1',
  ...stackProps
}: FileListItemProps) {
  const handleChange = (nextValue: string) => {
    onValueChange?.(nextValue);
  };

  const secondary =
    typeof secondaryText === 'string' ? (
      <Body size="xs" tone="muted">
        {secondaryText}
      </Body>
    ) : (
      secondaryText
    );

  return (
    <XStack
      alignItems="center"
      gap="$3"
      padding="$3"
      backgroundColor={backgroundColor}
      borderWidth={1}
      borderColor="$borderColor"
      borderRadius="$3"
      {...stackProps}
    >
      {icon ? (
        <YStack width={20} height={20} color="$gray9" flexShrink={0}>
          {icon}
        </YStack>
      ) : null}

      <YStack flex={1} minWidth={0}>
        {editable ? (
          <Input
            value={value}
            onChangeText={handleChange}
            onKeyDown={onInputKeyDown}
            disabled={disabled}
            fontSize="$3"
            fontWeight="500"
            padding="$1"
            backgroundColor={disabled ? '$gray1' : '$background'}
          />
        ) : (
          <Body size="sm" weight="medium" numberOfLines={1} ellipsizeMode="tail">
            {name}
          </Body>
        )}
        {secondary ? <YStack marginTop="$1">{secondary}</YStack> : null}
      </YStack>

      {actions ? (
        <XStack gap="$2" alignItems="center">
          {actions}
        </XStack>
      ) : null}
    </XStack>
  );
}
