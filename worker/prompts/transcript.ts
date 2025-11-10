import type { RealtimeTranscriptionUsageDTO } from '../types';

export interface TranscriptPromptContext {
  text: string;
  isFinal: boolean;
  usage?: RealtimeTranscriptionUsageDTO;
}

export const createTranscriptGenerationUserPrompt = (
  context: TranscriptPromptContext
): string => {
  const { text, isFinal, usage } = context;

  const status = isFinal ? 'final' : 'interim';
  const usageSummary = usage
    ? `Token Usage:\n- total: ${usage.total_tokens}\n${
        usage.input_tokens !== undefined ? `- input: ${usage.input_tokens}\n` : ''
      }${
        usage.output_tokens !== undefined ? `- output: ${usage.output_tokens}\n` : ''
      }`
    : 'Token Usage: n/a';

  return `You are preparing transcript output for a live session.

Transcript Status: ${status}

${usageSummary}

Transcript Text:
${text}`;
};


