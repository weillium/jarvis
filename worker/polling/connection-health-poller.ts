import type {
  PostgrestResponse,
  PostgrestSingleResponse,
  SupabaseClient,
} from '@supabase/supabase-js';
import type { Poller } from './base-poller';
import type { Orchestrator } from '../runtime/orchestrator';

type LoggerFn = (...args: unknown[]) => void;

interface AgentSessionRow {
  event_id: string;
  agent_id: string;
  agent_type: 'transcript' | 'cards' | 'facts';
  status: string;
  transport: 'realtime' | 'stateless';
}

interface AgentRow {
  status: string;
  stage: string | null;
}

export class ConnectionHealthPoller implements Poller {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly orchestrator: Orchestrator,
    private readonly log: LoggerFn = console.log
  ) {}

  async tick(): Promise<void> {
    // Only check realtime sessions that are marked as active
    const activeRealtimeSessionsQuery = this.supabase
      .from('agent_sessions')
      .select('event_id, agent_id, agent_type, status, transport')
      .eq('status', 'active')
      .eq('transport', 'realtime')
      .limit(50);
    
    const response: PostgrestResponse<AgentSessionRow> = await activeRealtimeSessionsQuery;

    const { data: activeSessions, error } = response;

    if (error) {
      this.log('[connection-health] fetch error:', error.message);
      return;
    }

    if (!activeSessions || activeSessions.length === 0) {
      return;
    }

    // Group by event_id to check each event's runtime
    const eventsToCheck = new Map<string, { agentId: string; sessions: AgentSessionRow[] }>();
    for (const session of activeSessions) {
      const existing = eventsToCheck.get(session.event_id);
      if (existing) {
        existing.sessions.push(session);
      } else {
        eventsToCheck.set(session.event_id, {
          agentId: session.agent_id,
          sessions: [session],
        });
      }
    }

    for (const [eventId, { agentId, sessions }] of eventsToCheck) {
      try {
        // Verify agent is still active before proceeding
        const agentQuery = this.supabase
          .from('agents')
          .select('status, stage')
          .eq('id', agentId)
          .single();
        const agentResponse: PostgrestSingleResponse<AgentRow> = await agentQuery;
        const { data: agent } = agentResponse;

        if (!agent || agent.status !== 'active' || agent.stage !== 'running') {
          continue;
        }

        let runtime = this.orchestrator.getRuntime(eventId);
        
        // Case 1: Runtime doesn't exist (worker reloaded) - trigger startEvent to restore
        if (!runtime) {
          this.log(
            `[connection-health] Runtime missing for event ${eventId} but DB shows active sessions, triggering startEvent to restore`
          );
          try {
            await this.orchestrator.startEvent(eventId, agentId);
            // After startEvent, runtime should exist - continue to check session states
            runtime = this.orchestrator.getRuntime(eventId);
            if (!runtime || runtime.status !== 'running') {
              continue;
            }
          } catch (startError: unknown) {
            this.log(
              `[connection-health] Failed to start event ${eventId}:`,
              String(startError)
            );
            continue;
          }
        }

        // Case 2: Runtime exists but not running - skip (let other pollers handle)
        if (runtime.status !== 'running') {
          continue;
        }

        // Check if any sessions are missing before iterating
        // This avoids calling startEvent multiple times for the same event
        const missingSessions = sessions.filter((session) => {
          if (!runtime) return false;
          if (session.agent_type === 'transcript') {
            return !runtime.transcriptSession;
          } else if (session.agent_type === 'cards') {
            return !runtime.cardsSession;
          } else if (session.agent_type === 'facts') {
            return !runtime.factsSession;
          }
          return false;
        });

        // Case 3: Session objects don't exist but DB says they're active
        // This can happen after worker reload - trigger startEvent to recreate all sessions
        if (missingSessions.length > 0) {
          const missingTypes = missingSessions.map((s) => s.agent_type).join(', ');
          this.log(
            `[connection-health] Session objects missing for ${missingTypes} (event: ${eventId}) but DB shows active, triggering startEvent to recreate`
          );
          try {
            await this.orchestrator.startEvent(eventId, agentId);
            // Refresh runtime after startEvent
            runtime = this.orchestrator.getRuntime(eventId);
            if (!runtime || runtime.status !== 'running') {
              continue;
            }
          } catch (recreateError: unknown) {
            this.log(
              `[connection-health] Failed to recreate sessions for event ${eventId}:`,
              String(recreateError)
            );
            continue;
          }
        }

        // Check each session's websocket state
        for (const session of sessions) {
          let sessionStatus;
          if (session.agent_type === 'transcript') {
            sessionStatus = runtime.transcriptSession?.getStatus();
          } else if (session.agent_type === 'cards') {
            sessionStatus = runtime.cardsSession?.getStatus();
          } else if (session.agent_type === 'facts') {
            sessionStatus = runtime.factsSession?.getStatus();
          }

          // Skip if session still doesn't exist after recreation attempt
          if (!sessionStatus) {
            continue;
          }

          // Check if websocket is closed but session should be active
          const websocketState = sessionStatus.websocketState;
          const isActive = sessionStatus.isActive;

          // If DB says active but session reports not active, or websocket is closed, attempt reconnect
          // Only attempt reconnect if websocket is explicitly CLOSED (not just undefined)
          // and session should be active
          if (websocketState === 'CLOSED' && !isActive) {
            // Session is marked active in DB but websocket is closed and session is inactive
            this.log(
              `[connection-health] Detected connection issue for ${session.agent_type} session (event: ${eventId}): isActive=${isActive}, websocketState=${websocketState}, attempting reconnect`
            );

            try {
              // Use resume() which will call connect() if session is not active
              if (session.agent_type === 'transcript' && runtime.transcriptSession) {
                await runtime.transcriptSession.resume();
              } else if (session.agent_type === 'cards' && runtime.cardsSession) {
                await runtime.cardsSession.resume();
              } else if (session.agent_type === 'facts' && runtime.factsSession) {
                await runtime.factsSession.resume();
              }
            } catch (reconnectError: unknown) {
              this.log(
                `[connection-health] Reconnect attempt failed for ${session.agent_type} (event: ${eventId}):`,
                String(reconnectError)
              );
            }
          } else if (websocketState === 'CLOSED' && isActive) {
            // Session thinks it's active but websocket is closed - this is a mismatch
            // Log for visibility but don't attempt reconnect (let heartbeat or close handler deal with it)
            this.log(
              `[connection-health] Warning: ${session.agent_type} session reports active but websocket is CLOSED (event: ${eventId}) - heartbeat should handle reconnection`
            );
          }
        }
      } catch (err: unknown) {
        this.log(`[connection-health] Error checking event ${eventId}:`, String(err));
      }
    }
  }

  getInterval(): number {
    // Check every 15 seconds - frequent enough to catch issues quickly
    // but not so frequent as to cause performance issues
    return 15000;
  }
}

