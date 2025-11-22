import type { ReactNode } from 'react';
import { QueryProvider } from '@/shared/providers/query-provider';
import { TamaguiProvider } from '@jarvis/ui-core';
import '../styles/globals.css';

export const metadata = {
  title: "Jarvis – Intelligent Event Context",
  description: "Real-time AI-powered context agents for academic events and conferences",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <TamaguiProvider>
          <QueryProvider>
            {children}
          </QueryProvider>
        </TamaguiProvider>
      </body>
    </html>
  );
}