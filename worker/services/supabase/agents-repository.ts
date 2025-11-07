import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentStatusRecord, AgentSummaryRecord, AgentRecord } from './types';
import {
  mapAgentRecords,
  mapAgentStatusRecord,
  mapAgentSummaryRecords
} from './dto-mappers';

export class AgentsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getAgentStatus(agentId: string): Promise<AgentStatusRecord | null> {
    const { data, error } = await this.client
      .from('agents')
      .select('status, stage, model_set')
      .eq('id', agentId)
      .single();

    if (error || !data) return null;
    return mapAgentStatusRecord(data);
  }

  async getAgentForEvent(
    eventId: string,
    statuses?: string[],
    stages?: string[]
  ): Promise<AgentSummaryRecord | null> {
    let query = this.client
      .from('agents')
      .select('id, status, stage, model_set')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true })
      .limit(1);

    if (statuses?.length) {
      query = query.in('status', statuses);
    }

    if (stages?.length) {
      query = query.in('stage', stages);
    }

    const { data, error } = await query;
    if (error) throw error;
    const summaries = mapAgentSummaryRecords(data);
    return summaries[0] ?? null;
  }

  async updateAgentStatus(agentId: string, status: string, stage?: string | null): Promise<void> {
    const updateData: Record<string, any> = { status };
    if (stage !== undefined) {
      updateData.stage = stage;
    }

    const { error } = await this.client
      .from('agents')
      .update(updateData)
      .eq('id', agentId);

    if (error) throw error;
  }

  async getAgentsByStatus(status: string, limit: number = 50): Promise<AgentRecord[]> {
    const { data, error } = await this.client
      .from('agents')
      .select('id, event_id, status')
      .eq('status', status)
      .limit(limit);

    if (error) throw error;
    return mapAgentRecords(data);
  }
}
