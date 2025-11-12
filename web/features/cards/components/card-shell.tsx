'use client';

import type { ReactNode } from 'react';

interface CardShellProps {
  children: ReactNode;
}

export function CardShell({ children }: CardShellProps) {
  return (
    <div
      data-card-shell
      style={{
        flex: '0 0 auto',
        width: '360px',
        maxWidth: 'min(360px, calc(100vw - 120px))',
        scrollSnapAlign: 'center',
        transition: 'transform 0.3s ease, box-shadow 0.3s ease',
        transform: 'translateY(0)',
        boxShadow: '0 0 0 rgba(15, 23, 42, 0)',
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.transform = 'translateY(-10px)';
        event.currentTarget.style.boxShadow = '0 24px 50px rgba(15, 23, 42, 0.18)';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.transform = 'translateY(0)';
        event.currentTarget.style.boxShadow = '0 0 0 rgba(15, 23, 42, 0)';
      }}
    >
      <div
        style={{
          background: 'linear-gradient(160deg, #ffffff 0%, #f8fafc 60%, #eef2ff 100%)',
          borderRadius: '24px',
          padding: '24px',
          boxShadow: '0 18px 40px rgba(15, 23, 42, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          minHeight: '420px',
        }}
      >
        {children}
      </div>
    </div>
  );
}


