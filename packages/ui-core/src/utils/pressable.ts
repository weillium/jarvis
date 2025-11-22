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
    if (onPress || onClick) {
      return {
        onClick: (event) => {
          if (onPress) {
            onPress(event as unknown as GestureResponderEvent);
          }
          onClick?.(event);
        },
      };
    }

    return {};
  }

  if (onPress) {
    return { onPress };
  }

  if (onClick) {
    return {
      onPress: (event) => {
        onClick(event as unknown as MouseEvent<any>);
      },
    };
  }

  return {};
};
