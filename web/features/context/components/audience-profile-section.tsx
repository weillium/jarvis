'use client';

import type { BlueprintAudienceProfile } from './blueprint-display-utils';

interface AudienceProfileSectionProps {
  audienceProfile: BlueprintAudienceProfile;
}

export function AudienceProfileSection({ audienceProfile }: AudienceProfileSectionProps) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <h5
        style={{
          fontSize: '14px',
          fontWeight: '600',
          color: '#0f172a',
          marginBottom: '8px',
        }}
      >
        Audience Profile
      </h5>
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '16px',
          color: '#475569',
          fontSize: '13px',
          display: 'grid',
          gap: '12px',
        }}
      >
        <div>{audienceProfile.audience_summary}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {audienceProfile.primary_roles.map((role, idx) => (
            <span
              key={`audience-role-${idx}`}
              style={{
                display: 'inline-block',
                padding: '4px 10px',
                background: '#ecfeff',
                color: '#0f766e',
                borderRadius: '6px',
                fontSize: '12px',
              }}
            >
              {role}
            </span>
          ))}
        </div>
        <div>
          <strong>Core Needs</strong>
          <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
            {audienceProfile.core_needs.map((need, idx) => (
              <li key={`audience-need-${idx}`} style={{ marginBottom: '4px' }}>
                {need}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <strong>Desired Outcomes</strong>
          <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
            {audienceProfile.desired_outcomes.map((outcome, idx) => (
              <li key={`audience-outcome-${idx}`} style={{ marginBottom: '4px' }}>
                {outcome}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <strong>Tone & Voice:</strong> {audienceProfile.tone_and_voice}
        </div>
        <div>
          <strong>Cautionary Notes</strong>
          <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
            {audienceProfile.cautionary_notes.map((note, idx) => (
              <li key={`audience-note-${idx}`} style={{ marginBottom: '4px' }}>
                {note}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

