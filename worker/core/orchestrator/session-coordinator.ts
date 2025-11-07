import type { AgentsRepository } from '../../services/supabase/agents-repository';
import type { AgentSessionsRepository } from '../../services/supabase/agent-sessions-repository';
import type { ModelSelectionService } from '../../services/model-selection-service';
import type { SessionLifecycle } from '../session-lifecycle';
import type { RuntimeManager } from '../runtime-manager';
import type { EventProcessor } from '../event-processor';
import type { StatusUpdater } from '../../monitoring/status-updater';
import type { EventRuntime } from '../../types';
import type { AgentSessionRecord } from '../../services/supabase/types';

interface SessionCoordinatorDeps {
  runtimeManager: RuntimeManager;
  sessionLifecycle: SessionLifecycle;
  agentSessionsRepository: AgentSessionsRepository;
  agentsRepository: AgentsRepository;
  modelSelectionService: ModelSelectionService;
  eventProcessor: EventProcessor;
  statusUpdater: StatusUpdater;
  transcriptOnly: boolean;
  log: (...args: unknown[]) => void;
  attachTranscriptHandler: (runtime: EventRuntime, eventId: string, agentId: string) => void;
  startPeriodicSummary: (runtime: EventRuntime) => void;
}

export class SessionCoordinator {
  private readonly runtimeManager: RuntimeManager;
  private readonly sessionLifecycle: SessionLifecycle;
  private readonly agentSessionsRepository: AgentSessionsRepository;
  private readonly agentsRepository: AgentsRepository;
  private readonly modelSelectionService: ModelSelectionService;
  private readonly eventProcessor: EventProcessor;
  private readonly statusUpdater: StatusUpdater;
  private readonly transcriptOnly: boolean;
  private readonly log: (...args: unknown[]) => void;
  private readonly attachTranscriptHandler: (runtime: EventRuntime, eventId: string, agentId: string) => void;
  private readonly startPeriodicSummary: (runtime: EventRuntime) => void;

  constructor(deps: SessionCoordinatorDeps) {
    this.runtimeManager = deps.runtimeManager;
    this.sessionLifecycle = deps.sessionLifecycle;
    this.agentSessionsRepository = deps.agentSessionsRepository;
    this.agentsRepository = deps.agentsRepository;
    this.modelSelectionService = deps.modelSelectionService;
    this.eventProcessor = deps.eventProcessor;
    this.statusUpdater = deps.statusUpdater;
    this.transcriptOnly = deps.transcriptOnly;
    this.log = deps.log;
    this.attachTranscriptHandler = deps.attachTranscriptHandler;
    this.startPeriodicSummary = deps.startPeriodicSummary;
  }

  async createAgentSessionsForEvent(eventId: string): Promise<{
    agentId: string;
    modelSet: string;
    sessions: AgentSessionRecord[];
  }> {
    this.log(`[orchestrator] Creating agent sessions (event: ${eventId})`);

    const agent = await this.agentsRepository.getAgentForEvent(
      eventId,
      ['idle'],
      ['context_complete']
    );

    if (!agent) {
      throw new Error('No agent with context_complete stage found for this event');
    }

    const agentId = agent.id;
    const modelSet = agent.model_set || 'open_ai';

    const existingSessions = await this.agentSessionsRepository.getSessionsForAgent(eventId, agentId);
    if (existingSessions.length > 0) {
      this.log(
        `[orchestrator] Found ${existingSessions.length} existing session(s); deleting before recreation`
      );
      await this.agentSessionsRepository.deleteSessions(eventId, agentId);
    }

    const transcriptModel = this.modelSelectionService.getModelForAgentType(modelSet, 'transcript');
    const cardsModel = this.modelSelectionService.getModelForAgentType(modelSet, 'cards');
    const factsModel = this.modelSelectionService.getModelForAgentType(modelSet, 'facts');

    const sessions = await this.agentSessionsRepository.insertSessions([
      {
        event_id: eventId,
        agent_id: agentId,
        provider_session_id: 'pending',
        agent_type: 'transcript',
        status: 'closed',
        model: transcriptModel,
      },
      {
        event_id: eventId,
        agent_id: agentId,
        provider_session_id: 'pending',
        agent_type: 'cards',
        status: 'closed',
        model: cardsModel,
      },
      {
        event_id: eventId,
        agent_id: agentId,
        provider_session_id: 'pending',
        agent_type: 'facts',
        status: 'closed',
        model: factsModel,
      },
    ]);

    this.log(
      `[orchestrator] Created agent sessions for event ${eventId} using model_set=${modelSet}`,
      {
        transcriptModel,
        cardsModel,
        factsModel,
      }
    );

    return {
      agentId,
      modelSet,
      sessions,
    };
  }

  async startEvent(eventId: string, agentId: string): Promise<void> {
    this.log(`[orchestrator] Starting event ${eventId}`);

    let runtime = this.runtimeManager.getRuntime(eventId);
    if (!runtime) {
      runtime = await this.runtimeManager.createRuntime(eventId, agentId);
    }

    if (runtime.status === 'running') {
      if (runtime.cardsSession && runtime.factsSession) {
        this.log(`[orchestrator] Event ${eventId} already running with active sessions`);
        return;
      }

      this.log(
        `[orchestrator] Event ${eventId} marked as running but sessions missing, recreating...`
      );
      runtime.status = 'context_complete';
    }

    const existingSessions = await this.agentSessionsRepository.getSessionsForAgent(eventId, agentId, [
      'closed',
      'active',
      'paused',
    ]);

    const pausedSessions = existingSessions.filter((s) => s.status === 'paused');
    if (pausedSessions.length > 0) {
      this.log(
        `[orchestrator] Event ${eventId} has ${pausedSessions.length} paused session(s), resuming...`
      );

      if (
        !runtime.transcriptSession ||
        (!this.transcriptOnly && (!runtime.cardsSession || !runtime.factsSession))
      ) {
        await this.sessionLifecycle.createRealtimeSessions({
          runtime,
          eventId,
          agentId,
          transcriptOnly: this.transcriptOnly,
        });
      }

      try {
        const { transcriptSessionId, cardsSessionId, factsSessionId } =
          await this.sessionLifecycle.resumeSessions(runtime, this.transcriptOnly);
        runtime.transcriptSessionId = transcriptSessionId;
        runtime.cardsSessionId = this.transcriptOnly ? undefined : cardsSessionId;
        runtime.factsSessionId = this.transcriptOnly ? undefined : factsSessionId;

        this.attachTranscriptHandler(runtime, eventId, agentId);
        this.eventProcessor.attachSessionHandlers(runtime);

        runtime.status = 'running';
        await this.agentsRepository.updateAgentStatus(agentId, 'active', 'running');

        this.log(`[orchestrator] Event ${eventId} resumed successfully`);
        this.startPeriodicSummary(runtime);
        await this.statusUpdater.updateAndPushStatus(runtime);
        return;
      } catch (err: unknown) {
        console.error('[worker] error:', String(err));
      }
    }

    const activeSessions = existingSessions.filter((s) => s.status === 'active');
    const hasRequiredSessions = this.hasRequiredSessions(runtime);

    if (activeSessions.length > 0 && hasRequiredSessions) {
      this.log(
        `[orchestrator] Event ${eventId} already has ${activeSessions.length} active session(s)`
      );

      runtime.status = 'running';
      const currentAgent = await this.agentsRepository.getAgentStatus(agentId);
      if (currentAgent && currentAgent.stage !== 'testing') {
        await this.agentsRepository.updateAgentStatus(agentId, 'active', 'running');
      }
      this.startPeriodicSummary(runtime);
      return;
    }

    await this.sessionLifecycle.createRealtimeSessions({
      runtime,
      eventId,
      agentId,
      transcriptOnly: this.transcriptOnly,
    });
    this.attachTranscriptHandler(runtime, eventId, agentId);

    const existingSessionRecords = await this.agentSessionsRepository.getSessionsForAgent(
      eventId,
      agentId
    );
    if (existingSessionRecords.length === 0) {
      try {
        const agent = await this.agentsRepository.getAgentStatus(agentId);
        const modelSet = agent?.model_set || 'open_ai';
        const transcriptModel = this.modelSelectionService.getModelForAgentType(modelSet, 'transcript');
        const cardsModel = this.modelSelectionService.getModelForAgentType(modelSet, 'cards');
        const factsModel = this.modelSelectionService.getModelForAgentType(modelSet, 'facts');

        await this.agentSessionsRepository.upsertSessions([
          {
            event_id: eventId,
            agent_id: agentId,
            provider_session_id: 'pending',
            agent_type: 'transcript',
            status: 'closed',
            model: transcriptModel,
          },
          {
            event_id: eventId,
            agent_id: agentId,
            provider_session_id: 'pending',
            agent_type: 'cards',
            status: 'closed',
            model: cardsModel,
          },
          {
            event_id: eventId,
            agent_id: agentId,
            provider_session_id: 'pending',
            agent_type: 'facts',
            status: 'closed',
            model: factsModel,
          },
        ]);
      } catch (err: unknown) {
        console.error('[worker] error:', String(err));
      }
    }

    try {
      const { transcriptSessionId, cardsSessionId, factsSessionId } =
        await this.sessionLifecycle.connectSessions(runtime, eventId, this.transcriptOnly);
      runtime.transcriptSessionId = transcriptSessionId;
      runtime.cardsSessionId = cardsSessionId;
      runtime.factsSessionId = factsSessionId;
    } catch (err: unknown) {
      console.error('[worker] error:', String(err));
    }

    this.eventProcessor.attachSessionHandlers(runtime);
    this.startPeriodicSummary(runtime);

    runtime.status = 'running';
    const currentAgent = await this.agentsRepository.getAgentStatus(agentId);
    if (currentAgent && currentAgent.stage !== 'testing') {
      await this.agentsRepository.updateAgentStatus(agentId, 'active', 'running');
    }

    this.log(`[orchestrator] Event ${eventId} started`);
    await this.statusUpdater.updateAndPushStatus(runtime);
  }

  async startSessionsForTesting(eventId: string, agentId: string): Promise<void> {
    this.log(`[orchestrator] Starting sessions for testing (event: ${eventId})`);

    let runtime = this.runtimeManager.getRuntime(eventId);
    if (!runtime) {
      runtime = await this.runtimeManager.createRuntime(eventId, agentId);
      runtime.status = 'ready';
    }

    if (this.sessionsReady(runtime)) {
      this.log(`[orchestrator] Sessions already connected for event ${eventId}`);
      return;
    }

    const existingSessions = await this.agentSessionsRepository.getSessionsForAgent(eventId, agentId, [
      'closed',
    ]);
    if (!existingSessions.length) {
      throw new Error(
        `No closed sessions found for event ${eventId}. Create sessions first.`
      );
    }

    const newSessions = existingSessions.filter((s) => {
      if (!s.created_at) return false;
      const created = new Date(s.created_at);
      const now = new Date();
      return now.getTime() - created.getTime() < 60000;
    });

    if (!newSessions.length) {
      throw new Error(
        `No new sessions found for event ${eventId}. Sessions may have expired.`
      );
    }

    const sessionOptions = {
      transcript: {
        onRetrieve: (query: string, topK: number) => {
          void query;
          void topK;
          return Promise.resolve([]);
        },
        embedText: (text: string) => {
          void text;
          return Promise.resolve([]);
        },
        onLog: (_level: 'log' | 'warn' | 'error', message: string) => {
          console.log(`[transcript-test] ${message}`);
        },
      },
      cards: {
        onRetrieve: (query: string, topK: number) => {
          void query;
          void topK;
          return Promise.resolve([]);
        },
        embedText: (text: string) => {
          void text;
          return Promise.resolve([]);
        },
        onLog: (_level: 'log' | 'warn' | 'error', message: string) => {
          console.log(`[cards-test] ${message}`);
        },
      },
      facts: {
        onRetrieve: (query: string, topK: number) => {
          void query;
          void topK;
          return Promise.resolve([]);
        },
        onLog: (_level: 'log' | 'warn' | 'error', message: string) => {
          console.log(`[facts-test] ${message}`);
        },
      },
    } as const;

    await this.sessionLifecycle.createRealtimeSessions({
      runtime,
      eventId,
      agentId,
      transcriptOnly: this.transcriptOnly,
      sessionOptions,
    });
    this.attachTranscriptHandler(runtime, eventId, agentId);

    try {
      const { transcriptSessionId, cardsSessionId, factsSessionId } =
        await this.sessionLifecycle.connectSessions(runtime, eventId, this.transcriptOnly);
      runtime.transcriptSessionId = transcriptSessionId;
      runtime.cardsSessionId = cardsSessionId;
      runtime.factsSessionId = factsSessionId;
      this.log('[orchestrator] Sessions connected', {
        transcriptSessionId,
        cardsSessionId,
        factsSessionId,
      });
    } catch (err: unknown) {
      console.error('[worker] error:', String(err));
    }

    this.eventProcessor.attachSessionHandlers(runtime);
    runtime.status = 'running';
    await this.statusUpdater.updateAndPushStatus(runtime);

    this.log(`[orchestrator] Sessions started successfully for testing (event: ${eventId})`);
  }

  async pauseEvent(eventId: string): Promise<void> {
    this.log(`[orchestrator] Pausing event ${eventId}`);
    const runtime = this.runtimeManager.getRuntime(eventId);

    if (!runtime) {
      throw new Error(`Event ${eventId} not found in runtime`);
    }

    try {
      await this.statusUpdater.recordMetricsOnSessionClose(runtime, 'transcript');
      await this.statusUpdater.recordMetricsOnSessionClose(runtime, 'cards');
      await this.statusUpdater.recordMetricsOnSessionClose(runtime, 'facts');

      await this.sessionLifecycle.pauseSessions(runtime);
      this.log(`[orchestrator] Event ${eventId} paused`);
    } catch (err: unknown) {
      console.error('[worker] error:', String(err));
    }
  }

  resumeEvent(eventId: string, agentId: string): Promise<void> {
    this.log(`[orchestrator] Resuming event ${eventId} (using unified startEvent)`);
    return this.startEvent(eventId, agentId);
  }

  private hasRequiredSessions(runtime: EventRuntime): boolean {
    return this.transcriptOnly
      ? !!runtime.transcriptSession
      : !!runtime.transcriptSession && !!runtime.cardsSession && !!runtime.factsSession;
  }

  private sessionsReady(runtime: EventRuntime): boolean {
    const hasSessions = this.transcriptOnly
      ? !!runtime.transcriptSession && !!runtime.transcriptSessionId
      : !!runtime.transcriptSession &&
        !!runtime.cardsSession &&
        !!runtime.factsSession &&
        !!runtime.transcriptSessionId &&
        !!runtime.cardsSessionId &&
        !!runtime.factsSessionId;

    return runtime.status === 'running' && hasSessions;
  }
}
