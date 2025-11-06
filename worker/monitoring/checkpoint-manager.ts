import { AgentType } from '../types';
import { SupabaseService } from '../services/supabase-service';

export class CheckpointManager {
  constructor(private supabase: SupabaseService) {}

  async loadCheckpoints(eventId: string): Promise<{ transcript: number; cards: number; facts: number }> {
    const checkpoints = await this.supabase.getCheckpoints(eventId);
    const transcriptCheckpoint = checkpoints.find((c) => c.agent_type === 'transcript');
    const cardsCheckpoint = checkpoints.find((c) => c.agent_type === 'cards');
    const factsCheckpoint = checkpoints.find((c) => c.agent_type === 'facts');

    return {
      transcript: transcriptCheckpoint?.last_seq_processed || 0,
      cards: cardsCheckpoint?.last_seq_processed || 0,
      facts: factsCheckpoint?.last_seq_processed || 0,
    };
  }

  async saveCheckpoint(
    eventId: string,
    agentType: AgentType,
    lastSeq: number
  ): Promise<void> {
    await this.supabase.upsertCheckpoint(eventId, agentType, lastSeq);
  }
}
