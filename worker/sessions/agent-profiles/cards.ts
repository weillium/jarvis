import type OpenAI from 'openai';
import type {
  AgentRealtimeSession,
  RealtimeSessionConfig,
} from '../session-adapters';
import { RealtimeAgentSession } from '../session-adapters/realtime-session';
import { createPassthroughAudioHooks } from '../session-adapters/runtime-controller';
import { CardsStatelessSession } from '../session-adapters/cards-stateless-session';
import type { RealtimeSessionProfile } from '../session-adapters/realtime-profile';
import { getPolicy } from '../../policies';
import { getCardsRealtimeTooling } from './cards/tooling';
import { PromptCardGenerator, type CardGeneratorFactory } from './cards/card-generator';
import { CardsAgentHandler } from '../session-adapters/handlers/cards-handler';
import type { OpenAIService } from '../../services/openai-service';
import type { AgentProfileTransport } from '../agent-profiles';

export interface CardsAgentSessionFactory {
  createRealtimeSession(
    openai: OpenAI,
    config: RealtimeSessionConfig,
    deps: CardsSessionFactoryDeps
  ): AgentRealtimeSession;
  createStatelessSession?: (
    openai: OpenAI,
    config: RealtimeSessionConfig,
    deps: CardsSessionFactoryDeps
  ) => AgentRealtimeSession;
}

export interface CardsSessionFactoryDeps {
  openaiService: OpenAIService;
}

const createCardGenerator: CardGeneratorFactory = (generatorDeps) =>
  new PromptCardGenerator(generatorDeps);

const cardsRealtimeProfile: RealtimeSessionProfile = {
  agentType: 'cards',
  getConnectionIntent: (config) => {
    if (!config.model) {
      throw new Error('Cards realtime sessions require a realtime model');
    }
    return { model: config.model };
  },
  createSessionConfiguration: ({ config, log }) => {
    const policy = getPolicy('cards');
    const { tools, sessionUpdateEvent } = getCardsRealtimeTooling(policy);
    log('log', `Sending session config with ${tools.length} tools`, {
      toolCount: tools.length,
      agentType: config.agentType,
    });
    return {
      event: sessionUpdateEvent,
      logContext: {
        toolCount: tools.length,
      },
    };
  },
  createAgentHandler: (options) => new CardsAgentHandler(options),
  createRuntimeHooks: createPassthroughAudioHooks,
};

const defaultCardsSessionFactory: CardsAgentSessionFactory = {
  createRealtimeSession: (openai, config, deps) => {
    void deps;
    return new RealtimeAgentSession(openai, config, cardsRealtimeProfile);
  },
  createStatelessSession: (openai, config, deps) =>
    new CardsStatelessSession(openai, config, createCardGenerator, deps),
};

const transportOverride = (process.env.CARDS_AGENT_TRANSPORT ?? '').toLowerCase();

const resolveTransport = (override: string): AgentProfileTransport => {
  if (override === 'realtime') {
    return 'realtime';
  }
  if (override === 'stateless') {
    return 'stateless';
  }
  return 'stateless';
};

const resolvedTransport = resolveTransport(transportOverride);

export const cardsAgentDefinition = {
  name: 'Cards Agent',
  description:
    'Generates summary cards from the live transcript. Defaults to a stateless transport unless overridden.',
  availableTransports: ['realtime', 'stateless'] as const,
  defaultTransport: resolvedTransport,
  sessionFactory: defaultCardsSessionFactory,
  realtimeGenerator: createCardGenerator,
  getRealtimeTooling: getCardsRealtimeTooling,
  realtimeProfile: cardsRealtimeProfile,
};

export type CardsAvailableTransport = typeof cardsAgentDefinition.availableTransports[number];

