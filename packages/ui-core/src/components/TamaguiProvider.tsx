'use client';

import type { ReactNode } from 'react';
import { TamaguiProvider as BaseTamaguiProvider } from 'tamagui';
import config from '../tamagui.config';

interface TamaguiProviderProps {
  children: ReactNode;
}

export function TamaguiProvider({ children }: TamaguiProviderProps) {
  return (
    <BaseTamaguiProvider 
      config={config} 
      defaultTheme="light"
      disableInjectCSS={false}
    >
      {children}
    </BaseTamaguiProvider>
  );
}

