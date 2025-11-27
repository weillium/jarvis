import type { SessionLifecycle } from '../session-lifecycle';
import type {
  TranscriptAudioChunk,
  TranscriptIngestionService,
} from '../transcript-ingestion-service';
import type { EventRuntime } from '../../types';

export class TranscriptCoordinator {
  constructor(
    private readonly transcriptIngestion: TranscriptIngestionService,
    private readonly sessionLifecycle: SessionLifecycle
  ) {}

  async appendTranscriptAudio(eventId: string, chunk: TranscriptAudioChunk): Promise<void> {
    try {
      // console.log(`[transcript-coordinator] appendTranscriptAudio called for event=${eventId}, seq=${chunk.seq}`);
      const runtime = await this.transcriptIngestion.appendAudio(eventId, chunk);
      this.attachTranscriptHandler(runtime, eventId, runtime.agentId);
    } catch (err: unknown) {
      console.error(`[transcript-coordinator] Error in appendTranscriptAudio for event=${eventId}, seq=${chunk.seq}:`, String(err));
      throw err;
    }
  }

  attachTranscriptHandler(runtime: EventRuntime, eventId: string, agentId: string): void {
    this.sessionLifecycle.attachTranscriptHandler(runtime, async (payload) => {
      await this.transcriptIngestion.handleRealtimeTranscript(eventId, agentId, runtime, payload);
    });
  }
}

