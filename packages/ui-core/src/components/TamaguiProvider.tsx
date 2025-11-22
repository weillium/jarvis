'use client';

import type { ReactNode } from 'react';
import { TamaguiProvider as BaseTamaguiProvider, PortalProvider } from 'tamagui';
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
      <PortalProvider shouldAddRootHost>
        {children}
      </PortalProvider>
    </BaseTamaguiProvider>
  );
}

