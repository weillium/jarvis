'use client';

import { useEffect, useState } from 'react';

/**
 * Returns a refetch interval value that pauses polling when the document is hidden.
 * Falls back to the provided interval when document APIs are unavailable (SSR).
 */
export function useVisibilityRefetchInterval(intervalMs: number): number | false {
  const [isVisible, setIsVisible] = useState<boolean>(() => {
    if (typeof document === 'undefined') {
      return true;
    }
    return document.visibilityState === 'visible';
  });

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const handleVisibilityChange = () => {
      setIsVisible(document.visibilityState === 'visible');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return isVisible ? intervalMs : false;
}

