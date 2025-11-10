import type { AgentSessionStatus } from '../types';

type SessionStatusPayload = Pick<AgentSessionStatus, 'agent_type'> & Partial<AgentSessionStatus>;

export class SSEService {
  private baseUrl: string | null;

  constructor(baseUrl?: string) {
    const cleaned = (baseUrl || 'http://localhost:3000')
      .trim()
      .replace(/\/$/, '')
      .replace(/[`'"]/g, '');
    this.baseUrl = cleaned && cleaned.startsWith('http') ? cleaned : null;
  }

  getBaseUrl(): string | null {
    return this.baseUrl;
  }

  async pushSessionStatus(eventId: string, status: SessionStatusPayload): Promise<void> {
    if (!this.baseUrl) {
      console.warn('[sse] Invalid SSE endpoint configured');
      return;
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/agent-sessions/${eventId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(status),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        const errorBody = (await response
          .json()
          .catch(() => ({ error: 'Unknown error' }))) as { error?: string };
        console.warn(
          `[sse] Failed to push status for event ${eventId}: ${errorBody.error || response.statusText} (status: ${response.status})`
        );
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(
        `[sse] pushSessionStatus failed for event ${eventId} (endpoint: ${this.baseUrl})`,
        errorMessage
      );
    }
  }
}
