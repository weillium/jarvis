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
    const runtime = await this.transcriptIngestion.appendAudio(eventId, chunk);
    this.attachTranscriptHandler(runtime, eventId, runtime.agentId);
  }

  attachTranscriptHandler(runtime: EventRuntime, eventId: string, agentId: string): void {
    this.sessionLifecycle.attachTranscriptHandler(runtime, async (payload) => {
      await this.transcriptIngestion.handleRealtimeTranscript(eventId, agentId, runtime, payload);
    });
  }
}
