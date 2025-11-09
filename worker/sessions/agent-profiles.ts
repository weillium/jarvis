import type OpenAI from 'openai';
import type {
  AgentRealtimeSession,
  AgentType,
  RealtimeSessionConfig,
} from './session-adapters';
import { FactsStatelessSession } from './session-adapters';
import { cardsAgentDefinition } from './agent-profiles/cards';
import { transcriptAgentDefinition } from './agent-profiles/transcript';
import type { OpenAIService } from '../services/openai-service';

export type AgentProfileTransport = 'stateless' | 'realtime';

export interface AgentProfile {
  transport: AgentProfileTransport;
  createSession: (
    openai: OpenAI,
    config: RealtimeSessionConfig,
    deps: AgentProfileDeps
  ) => AgentRealtimeSession;
  availableTransports?: AgentProfileTransport[];
  description?: string;
}

export type AgentProfileRegistry = Record<AgentType, AgentProfile>;

export interface AgentProfileDeps {
  openaiService: OpenAIService;
}

export const defaultAgentProfiles: AgentProfileRegistry = {
  transcript: {
    transport: 'realtime',
    availableTransports: ['realtime'],
    description: 'Realtime transcription agent using OpenAI Realtime API.',
    createSession: (openai, config, deps) => {
      void deps;
      return transcriptAgentDefinition.createRealtimeSession(openai, config, undefined);
    },
  },
  cards: {
    transport: cardsAgentDefinition.defaultTransport,
    availableTransports: [...cardsAgentDefinition.availableTransports],
    description: cardsAgentDefinition.description,
    createSession: (openai, config, deps) => {
      if (
        cardsAgentDefinition.defaultTransport === 'stateless' &&
        cardsAgentDefinition.sessionFactory.createStatelessSession
      ) {
        return cardsAgentDefinition.sessionFactory.createStatelessSession(openai, config, deps);
      }
      return cardsAgentDefinition.sessionFactory.createRealtimeSession(openai, config, deps);
    },
  },
  facts: {
    transport: 'stateless',
    availableTransports: ['stateless'],
    description: 'Facts extractor powered by a stateless session wrapper.',
    createSession: (openai, config, _deps) => {
      void _deps;
      return new FactsStatelessSession(openai, config);
    },
  },
};

