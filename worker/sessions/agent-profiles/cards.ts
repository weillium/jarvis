import type OpenAI from 'openai';
import type { AgentRealtimeSession, RealtimeSessionConfig } from '../session-adapters';
import { RealtimeAgentSession } from '../session-adapters/realtime/driver';
import { createStatelessAgentSession } from '../session-adapters/stateless/driver';
import type { OpenAIService } from '../../services/openai-service';
import type { AgentProfileTransport } from '../agent-profiles';
import { cardsRealtimeProfile } from './cards/realtime/profile';
import { cardsStatelessProfile } from './cards/stateless/profile';

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

const defaultCardsSessionFactory: CardsAgentSessionFactory = {
  createRealtimeSession: (openai, config, deps) => {
    void deps;
    return new RealtimeAgentSession(openai, config, cardsRealtimeProfile);
  },
  createStatelessSession: (openai, config, deps) =>
    createStatelessAgentSession({
      openai,
      config,
      profile: cardsStatelessProfile,
      profileDeps: {
        openaiService: deps.openaiService,
      },
      logLabel: 'cards',
    }),
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
};

export type CardsAvailableTransport = typeof cardsAgentDefinition.availableTransports[number];


