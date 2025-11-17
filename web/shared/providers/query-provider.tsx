'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Stale time: how long data is considered fresh (30 seconds matches current polling)
            staleTime: 1000 * 30,
            // Cache time: how long unused data stays in cache (5 minutes)
            gcTime: 1000 * 60 * 5,
            // Retry failed requests once
            retry: 1,
            // Don't refetch on window focus (too aggressive for real-time app)
            refetchOnWindowFocus: false,
            // Don't refetch on reconnect (we handle real-time updates via SSE)
            refetchOnReconnect: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

