import type {
  RealtimeTranscriptDTO,
  RealtimeTranscriptionUsageDTO,
} from '../../../../types';

export interface TranscriptGenerationInput {
  text: string;
  isFinal: boolean;
  usage?: RealtimeTranscriptionUsageDTO;
}

export interface TranscriptGenerationResult {
  transcript: RealtimeTranscriptDTO;
}

export class TranscriptPassthroughGenerator {
  generate(input: TranscriptGenerationInput): TranscriptGenerationResult {
    const { text, isFinal, usage } = input;

    const transcript: RealtimeTranscriptDTO = {
      text,
      isFinal,
      receivedAt: new Date().toISOString(),
    };

    if (usage) {
      transcript.usage = usage;
    }

    return { transcript };
  }
}


