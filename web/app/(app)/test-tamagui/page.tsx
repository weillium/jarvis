'use client';

import { SmokeTest } from '@jarvis/ui-core';

export default function TestTamaguiPage() {
  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '24px', fontSize: '24px', fontWeight: '600' }}>
        Tamagui Smoke Test
      </h1>
      <SmokeTest />
    </div>
  );
}

