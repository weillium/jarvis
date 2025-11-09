import type { OpenAIRealtimeWebSocket } from 'openai/realtime/websocket';
import type { RealtimeClientEvent } from 'openai/resources/realtime/realtime';
import type {
  AgentHandler,
  AgentHandlerOptions,
  AgentType,
  RealtimeSessionConfig,
} from './types';
import type { RuntimeController, RuntimeControllerHooksFactory } from './runtime-controller';
import type { EventRouter, EventRouterHooks } from './event-router';

export interface RealtimeConnectionIntent {
  model: string;
  intent?: 'transcription';
}

export interface SessionConfigurationFactoryParams {
  config: RealtimeSessionConfig;
  log: (
    level: 'log' | 'warn' | 'error',
    message: string,
    context?: Record<string, unknown>
  ) => void;
}

export interface SessionConfiguration {
  event: RealtimeClientEvent;
  logContext?: Record<string, unknown>;
}

export interface EventRouterHookFactoryParams {
  runtimeController: RuntimeController;
}

export interface RegisterSessionEventsParams {
  session: OpenAIRealtimeWebSocket;
  router: EventRouter;
  runtimeController: RuntimeController;
}

export interface RealtimeSessionProfile {
  agentType: AgentType;
  getConnectionIntent: (config: RealtimeSessionConfig) => RealtimeConnectionIntent;
  createSessionConfiguration: (params: SessionConfigurationFactoryParams) => SessionConfiguration;
  createAgentHandler: (options: AgentHandlerOptions) => AgentHandler;
  createRuntimeHooks?: RuntimeControllerHooksFactory;
  createEventRouterHooks?: (params: EventRouterHookFactoryParams) => EventRouterHooks | undefined;
  registerSessionEvents?: (params: RegisterSessionEventsParams) => void;
  classifyError?: (error: unknown) => 'transient' | 'fatal';
}


