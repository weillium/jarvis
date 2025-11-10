import type OpenAI from 'openai';
import type { RealtimeSessionConfig } from '../session-adapters';
import { RealtimeAgentSession } from '../session-adapters/realtime/driver';
import { createStatelessAgentSession } from '../session-adapters/stateless/driver';
import { transcriptRealtimeProfile } from './transcript/realtime/profile';
import { transcriptStatelessProfile } from './transcript/stateless/profile';

type TranscriptSessionFactoryDeps = unknown;

export const transcriptAgentDefinition = {
  name: 'Transcript Agent',
  description: 'Streams audio to OpenAI Realtime for live transcription.',
  availableTransports: ['realtime', 'stateless'] as const,
  defaultTransport: 'realtime' as const,
  createRealtimeSession: (
    openai: OpenAI,
    config: RealtimeSessionConfig,
    _deps: TranscriptSessionFactoryDeps
  ) => {
    void _deps;
    return new RealtimeAgentSession(openai, config, transcriptRealtimeProfile);
  },
  createStatelessSession: (
    openai: OpenAI,
    config: RealtimeSessionConfig,
    _deps: TranscriptSessionFactoryDeps
  ) => {
    void _deps;
    return createStatelessAgentSession({
      openai,
      config,
      profile: transcriptStatelessProfile,
      profileDeps: undefined,
      logLabel: 'transcript',
    });
  },
};


