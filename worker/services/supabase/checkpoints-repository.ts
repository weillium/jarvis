import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentType } from '../../types';
import type { CheckpointRecord } from './types';
import { mapCheckpointRecords } from './dto-mappers';

export class CheckpointsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getCheckpoints(eventId: string): Promise<CheckpointRecord[]> {
    const { data, error } = await this.client
      .from('checkpoints')
      .select('agent_type, last_seq_processed')
      .eq('event_id', eventId);

    if (error) throw error;
    return mapCheckpointRecords(data);
  }

  async upsertCheckpoint(eventId: string, agentType: AgentType, lastSeq: number): Promise<void> {
    const { error } = await this.client
      .from('checkpoints')
      .upsert(
        {
          event_id: eventId,
          agent_type: agentType,
          last_seq_processed: lastSeq,
        },
        { onConflict: 'event_id,agent_type' }
      );

    if (error) throw error;
  }
}
