'use client';

import type { GestureResponderEvent } from 'react-native';
import type { MouseEvent } from 'react';
import { isWeb } from '@tamagui/constants';

type PressEvent = GestureResponderEvent | MouseEvent<any>;
type Handler = ((event: PressEvent) => void) | undefined;

export interface PressableProps {
  onPress?: Handler;
  onClick?: Handler;
}

export const resolvePressEvents = ({ onPress, onClick }: PressableProps) => {
  const handler = onClick ?? onPress;
  if (!handler) {
    return {};
  }

  if (isWeb) {
    return {
      onClick: handler as MouseEventHandler,
    };
  }

  return {
    onPress: handler as GestureHandler,
  };
};

type MouseEventHandler = (event: MouseEvent<any>) => void;
type GestureHandler = (event: GestureResponderEvent) => void;
