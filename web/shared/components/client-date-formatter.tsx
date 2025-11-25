'use client';

import { useState, useEffect } from 'react';

/**
 * Client-only date formatter to avoid hydration mismatches.
 * Renders a placeholder during SSR and the formatted date on the client.
 */
export function ClientDateFormatter({
  date,
  format = 'localeString',
  fallback = '—',
}: {
  date: string | Date | number | null | undefined;
  format?: 'localeString' | 'localeTimeString' | 'localeDateString';
  fallback?: string;
}) {
  const [isMounted, setIsMounted] = useState(false);
  const [formatted, setFormatted] = useState<string>(fallback);

  useEffect(() => {
    setIsMounted(true);
    if (!date) {
      setFormatted(fallback);
      return;
    }

    const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
    
    if (Number.isNaN(dateObj.getTime())) {
      setFormatted(fallback);
      return;
    }

    switch (format) {
      case 'localeTimeString':
        setFormatted(dateObj.toLocaleTimeString());
        break;
      case 'localeDateString':
        setFormatted(dateObj.toLocaleDateString());
        break;
      case 'localeString':
      default:
        setFormatted(dateObj.toLocaleString());
        break;
    }
  }, [date, format, fallback]);

  // During SSR, render the fallback to avoid hydration mismatch
  if (!isMounted) {
    return <>{fallback}</>;
  }

  return <>{formatted}</>;
}

