import type {
  AgentType,
  RealtimeMessageContext,
  RealtimeSessionConfig,
  RealtimeSessionEvent,
  RealtimeSessionEventPayloads,
} from '../types';

export interface StatelessSessionStorage {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  delete(key: string): void;
  clear(): void;
  listKeys(): string[];
}

export interface StatelessSessionHandlerContext<ProfileDeps = unknown> {
  config: RealtimeSessionConfig;
  deps: ProfileDeps;
  emit: <K extends RealtimeSessionEvent>(
    event: K,
    payload: RealtimeSessionEventPayloads[K]
  ) => void;
  log: (level: 'log' | 'warn' | 'error', message: string, context?: Record<string, unknown>) => void;
  storage: StatelessSessionStorage;
}

export interface StatelessSessionHooks {
  onSendMessage: (params: { message: string; context?: RealtimeMessageContext }) => Promise<void>;
  onSessionStart?: (params: { storage: StatelessSessionStorage }) => Promise<void> | void;
  onSessionPause?: (params: { storage: StatelessSessionStorage }) => Promise<void> | void;
  onSessionResume?: (params: { storage: StatelessSessionStorage }) => Promise<void> | void;
  onSessionClose?: (params: { storage: StatelessSessionStorage }) => Promise<void> | void;
}

export interface StatelessSessionProfile<ProfileDeps = unknown> {
  agentType: AgentType;
  defaultModel?: string;
  resolveModel?: (hint?: string) => string;
  createHooks: (
    context: StatelessSessionHandlerContext<ProfileDeps>
  ) => StatelessSessionHooks;
}


