import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentOutputRecord } from './types';

export class AgentOutputsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async insertAgentOutput(output: AgentOutputRecord): Promise<void> {
    const { error } = await this.client.from('agent_outputs').insert(output);

    if (error) throw error;
  }
}
