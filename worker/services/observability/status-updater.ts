import type { AgentSessionStatus, EventRuntime, SessionStatus } from '../../types';
import type { SSEService } from '../sse-service';
import type { Logger } from './logger';
import type { MetricsCollector } from './metrics-collector';
import type { AgentSessionsRepository } from '../supabase/agent-sessions-repository';

export class StatusUpdater {
  constructor(
    private readonly agentSessions: AgentSessionsRepository,
    private sse: SSEService,
    private logger: Logger,
    private metrics: MetricsCollector,
    private cardsModel: string
  ) {}

  async updateAndPushStatus(runtime: EventRuntime): Promise<void> {
    const statuses = await this.buildStatuses(runtime, true);
    runtime.updatedAt = new Date();

    // Extract only enrichment fields (websocket_state, ping_pong, logs, real-time metrics)
    // Database fields (status, metadata, session_id) are handled by React Query
    const transcriptEnrichment = this.extractEnrichment(statuses.transcript);
    const cardsEnrichment = this.extractEnrichment(statuses.cards);
    const factsEnrichment = this.extractEnrichment(statuses.facts);

    this.sse.pushSessionStatus(runtime.eventId, transcriptEnrichment);
    this.sse.pushSessionStatus(runtime.eventId, cardsEnrichment);
    this.sse.pushSessionStatus(runtime.eventId, factsEnrichment);
  }

  /**
   * Extract only enrichment fields from full status
   * Removes database fields (status, metadata, session_id) that should come from React Query
   */
  private extractEnrichment(status: AgentSessionStatus): {
    agent_type: 'transcript' | 'cards' | 'facts';
    websocket_state?: 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED';
    ping_pong?: AgentSessionStatus['ping_pong'];
    recent_logs?: AgentSessionStatus['recent_logs'];
    token_metrics?: AgentSessionStatus['token_metrics'];
    runtime_stats?: AgentSessionStatus['runtime'];
  } {
    return {
      agent_type: status.agent_type,
      websocket_state: status.websocket_state,
      ping_pong: status.ping_pong,
      recent_logs: status.recent_logs,
      // Only include metrics if session is active (real-time data)
      // Closed sessions will have metrics stored in DB
      token_metrics: status.status === 'active' ? status.token_metrics : undefined,
      runtime_stats: status.status === 'active' ? status.runtime : undefined,
    };
  }

  getRuntimeStatusSnapshot(
    runtime: EventRuntime
  ): { transcript: AgentSessionStatus; cards: AgentSessionStatus; facts: AgentSessionStatus } {
    return {
      transcript: this.buildSessionStatus(runtime, 'transcript'),
      cards: this.buildSessionStatus(runtime, 'cards'),
      facts: this.buildSessionStatus(runtime, 'facts'),
    };
  }

  /**
   * Record aggregate metrics to database when session closes
   * Stores final token metrics and runtime stats for historical tracking
   */
  async recordMetricsOnSessionClose(
    runtime: EventRuntime,
    agentType: 'transcript' | 'cards' | 'facts'
  ): Promise<void> {
    const metrics = this.metrics.getMetrics(runtime.eventId, agentType);
    const logs = this.logger.getLogs(runtime.eventId, agentType);
    const factsBudgetSnapshot = metrics.lastBudget;
    const factsBudget =
      agentType === 'facts' && factsBudgetSnapshot
        ? {
            selected: factsBudgetSnapshot.selected,
            overflow: factsBudgetSnapshot.overflow,
            summary: factsBudgetSnapshot.summary,
            total_facts: factsBudgetSnapshot.totalFacts,
            budget_tokens: factsBudgetSnapshot.budgetTokens,
            used_tokens: factsBudgetSnapshot.usedTokens,
            selection_ratio: factsBudgetSnapshot.selectionRatio,
            merged_clusters: factsBudgetSnapshot.mergedClusters,
            merged_facts: factsBudgetSnapshot.mergedFacts,
          }
        : undefined;

    const tokenMetrics = {
      total_tokens: metrics.total,
      request_count: metrics.count,
      max_tokens: metrics.max,
      avg_tokens: metrics.count > 0 ? Math.round(metrics.total / metrics.count) : 0,
      warnings: metrics.warnings,
      criticals: metrics.criticals,
      last_request: this.extractLastRequest(logs),
      facts_budget: factsBudget,
      image_generation_cost: metrics.imageGenerationCost > 0 ? metrics.imageGenerationCost : undefined,
      image_generation_count: metrics.imageGenerationCount > 0 ? metrics.imageGenerationCount : undefined,
    };

    const runtimeStats = {
      transcript_last_seq: runtime.transcriptLastSeq,
      cards_last_seq: runtime.cardsLastSeq,
      facts_last_seq: runtime.factsLastSeq,
      facts_last_update: new Date(runtime.factsLastUpdate).toISOString(),
      ring_buffer_stats: runtime.ringBuffer.getStats(),
      facts_store_stats: runtime.factsStore.getStats(),
    };

    try {
      await this.agentSessions.updateSessionMetrics(
        runtime.eventId,
        agentType,
        tokenMetrics,
        runtimeStats
      );
      console.log(
        `[StatusUpdater] Recorded metrics for ${agentType} session (event: ${runtime.eventId})`
      );
    } catch (err: unknown) {
      console.error("[worker] error:", String(err));
    }
  }

  private async buildStatuses(
    runtime: EventRuntime,
    mergeDatabase: boolean
  ): Promise<{ transcript: AgentSessionStatus; cards: AgentSessionStatus; facts: AgentSessionStatus }> {
    const transcriptStatus = this.buildSessionStatus(runtime, 'transcript');
    const cardsStatus = this.buildSessionStatus(runtime, 'cards');
    const factsStatus = this.buildSessionStatus(runtime, 'facts');

    if (mergeDatabase) {
      await this.mergeDatabaseInfo(runtime, transcriptStatus, cardsStatus, factsStatus);
    }

    return { transcript: transcriptStatus, cards: cardsStatus, facts: factsStatus };
  }

  private async mergeDatabaseInfo(
    runtime: EventRuntime,
    transcriptStatus: AgentSessionStatus,
    cardsStatus: AgentSessionStatus,
    factsStatus: AgentSessionStatus
  ): Promise<void> {
    const sessions = await this.agentSessions.getSessionsForAgent(
      runtime.eventId,
      runtime.agentId
    );

    const transcriptSession = sessions.find((s) => s.agent_type === 'transcript');
    const cardsSession = sessions.find((s) => s.agent_type === 'cards');
    const factsSession = sessions.find((s) => s.agent_type === 'facts');

    if (transcriptSession) {
      if (transcriptSession.status) {
        transcriptStatus.status = transcriptSession.status as SessionStatus;
      }
      if (transcriptSession.provider_session_id) {
        transcriptStatus.session_id = transcriptSession.provider_session_id;
      }
      if (transcriptSession.created_at) {
        transcriptStatus.metadata.created_at = transcriptSession.created_at;
      }
      if (transcriptSession.updated_at) {
        transcriptStatus.metadata.updated_at = transcriptSession.updated_at;
      }
      if (transcriptSession.closed_at !== undefined) {
        transcriptStatus.metadata.closed_at = transcriptSession.closed_at ?? null;
      }
      if (transcriptSession.model) {
        transcriptStatus.metadata.model = transcriptSession.model;
      }
      if (transcriptSession.connection_count !== undefined) {
        transcriptStatus.metadata.connection_count = transcriptSession.connection_count;
      }
      if (transcriptSession.last_connected_at !== undefined) {
        transcriptStatus.metadata.last_connected_at = transcriptSession.last_connected_at ?? null;
      }
    }

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
      if (cardsSession.connection_count !== undefined) {
        cardsStatus.metadata.connection_count = cardsSession.connection_count;
      }
      if (cardsSession.last_connected_at !== undefined) {
        cardsStatus.metadata.last_connected_at = cardsSession.last_connected_at ?? null;
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
      if (factsSession.connection_count !== undefined) {
        factsStatus.metadata.connection_count = factsSession.connection_count;
      }
      if (factsSession.last_connected_at !== undefined) {
        factsStatus.metadata.last_connected_at = factsSession.last_connected_at ?? null;
      }
    }
  }

  private buildSessionStatus(
    runtime: EventRuntime,
    agentType: 'transcript' | 'cards' | 'facts'
  ): AgentSessionStatus {
    const session = agentType === 'transcript' ? runtime.transcriptSession : agentType === 'cards' ? runtime.cardsSession : runtime.factsSession;
    const sessionId = agentType === 'transcript' ? runtime.transcriptSessionId : agentType === 'cards' ? runtime.cardsSessionId : runtime.factsSessionId;
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

    const factsBudgetSnapshot = metrics.lastBudget;
    const factsBudget =
      agentType === 'facts' && factsBudgetSnapshot
        ? {
            selected: factsBudgetSnapshot.selected,
            overflow: factsBudgetSnapshot.overflow,
            summary: factsBudgetSnapshot.summary,
            total_facts: factsBudgetSnapshot.totalFacts,
            budget_tokens: factsBudgetSnapshot.budgetTokens,
            used_tokens: factsBudgetSnapshot.usedTokens,
            selection_ratio: factsBudgetSnapshot.selectionRatio,
            merged_clusters: factsBudgetSnapshot.mergedClusters,
            merged_facts: factsBudgetSnapshot.mergedFacts,
          }
        : undefined;

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
        transcript_last_seq: runtime.transcriptLastSeq,
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
        facts_budget: factsBudget,
        image_generation_cost: metrics.imageGenerationCost > 0 ? metrics.imageGenerationCost : undefined,
        image_generation_count: metrics.imageGenerationCount > 0 ? metrics.imageGenerationCount : undefined,
      },
      recent_logs: logs.slice(-50),
      metadata: {
        created_at: runtime.createdAt.toISOString(),
        updated_at: runtime.updatedAt.toISOString(),
        closed_at: null,
        model: this.cardsModel,
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
