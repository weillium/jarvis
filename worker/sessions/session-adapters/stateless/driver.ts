import type OpenAI from 'openai';
import { StatelessAgentSession } from './base-session';
import type {
  RealtimeMessageContext,
  RealtimeSessionConfig,
  RealtimeSessionEvent,
  RealtimeSessionEventPayloads,
} from '../types';
import type {
  StatelessSessionHooks,
  StatelessSessionProfile,
  StatelessSessionHandlerContext,
  StatelessSessionStorage,
} from './profile-types';

interface CreateStatelessSessionOptions<ProfileDeps> {
  openai: OpenAI;
  config: RealtimeSessionConfig;
  profile: StatelessSessionProfile<ProfileDeps>;
  profileDeps: ProfileDeps;
  logLabel?: string;
}

const createStorage = (): Map<string, unknown> => {
  return new Map<string, unknown>();
};

class ProfileDrivenStatelessSession<ProfileDeps> extends StatelessAgentSession {
  private readonly storage = createStorage();
  private readonly hooks: StatelessSessionHooks;

  constructor(private readonly options: CreateStatelessSessionOptions<ProfileDeps>) {
    super(options.openai, options.config, {
      agentType: options.profile.agentType,
      logLabel: options.logLabel ?? options.profile.agentType,
    });

    if (options.config.agentType !== options.profile.agentType) {
      throw new Error(
        `Stateless profile mismatch: expected '${options.profile.agentType}' received '${options.config.agentType}'`
      );
    }

    const handlerContext: StatelessSessionHandlerContext<ProfileDeps> = {
      config: options.config,
      deps: options.profileDeps,
      emit: <K extends RealtimeSessionEvent>(
        event: K,
        payload: RealtimeSessionEventPayloads[K]
      ) => {
        this.emitEvent(event, payload);
      },
      log: (level, message, context) => {
        this.log(level, message, context as { seq?: number } | undefined);
      },
      storage: this.createStorageFacade(),
    };

    this.hooks = options.profile.createHooks(handlerContext);
  }

  override async connect(): Promise<string> {
    const sessionId = await super.connect();
    await this.hooks.onSessionStart?.({ storage: this.createStorageFacade() });
    return sessionId;
  }

  override async pause(): Promise<void> {
    await super.pause();
    await this.hooks.onSessionPause?.({ storage: this.createStorageFacade() });
  }

  override async resume(): Promise<string> {
    const sessionId = await super.resume();
    await this.hooks.onSessionResume?.({ storage: this.createStorageFacade() });
    return sessionId;
  }

  override async close(): Promise<void> {
    try {
      await this.hooks.onSessionClose?.({ storage: this.createStorageFacade() });
    } finally {
      this.storage.clear();
      await super.close();
    }
  }

  override async sendMessage(message: string, context?: RealtimeMessageContext): Promise<void> {
    await this.hooks.onSendMessage({
      message,
      context,
    });
  }

  private createStorageFacade(): StatelessSessionStorage {
    return {
      get: <T>(key: string): T | undefined => this.storage.get(key) as T | undefined,
      set: <T>(key: string, value: T): void => {
        this.storage.set(key, value);
      },
      delete: (key: string): void => {
        this.storage.delete(key);
      },
      clear: (): void => {
        this.storage.clear();
      },
      listKeys: (): string[] => Array.from(this.storage.keys()),
    };
  }
}

export const createStatelessAgentSession = <ProfileDeps>(
  options: CreateStatelessSessionOptions<ProfileDeps>
): StatelessAgentSession => {
  return new ProfileDrivenStatelessSession(options);
};


