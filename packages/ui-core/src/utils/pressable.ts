'use client';

import type { GestureResponderEvent } from 'react-native';
import type { MouseEvent } from 'react';
import { isWeb } from '@tamagui/constants';

type MouseEventHandler = (event: MouseEvent<any>) => void;
type GestureHandler = (event: GestureResponderEvent) => void;

export interface PressableProps {
  onPress?: GestureHandler | null;
  onClick?: MouseEventHandler;
}

export const resolvePressEvents = ({ onPress, onClick }: PressableProps) => {
  if (isWeb) {
    if (onClick) {
      return { onClick };
    }
    return {};
  }

  if (onPress) {
    return { onPress };
  }

  return {};
};
