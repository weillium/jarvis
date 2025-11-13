'use client';

import { ReactNode } from 'react';
import { useTabs } from '@jarvis/ui-core';

interface Tab {
  id: string;
  label: string;
  content: ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
}

export function Tabs({ tabs, defaultTab }: TabsProps) {
  const { activeTabId, selectTab, activeTab } = useTabs(tabs, { defaultTabId: defaultTab });
  const activeTabContent = activeTab?.content;

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: '12px',
      overflow: 'hidden',
    }}>
      {/* Tab Headers */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #e2e8f0',
        background: '#f8fafc',
        overflowX: 'auto',
      }}>
        {tabs.map((tab) => {
          const isActive = activeTabId === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => selectTab(tab.id)}
              style={{
                padding: '12px 24px',
                border: 'none',
                background: isActive ? '#ffffff' : 'transparent',
                borderBottom: isActive ? '2px solid #3b82f6' : '2px solid transparent',
                color: isActive ? '#3b82f6' : '#64748b',
                fontSize: '14px',
                fontWeight: isActive ? '600' : '500',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s',
                position: 'relative',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = '#f1f5f9';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div style={{
        padding: '24px',
      }}>
        {activeTabContent}
      </div>
    </div>
  );
}

interface SubTabsProps {
  tabs: Tab[];
  defaultTab?: string;
}

export function SubTabs({ tabs, defaultTab }: SubTabsProps) {
  const { activeTabId, selectTab, activeTab } = useTabs(tabs, { defaultTabId: defaultTab });
  const activeTabContent = activeTab?.content;

  return (
    <div>
      {/* Sub Tab Headers */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid #e2e8f0',
        marginBottom: '24px',
        overflowX: 'auto',
      }}>
        {tabs.map((tab) => {
          const isActive = activeTabId === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => selectTab(tab.id)}
              style={{
                padding: '10px 20px',
                border: 'none',
                background: 'transparent',
                borderBottom: isActive ? '2px solid #3b82f6' : '2px solid transparent',
                color: isActive ? '#3b82f6' : '#64748b',
                fontSize: '13px',
                fontWeight: isActive ? '600' : '500',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s',
                marginBottom: '-1px',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = '#3b82f6';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = '#64748b';
                }
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Sub Tab Content */}
      <div>
        {activeTabContent}
      </div>
    </div>
  );
}

