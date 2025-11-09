import type OpenAI from 'openai';
import type { RealtimeSessionConfig } from '../session-adapters';
import { RealtimeAgentSession } from '../session-adapters/realtime-session';
import { createBufferedTranscriptAudioHooks } from '../session-adapters/runtime-controller';
import type { RealtimeSessionProfile } from '../session-adapters/realtime-profile';
import { TranscriptAgentHandler } from '../session-adapters/handlers/transcript-handler';
import { getPolicy } from '../../policies';
import {
  buildTranscriptSessionConfiguration,
  createTranscriptEventRouterHooks,
  REALTIME_CONNECTION_MODEL,
  registerTranscriptSessionEvents,
} from './transcript/tooling';

type TranscriptSessionFactoryDeps = unknown;

const transcriptRealtimeProfile: RealtimeSessionProfile = {
  agentType: 'transcript',
  getConnectionIntent: () => ({
    model: REALTIME_CONNECTION_MODEL,
    intent: 'transcription',
  }),
  createSessionConfiguration: ({ config, log }) => {
    const policy = getPolicy('transcript');
    const configuration = buildTranscriptSessionConfiguration({ config, policy });
    log('log', 'Sending transcription session config', configuration.logContext);
    return configuration;
  },
  createAgentHandler: (options) => new TranscriptAgentHandler(options),
  createRuntimeHooks: createBufferedTranscriptAudioHooks,
  createEventRouterHooks: ({ runtimeController }) =>
    createTranscriptEventRouterHooks(runtimeController),
  registerSessionEvents: (params) => {
    registerTranscriptSessionEvents(params);
  },
};

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
  realtimeProfile: transcriptRealtimeProfile,
};

