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

const resolvedTransport: AgentProfileTransport = 'stateless';

export const cardsAgentDefinition = {
  name: 'Cards Agent',
  description:
    'Generates summary cards from the live transcript using the stateless transport by default.',
  availableTransports: ['realtime', 'stateless'] as const,
  defaultTransport: resolvedTransport,
  sessionFactory: defaultCardsSessionFactory,
};

export type CardsAvailableTransport = typeof cardsAgentDefinition.availableTransports[number];


