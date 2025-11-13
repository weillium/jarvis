import { useCallback, useEffect, useMemo, useState } from 'react';

export interface TabDefinition<TId extends string = string> {
  readonly id: TId;
}

export interface UseTabsOptions<TId extends string = string> {
  readonly defaultTabId?: TId;
  readonly onChange?: (tabId: TId) => void;
}

export interface UseTabsResult<TTab extends TabDefinition> {
  readonly activeTabId?: TTab['id'];
  readonly activeTab?: TTab;
  readonly selectTab: (tabId: TTab['id']) => void;
}

export function useTabs<TTab extends TabDefinition>(
  tabs: readonly TTab[],
  options: UseTabsOptions<TTab['id']> = {},
): UseTabsResult<TTab> {
  const { defaultTabId, onChange } = options;

  const fallbackTabId = useMemo(() => {
    if (defaultTabId) {
      return defaultTabId;
    }

    return tabs[0]?.id;
  }, [defaultTabId, tabs]);

  const [activeTabId, setActiveTabId] = useState<TTab['id'] | undefined>(fallbackTabId);

  useEffect(() => {
    if (fallbackTabId && fallbackTabId !== activeTabId) {
      setActiveTabId(fallbackTabId);
    }
  }, [fallbackTabId, activeTabId]);

  useEffect(() => {
    if (!tabs.length) {
      setActiveTabId(undefined);
      return;
    }

    const hasActiveTab = tabs.some((tab) => tab.id === activeTabId);

    if (!hasActiveTab) {
      setActiveTabId(fallbackTabId);
    }
  }, [tabs, activeTabId, fallbackTabId]);

  const selectTab = useCallback(
    (tabId: TTab['id']) => {
      setActiveTabId(tabId);
      onChange?.(tabId);
    },
    [onChange],
  );

  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId), [tabs, activeTabId]);

  return {
    activeTabId,
    activeTab,
    selectTab,
  };
}
