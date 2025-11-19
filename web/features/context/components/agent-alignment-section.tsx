'use client';

import type { BlueprintAgentAlignment } from '@/shared/hooks/use-blueprint-full-query';

interface AgentAlignmentSectionProps {
  agentAlignment: BlueprintAgentAlignment;
}

export function AgentAlignmentSection({ agentAlignment }: AgentAlignmentSectionProps) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <h5 style={{
        fontSize: '14px',
        fontWeight: '600',
        color: '#0f172a',
        marginBottom: '8px',
      }}>
        Agent Alignment
      </h5>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
      }}>
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px' }}>
          <h6 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
            Facts Agent
          </h6>
          <div style={{ fontSize: '12px', color: '#475569' }}>
            <strong>Highlights</strong>
            <ul style={{ margin: '4px 0 8px 16px', padding: 0 }}>
              {(agentAlignment.facts?.highlights ?? []).length > 0 ? (
                agentAlignment.facts?.highlights?.map((item, idx) => (
                  <li key={`facts-highlight-${idx}`} style={{ marginBottom: '4px' }}>
                    {item}
                  </li>
                ))
              ) : (
                <li style={{ listStyle: 'none', color: '#94a3b8' }}>No highlights captured</li>
              )}
            </ul>
            <strong>Open Questions</strong>
            <ul style={{ margin: '4px 0', padding: '0 0 0 16px' }}>
              {(agentAlignment.facts?.open_questions ?? []).length > 0 ? (
                agentAlignment.facts?.open_questions?.map((item, idx) => (
                  <li key={`facts-question-${idx}`} style={{ marginBottom: '4px' }}>
                    {item}
                  </li>
                ))
              ) : (
                <li style={{ listStyle: 'none', color: '#94a3b8' }}>No open questions</li>
              )}
            </ul>
          </div>
        </div>
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '12px' }}>
          <h6 style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
            Cards Agent
          </h6>
          <div style={{ fontSize: '12px', color: '#475569' }}>
            <strong>Assets</strong>
            <ul style={{ margin: '4px 0 8px 16px', padding: 0 }}>
              {(agentAlignment.cards?.assets ?? []).length > 0 ? (
                agentAlignment.cards?.assets?.map((item, idx) => (
                  <li key={`cards-asset-${idx}`} style={{ marginBottom: '4px' }}>
                    {item}
                  </li>
                ))
              ) : (
                <li style={{ listStyle: 'none', color: '#94a3b8' }}>No assets identified</li>
              )}
            </ul>
            <strong>Open Questions</strong>
            <ul style={{ margin: '4px 0', padding: '0 0 0 16px' }}>
              {(agentAlignment.cards?.open_questions ?? []).length > 0 ? (
                agentAlignment.cards?.open_questions?.map((item, idx) => (
                  <li key={`cards-question-${idx}`} style={{ marginBottom: '4px' }}>
                    {item}
                  </li>
                ))
              ) : (
                <li style={{ listStyle: 'none', color: '#94a3b8' }}>No open questions</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

