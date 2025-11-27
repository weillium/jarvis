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

  pushSessionStatus(eventId: string, status: SessionStatusPayload): void {
    if (!this.baseUrl) {
      console.warn('[sse] Invalid SSE endpoint configured');
      return;
    }

    // Fire-and-forget: don't block on SSE pushes
    // Use a longer timeout and make it non-blocking
    void this.pushSessionStatusInternal(eventId, status).catch((err: unknown) => {
      // Only log errors, don't throw - this is fire-and-forget
      const errorMessage = err instanceof Error ? err.message : String(err);
      // Suppress timeout errors in production logs (they're expected if web server is slow)
      if (!errorMessage.includes('timeout') && !errorMessage.includes('aborted')) {
        console.warn(
          `[sse] pushSessionStatus failed for event ${eventId} (endpoint: ${this.baseUrl}): ${errorMessage}`
        );
      }
    });
  }

  private async pushSessionStatusInternal(eventId: string, status: SessionStatusPayload): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/agent-sessions/${eventId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(status),
      // Increased timeout to 10 seconds (was 5)
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const errorBody = (await response
        .json()
        .catch(() => ({ error: 'Unknown error' }))) as { error?: string };
      throw new Error(
        `Failed to push status: ${errorBody.error || response.statusText} (status: ${response.status})`
      );
    }
  }
}
