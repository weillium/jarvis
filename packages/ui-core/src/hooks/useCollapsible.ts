'use client';

import { useCallback, useState } from 'react';

export interface UseCollapsibleOptions {
  readonly defaultOpen?: boolean;
}

export interface UseCollapsibleResult {
  readonly isOpen: boolean;
  readonly open: () => void;
  readonly close: () => void;
  readonly toggle: () => void;
}

export function useCollapsible(options: UseCollapsibleOptions = {}): UseCollapsibleResult {
  const { defaultOpen = false } = options;
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const open = useCallback(() => {
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((previous) => !previous);
  }, []);

  return {
    isOpen,
    open,
    close,
    toggle,
  };
}
