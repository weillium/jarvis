'use client';

import { useEffect, useState } from 'react';

type RefetchInterval = number | false;

export function useVisibilityRefetchInterval(baseIntervalMs: number): RefetchInterval {
  const [interval, setInterval] = useState<RefetchInterval>(() => {
    if (typeof document === 'undefined') {
      return baseIntervalMs;
    }

    return document.visibilityState === 'visible' ? baseIntervalMs : false;
  });

  useEffect(() => {
    const updateInterval = () => {
      setInterval(document.visibilityState === 'visible' ? baseIntervalMs : false);
    };

    updateInterval();
    document.addEventListener('visibilitychange', updateInterval);

    return () => {
      document.removeEventListener('visibilitychange', updateInterval);
    };
  }, [baseIntervalMs]);

  return interval;
}

