import type { AgentSelection, AgentType, EventRuntime } from '../types';
import type {
  SessionCreationOptions,
  TranscriptAudioOptions,
} from '../sessions/session-manager';
import type { SessionManager } from '../sessions/session-manager';
import type { OpenAIService } from '../services/openai-service';
import type { VectorSearchService } from '../context/vector-search';
import type { ModelSelectionService } from '../services/model-selection-service';
import type { StatusUpdater } from '../monitoring/status-updater';
import type { AgentsRepository } from '../services/supabase/agents-repository';
import type { AgentSessionsRepository } from '../services/supabase/agent-sessions-repository';

type TranscriptPayload = {
  text: string;
  isFinal?: boolean;
  receivedAt?: string;
};
type TranscriptListener = (payload: TranscriptPayload) => Promise<void>;

interface CreateSessionsParams {
  runtime: EventRuntime;
  eventId: string;
  agentId: string;
  enabledAgents: AgentSelection;
  sessionOptions?: SessionCreationOptions;
  modelSetOverride?: string;
  apiKeyOverride?: string;
}

export class SessionLifecycle {
  constructor(
    private readonly sessionManager: SessionManager,
    private readonly agentsRepository: AgentsRepository,
    private readonly agentSessionsRepository: AgentSessionsRepository,
    private readonly openaiService: OpenAIService,
    private readonly vectorSearch: VectorSearchService,
    private readonly modelSelectionService: ModelSelectionService,
    private readonly statusUpdater: StatusUpdater
  ) {}

  async createRealtimeSessions(params: CreateSessionsParams): Promise<void> {
    const { runtime, eventId, agentId, enabledAgents, sessionOptions, modelSetOverride, apiKeyOverride } =
      params;

    const agent = await this.agentsRepository.getAgentStatus(agentId);
    const modelSet = modelSetOverride ?? agent?.model_set ?? 'open_ai';

    const transcriptModel = this.modelSelectionService.getModelForAgentType(
      modelSet,
      'transcript'
    );
    const cardsModel = this.modelSelectionService.getModelForAgentType(modelSet, 'cards');
    const factsModel = this.modelSelectionService.getModelForAgentType(modelSet, 'facts');

    const apiKey = apiKeyOverride ?? this.modelSelectionService.getApiKey(modelSet);

    const options = sessionOptions ?? this.buildDefaultSessionOptions(runtime);
    const handleStatusChange = async (
      agentType: AgentType,
      status: 'generated' | 'starting' | 'active' | 'paused' | 'closed' | 'error',
      sessionId?: string
    ) => {
      await this.handleSessionStatusChange(runtime, eventId, agentId, agentType, status, sessionId);
    };

    runtime.enabledAgents = enabledAgents;

    if (enabledAgents.transcript) {
      runtime.transcriptSession = this.sessionManager.createTranscriptSession(
        runtime,
        handleStatusChange,
        transcriptModel,
        options.transcript,
        apiKey
      );
    } else {
      runtime.transcriptSession = undefined;
      runtime.transcriptSessionId = undefined;
    }

    if (enabledAgents.cards) {
      runtime.cardsSession = this.sessionManager.createCardsSession(
        runtime,
        handleStatusChange,
        cardsModel,
        options.cards,
        apiKey
      );
    } else {
      runtime.cardsSession = undefined;
      runtime.cardsSessionId = undefined;
    }

    if (enabledAgents.facts) {
      runtime.factsSession = this.sessionManager.createFactsSession(
        runtime,
        handleStatusChange,
        factsModel,
        options.facts,
        apiKey
      );
    } else {
      runtime.factsSession = undefined;
      runtime.factsSessionId = undefined;
    }

    runtime.transcriptHandlerSession = undefined;
    runtime.cardsHandlerSession = undefined;
    runtime.factsHandlerSession = undefined;
  }

  attachTranscriptHandler(runtime: EventRuntime, handler: TranscriptListener): void {
    if (!runtime.transcriptSession) {
      return;
    }

    if (runtime.transcriptHandlerSession === runtime.transcriptSession) {
      return;
    }

    runtime.transcriptSession.on('transcript', (payload: TranscriptPayload) => {
      handler(payload).catch((err: unknown) => {
        console.error('[worker] error:', String(err));
      });
    });

    runtime.transcriptHandlerSession = runtime.transcriptSession;
  }

  async appendTranscriptAudio(runtime: EventRuntime, chunk: TranscriptAudioOptions): Promise<void> {
    const transcriptSession = runtime.transcriptSession;
    if (!transcriptSession) {
      throw new Error('Transcript session unavailable');
    }
    await this.sessionManager.appendAudioToTranscriptSession(transcriptSession, chunk);
  }

  async connectSessions(
    runtime: EventRuntime,
    eventId: string,
    enabledAgents: AgentSelection
  ): Promise<{ transcriptSessionId?: string; cardsSessionId?: string; factsSessionId?: string }> {
    if (enabledAgents.transcript && !runtime.transcriptSession) {
      throw new Error('Transcript session missing');
    }

    const result = await this.sessionManager.connectSessions({
      transcript: enabledAgents.transcript ? runtime.transcriptSession : undefined,
      cards: enabledAgents.cards ? runtime.cardsSession : undefined,
      facts: enabledAgents.facts ? runtime.factsSession : undefined,
    });

    await this.resetDisabledSessions(eventId, enabledAgents);
    return result;
  }

  async resumeSessions(
    runtime: EventRuntime,
    enabledAgents: AgentSelection
  ): Promise<{ transcriptSessionId?: string; cardsSessionId?: string; factsSessionId?: string }> {
    const transcriptSessionId =
      enabledAgents.transcript && runtime.transcriptSession
        ? await runtime.transcriptSession.resume()
        : undefined;
    const cardsSessionId =
      enabledAgents.cards && runtime.cardsSession
        ? await runtime.cardsSession.resume()
        : undefined;
    const factsSessionId =
      enabledAgents.facts && runtime.factsSession
        ? await runtime.factsSession.resume()
        : undefined;

    await this.resetDisabledSessions(runtime.eventId, enabledAgents);

    return { transcriptSessionId, cardsSessionId, factsSessionId };
  }

  async pauseSessions(runtime: EventRuntime): Promise<void> {
    await this.sessionManager.pauseSessions(
      runtime.transcriptSession,
      runtime.cardsSession,
      runtime.factsSession
    );
  }

  async closeSessions(runtime: EventRuntime): Promise<void> {
    await this.sessionManager.closeSessions(
      runtime.transcriptSession,
      runtime.cardsSession,
      runtime.factsSession
    );
  }

  private async handleSessionStatusChange(
    runtime: EventRuntime,
    eventId: string,
    agentId: string,
    agentType: AgentType,
    status: 'generated' | 'starting' | 'active' | 'paused' | 'closed' | 'error',
    sessionId?: string
  ): Promise<void> {
    try {
      const currentSessions = await this.agentSessionsRepository.getSessionsForAgent(
        eventId,
        agentId,
        []
      );
      const currentSession = currentSessions.find((s) => s.agent_type === agentType);
      const previousStatus = currentSession?.status;

      if (status === 'active' && sessionId) {
        await this.handleActiveStatus(runtime, eventId, agentId, agentType, previousStatus, sessionId);
      } else if (status !== 'active') {
        await this.logStatusChange(
          runtime,
          eventId,
          agentId,
          agentType,
          status,
          sessionId,
          previousStatus,
          currentSession
        );
      }

      await this.statusUpdater.updateAndPushStatus(runtime);
    } catch (err: unknown) {
      console.error("[worker] error:", String(err));
    }
  }

  private async handleActiveStatus(
    runtime: EventRuntime,
    eventId: string,
    agentId: string,
    agentType: AgentType,
    previousStatus: string | undefined,
    sessionId: string
  ): Promise<void> {
    try {
      const { connection_count, session_id } = await this.agentSessionsRepository.incrementConnectionCount(
        eventId,
        agentType
      );

      await this.agentSessionsRepository.updateSession(eventId, agentType, {
        provider_session_id: sessionId,
        status: 'active',
      });

      const sessionDbId =
        session_id || (await this.agentSessionsRepository.getSessionId(eventId, agentType));
      if (!sessionDbId) {
        return;
      }

      await this.agentSessionsRepository.logHistory({
        agent_session_id: sessionDbId,
        event_id: eventId,
        agent_id: agentId,
        agent_type: agentType,
        event_type: previousStatus === 'paused' ? 'resumed' : 'connected',
        provider_session_id: sessionId,
        previous_status: previousStatus || undefined,
        new_status: 'active',
        connection_count,
        metadata: {
          websocket_state: this.getWebsocketState(runtime, agentType),
        },
      });
    } catch (err: unknown) {
      console.error("[worker] error:", String(err));
    }
  }

  private async logStatusChange(
    runtime: EventRuntime,
    eventId: string,
    agentId: string,
    agentType: AgentType,
    status: string,
    sessionId: string | undefined,
    previousStatus: string | undefined,
    currentSession?: { provider_session_id?: string | null; connection_count?: number | null }
  ): Promise<void> {
    const sessionDbId = await this.agentSessionsRepository.getSessionId(eventId, agentType);
    if (!sessionDbId) {
      return;
    }

    const eventTypeMap: Record<string, 'disconnected' | 'paused' | 'error' | 'closed'> = {
      paused: 'paused',
      error: 'error',
      closed: 'closed',
    };

    const eventType = eventTypeMap[status] || 'disconnected';

    await this.agentSessionsRepository.logHistory({
      agent_session_id: sessionDbId,
      event_id: eventId,
      agent_id: agentId,
      agent_type: agentType,
      event_type: eventType,
      provider_session_id: sessionId || currentSession?.provider_session_id || undefined,
      previous_status: previousStatus || undefined,
      new_status: status,
      connection_count: currentSession?.connection_count || undefined,
      metadata: {
        websocket_state: this.getWebsocketState(runtime, agentType),
      },
    });
  }

  private getWebsocketState(runtime: EventRuntime, agentType: AgentType) {
    if (agentType === 'transcript') {
      return runtime.transcriptSession?.getStatus()?.websocketState;
    }
    if (agentType === 'cards') {
      return runtime.cardsSession?.getStatus()?.websocketState;
    }
    return runtime.factsSession?.getStatus()?.websocketState;
  }

  private buildDefaultSessionOptions(runtime: EventRuntime): SessionCreationOptions {
    return {
      transcript: {
        onRetrieve: async (query: string, topK: number) => {
          return await this.handleRetrieveQuery(runtime, query, topK);
        },
        embedText: async (text: string) => {
          return await this.openaiService.createEmbedding(text);
        },
      },
      cards: {
        onRetrieve: async (query: string, topK: number) => {
          return await this.handleRetrieveQuery(runtime, query, topK);
        },
        embedText: async (text: string) => {
          return await this.openaiService.createEmbedding(text);
        },
      },
      facts: {
        onRetrieve: async (query: string, topK: number) => {
          return await this.handleRetrieveQuery(runtime, query, topK);
        },
      },
    };
  }

  private async handleRetrieveQuery(
    runtime: EventRuntime,
    query: string,
    topK: number
  ): Promise<Array<{ id: string; chunk: string; similarity: number }>> {
    try {
      console.log(`[rag] retrieve() called: query="${query}", top_k=${topK}`);
      const results = await this.vectorSearch.search(runtime.eventId, query, topK);
      console.log(`[rag] retrieve() returned ${results.length} chunks`);
      return results;
    } catch (err: unknown) {
      console.error("[worker] error:", String(err));
    }

    return [];
  }

  private async resetDisabledSessions(eventId: string, enabledAgents: AgentSelection): Promise<void> {
    const disabledAgentTypes: AgentType[] = [];
    if (!enabledAgents.transcript) {
      disabledAgentTypes.push('transcript');
    }
    if (!enabledAgents.cards) {
      disabledAgentTypes.push('cards');
    }
    if (!enabledAgents.facts) {
      disabledAgentTypes.push('facts');
    }

    if (!disabledAgentTypes.length) {
      return;
    }

    await Promise.all(
      disabledAgentTypes.map(async (agentType) => {
        try {
          await this.agentSessionsRepository.updateSession(eventId, agentType, {
            status: 'closed',
            updated_at: new Date().toISOString(),
          });
        } catch (err: unknown) {
          console.error("[worker] error:", String(err));
        }
      })
    );
  }
}
