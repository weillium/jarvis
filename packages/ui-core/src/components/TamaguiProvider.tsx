'use client';

import { TamaguiProvider as BaseTamaguiProvider } from 'tamagui';
import config from '../tamagui.config';

interface TamaguiProviderProps {
  children: React.ReactNode;
}

export function TamaguiProvider({ children }: TamaguiProviderProps) {
  return (
    <BaseTamaguiProvider config={config} defaultTheme="light">
      {children}
    </BaseTamaguiProvider>
  );
}

