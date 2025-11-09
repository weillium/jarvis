import type OpenAI from 'openai';
import type { RealtimeSessionConfig } from '../session-adapters';
import { createStatelessAgentSession } from '../session-adapters/stateless/driver';
import { factsStatelessProfile } from './facts/stateless/profile';

type FactsSessionFactoryDeps = unknown;

export const factsAgentDefinition = {
  name: 'Facts Agent',
  description: 'Maintains durable facts using a stateless session wrapper.',
  availableTransports: ['stateless'] as const,
  defaultTransport: 'stateless' as const,
  createStatelessSession: (
    openai: OpenAI,
    config: RealtimeSessionConfig,
    _deps: FactsSessionFactoryDeps
  ) => {
    void _deps;
    return createStatelessAgentSession({
      openai,
      config,
      profile: factsStatelessProfile,
      profileDeps: undefined,
      logLabel: 'facts',
    });
  },
};


