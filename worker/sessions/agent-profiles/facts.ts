import type OpenAI from 'openai';
import { FactsStatelessSession } from '../session-adapters';
import type { RealtimeSessionConfig } from '../session-adapters';

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
  ): FactsStatelessSession => {
    void _deps;
    return new FactsStatelessSession(openai, config);
  },
};
