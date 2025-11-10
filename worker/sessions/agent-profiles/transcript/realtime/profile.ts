import type { RealtimeSessionProfile } from '../../../session-adapters/realtime/profile-types';
import { createBufferedTranscriptAudioHooks } from '../../../session-adapters/realtime/runtime-controller';
import { TranscriptAgentHandler } from '../../../session-adapters/handlers/transcript-handler';
import {
  buildTranscriptSessionConfiguration,
  createTranscriptEventRouterHooks,
  REALTIME_CONNECTION_MODEL,
  registerTranscriptSessionEvents,
} from '../tooling';

export const transcriptRealtimeProfile: RealtimeSessionProfile = {
  agentType: 'transcript',
  getConnectionIntent: () => ({
    model: REALTIME_CONNECTION_MODEL,
    intent: 'transcription',
  }),
  resolveModel: (hint) => hint ?? REALTIME_CONNECTION_MODEL,
  createSessionConfiguration: ({ config, log }) => {
    const configuration = buildTranscriptSessionConfiguration({ config });
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


