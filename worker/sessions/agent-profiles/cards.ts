import type OpenAI from 'openai';
import type {
  AgentRealtimeSession,
  RealtimeSessionConfig,
} from '../session-adapters';
import { CardsRealtimeSession } from '../session-adapters/cards-realtime-session';
import { CardsStatelessSession } from '../session-adapters/cards-stateless-session';
import { PromptCardGenerator, type CardGeneratorFactory } from './cards/card-generator';
import { getCardsRealtimeTooling } from './cards/tooling';
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

const defaultCardsSessionFactory: CardsAgentSessionFactory = {
  createRealtimeSession: (openai, config, deps) => {
    void deps;
    return new CardsRealtimeSession(openai, config);
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
};

export type CardsAvailableTransport = typeof cardsAgentDefinition.availableTransports[number];

