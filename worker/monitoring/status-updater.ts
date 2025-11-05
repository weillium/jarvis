import { AgentSessionStatus, EventRuntime, SessionStatus } from '../types';
import { SupabaseService } from '../services/supabase-service';
import { SSEService } from '../services/sse-service';
import { Logger } from './logger';
import { MetricsCollector } from './metrics-collector';

export class StatusUpdater {
  constructor(
    private supabase: SupabaseService,
    private sse: SSEService,
    private logger: Logger,
    private metrics: MetricsCollector,
    private realtimeModel: string
  ) {}

  async updateAndPushStatus(runtime: EventRuntime): Promise<void> {
    const statuses = await this.buildStatuses(runtime, true);
    runtime.updatedAt = new Date();
    await this.sse.pushSessionStatus(runtime.eventId, statuses.cards);
    await this.sse.pushSessionStatus(runtime.eventId, statuses.facts);
  }

  getRuntimeStatusSnapshot(
    runtime: EventRuntime
  ): { cards: AgentSessionStatus; facts: AgentSessionStatus } {
    return {
      cards: this.buildSessionStatus(runtime, 'cards'),
      facts: this.buildSessionStatus(runtime, 'facts'),
    };
  }

  private async buildStatuses(
    runtime: EventRuntime,
    mergeDatabase: boolean
  ): Promise<{ cards: AgentSessionStatus; facts: AgentSessionStatus }> {
    const cardsStatus = this.buildSessionStatus(runtime, 'cards');
    const factsStatus = this.buildSessionStatus(runtime, 'facts');

    if (mergeDatabase) {
      await this.mergeDatabaseInfo(runtime, cardsStatus, factsStatus);
    }

    return { cards: cardsStatus, facts: factsStatus };
  }

  private async mergeDatabaseInfo(
    runtime: EventRuntime,
    cardsStatus: AgentSessionStatus,
    factsStatus: AgentSessionStatus
  ): Promise<void> {
    const sessions = await this.supabase.getAgentSessionsForAgent(
      runtime.eventId,
      runtime.agentId
    );

    const cardsSession = sessions.find((s) => s.agent_type === 'cards');
    const factsSession = sessions.find((s) => s.agent_type === 'facts');

    if (cardsSession) {
      if (cardsSession.status) {
        cardsStatus.status = cardsSession.status as SessionStatus;
      }
      if (cardsSession.provider_session_id) {
        cardsStatus.session_id = cardsSession.provider_session_id;
      }
      if (cardsSession.created_at) {
        cardsStatus.metadata.created_at = cardsSession.created_at;
      }
      if (cardsSession.updated_at) {
        cardsStatus.metadata.updated_at = cardsSession.updated_at;
      }
      if (cardsSession.closed_at !== undefined) {
        cardsStatus.metadata.closed_at = cardsSession.closed_at ?? null;
      }
      if (cardsSession.model) {
        cardsStatus.metadata.model = cardsSession.model;
      }
    }

    if (factsSession) {
      if (factsSession.status) {
        factsStatus.status = factsSession.status as SessionStatus;
      }
      if (factsSession.provider_session_id) {
        factsStatus.session_id = factsSession.provider_session_id;
      }
      if (factsSession.created_at) {
        factsStatus.metadata.created_at = factsSession.created_at;
      }
      if (factsSession.updated_at) {
        factsStatus.metadata.updated_at = factsSession.updated_at;
      }
      if (factsSession.closed_at !== undefined) {
        factsStatus.metadata.closed_at = factsSession.closed_at ?? null;
      }
      if (factsSession.model) {
        factsStatus.metadata.model = factsSession.model;
      }
    }
  }

  private buildSessionStatus(
    runtime: EventRuntime,
    agentType: 'cards' | 'facts'
  ): AgentSessionStatus {
    const session = agentType === 'cards' ? runtime.cardsSession : runtime.factsSession;
    const sessionId = agentType === 'cards' ? runtime.cardsSessionId : runtime.factsSessionId;
    const metrics = this.metrics.getMetrics(runtime.eventId, agentType);
    const logs = this.logger.getLogs(runtime.eventId, agentType);

    let status: SessionStatus = 'closed';
    let websocketState: AgentSessionStatus['websocket_state'];
    let pingPong: AgentSessionStatus['ping_pong'];

    if (session) {
      const sessionStatus = session.getStatus();
      websocketState = sessionStatus.websocketState;
      pingPong = sessionStatus.pingPong;

      if (sessionStatus.isActive) {
        status = 'active';
      } else if (sessionId) {
        status = 'closed';
      }
    }

    return {
      agent_type: agentType,
      session_id: sessionId || 'pending',
      status,
      websocket_state: websocketState,
      ping_pong: pingPong,
      runtime: {
        event_id: runtime.eventId,
        agent_id: runtime.agentId,
        runtime_status: runtime.status,
        cards_last_seq: runtime.cardsLastSeq,
        facts_last_seq: runtime.factsLastSeq,
        facts_last_update: new Date(runtime.factsLastUpdate).toISOString(),
        ring_buffer_stats: runtime.ringBuffer.getStats(),
        facts_store_stats: runtime.factsStore.getStats(),
      },
      token_metrics: {
        total_tokens: metrics.total,
        request_count: metrics.count,
        max_tokens: metrics.max,
        avg_tokens: metrics.count > 0 ? Math.round(metrics.total / metrics.count) : 0,
        warnings: metrics.warnings,
        criticals: metrics.criticals,
        last_request: this.extractLastRequest(logs),
      },
      recent_logs: logs.slice(-50),
      metadata: {
        created_at: runtime.createdAt.toISOString(),
        updated_at: runtime.updatedAt.toISOString(),
        closed_at: null,
        model: this.realtimeModel,
      },
    };
  }

  private extractLastRequest(logs: ReturnType<Logger['getLogs']>): AgentSessionStatus['token_metrics']['last_request'] {
    const lastRequestLog = logs
      .filter((log) => log.message.includes('tokens'))
      .slice(-1)[0];

    if (!lastRequestLog) {
      return undefined;
    }

    const tokenMatch = lastRequestLog.message.match(/(\d+)\/2048 tokens \((\d+(?:\.\d+)?)%\)/);
    if (!tokenMatch) {
      return undefined;
    }

    const tokens = parseInt(tokenMatch[1], 10);
    const percentage = parseFloat(tokenMatch[2]);

    const breakdown: Record<string, number> = {};
    const breakdownMatch = lastRequestLog.message.match(/breakdown:\s*(.+)/);
    if (breakdownMatch) {
      breakdownMatch[1].split(',').forEach((part) => {
        const [key, value] = part.trim().split(':');
        if (key && value) {
          const parsed = parseFloat(value.trim());
          if (!Number.isNaN(parsed)) {
            breakdown[key.trim()] = parsed;
          }
        }
      });
    }

    return {
      tokens,
      percentage,
      breakdown,
      timestamp: lastRequestLog.timestamp,
    };
  }
}
