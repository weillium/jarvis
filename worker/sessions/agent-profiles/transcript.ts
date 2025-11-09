import type OpenAI from 'openai';
import type { RealtimeSessionConfig } from '../session-adapters';
import { RealtimeAgentSession } from '../session-adapters/realtime/driver';
import { transcriptRealtimeProfile } from './transcript/realtime/profile';

type TranscriptSessionFactoryDeps = unknown;

export const transcriptAgentDefinition = {
  name: 'Transcript Agent',
  description: 'Streams audio to OpenAI Realtime for live transcription.',
  availableTransports: ['realtime'] as const,
  defaultTransport: 'realtime' as const,
  createRealtimeSession: (
    openai: OpenAI,
    config: RealtimeSessionConfig,
    _deps: TranscriptSessionFactoryDeps
  ) => {
    void _deps;
    return new RealtimeAgentSession(openai, config, transcriptRealtimeProfile);
  },
};


