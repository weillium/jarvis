import type { StatelessSessionProfile } from '../../../session-adapters/stateless/profile-types';
import type { RealtimeMessageContext } from '../../../session-adapters/types';
import { getPolicy } from '../../../../policies';
import { createTranscriptGenerationUserPrompt } from '../../../../prompts';
import {
  TranscriptPassthroughGenerator,
  type TranscriptGenerationInput,
} from './generator';

const TRANSCRIPT_HISTORY_KEY = 'transcript:history';

const buildGenerationInput = (
  message: string,
  context?: RealtimeMessageContext
): TranscriptGenerationInput | null => {
  const text = message.trim();
  if (text.length === 0) {
    return null;
  }

  const isFinal = context?.transcriptMeta?.isFinal ?? true;
  const usage = context?.transcriptMeta?.usage;

  return {
    text,
    isFinal,
    usage,
  };
};

export const transcriptStatelessProfile: StatelessSessionProfile = {
  agentType: 'transcript',
  resolveModel: (hint) => hint ?? 'transcript_stateless_passthrough',
  createHooks: ({ emit, log, storage }) => {
    const policyVersion = 1;
    const policy = getPolicy('transcript', policyVersion);
    const generator = new TranscriptPassthroughGenerator();

    return {
      onSessionStart: ({ storage: sessionStorage }) => {
        sessionStorage.clear();
      },
      onSessionClose: ({ storage: sessionStorage }) => {
        sessionStorage.clear();
      },
      onSendMessage: ({ message, context }) => {
        const input = buildGenerationInput(message, context);
        if (!input) {
          log('warn', 'Stateless transcript session received empty message');
          return Promise.resolve();
        }

        const { transcript } = generator.generate(input);

        emit('transcript', transcript);

        storage.set(TRANSCRIPT_HISTORY_KEY, {
          latestTranscript: transcript,
          policy,
          policyVersion,
          prompt: createTranscriptGenerationUserPrompt(input),
          recordedAt: new Date().toISOString(),
        });

        return Promise.resolve();
      },
    };
  },
};


