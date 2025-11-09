import type { RealtimeClientEvent } from 'openai/resources/realtime/realtime';
import type { RealtimeSessionConfig } from '../../session-adapters';
import type { RuntimeController } from '../../session-adapters/runtime-controller';
import type { EventRouterHooks } from '../../session-adapters/event-router';
import type { InputAudioTranscriptionDeltaEvent } from '../../session-adapters/types';
import type { RegisterSessionEventsParams, SessionConfiguration } from '../../session-adapters/realtime-profile';

type TranscriptModel =
  | 'gpt-4o-transcribe'
  | 'whisper-1'
  | 'gpt-4o-mini-transcribe'
  | 'gpt-4o-transcribe-diarize';

export const DEFAULT_TRANSCRIPTION_MODEL: TranscriptModel = 'gpt-4o-transcribe';
export const REALTIME_CONNECTION_MODEL = 'gpt-realtime' as const;

interface TranscriptSessionConfigurationParams {
  config: RealtimeSessionConfig;
  policy: string;
}

export const buildTranscriptSessionConfiguration = (
  params: TranscriptSessionConfigurationParams
): SessionConfiguration => {
  const { config, policy } = params;

  let transcriptionModel: TranscriptModel = DEFAULT_TRANSCRIPTION_MODEL;
  switch (config.model) {
    case 'gpt-4o-transcribe':
    case 'whisper-1':
    case 'gpt-4o-mini-transcribe':
    case 'gpt-4o-transcribe-diarize':
      transcriptionModel = config.model;
      break;
    default:
      transcriptionModel = DEFAULT_TRANSCRIPTION_MODEL;
  }

  const sessionUpdateEvent = {
    type: 'session.update',
    session: {
      type: 'transcription',
      audio: {
        input: {
          format: {
            type: 'audio/pcm',
            rate: 24_000,
          },
          noise_reduction: {
            type: 'near_field',
          },
          transcription: {
            model: transcriptionModel,
            language: 'en',
          },
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
          },
        },
      },
      instructions: policy,
      include: ['item.input_audio_transcription.logprobs'],
    },
  } as unknown as RealtimeClientEvent;

  return {
    event: sessionUpdateEvent,
    logContext: {
      transcriptionModel,
    },
  };
};

export const createTranscriptEventRouterHooks = (runtimeController: RuntimeController): EventRouterHooks => ({
  onSessionUpdated: () => runtimeController.markAudioReady(),
});

export const registerTranscriptSessionEvents = ({
  session,
  router,
}: RegisterSessionEventsParams): void => {
  session.on(
    'conversation.item.input_audio_transcription.delta',
    (event: InputAudioTranscriptionDeltaEvent) => {
      router.handleTranscriptionDelta(event);
    }
  );

  session.on('conversation.item.input_audio_transcription.completed', (event: unknown) => {
    router.handleTranscriptionCompleted(event);
  });
};


