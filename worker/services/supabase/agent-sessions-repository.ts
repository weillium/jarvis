import type {
  PostgrestResponse,
  PostgrestSingleResponse,
  SupabaseClient,
} from '@supabase/supabase-js';
import type { AgentType } from '../../types';
import type {
  AgentSessionRecord,
  AgentSessionUpsert,
} from './types';
import {
  mapAgentSessionRecords,
  mapConnectionCountInfo,
  mapSingleId
} from './dto-mappers';

export class AgentSessionsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getSessionsByEvent(eventId: string): Promise<AgentSessionRecord[]> {
    const query = this.client
      .from('agent_sessions')
      .select('*')
      .eq('event_id', eventId);
    const response: PostgrestResponse<unknown> = await query;

    if (response.error) throw response.error;
    return mapAgentSessionRecords(response.data);
  }

  async getSessionsForAgent(
    eventId: string,
    agentId: string,
    statuses?: string[]
  ): Promise<AgentSessionRecord[]> {
    let query = this.client
      .from('agent_sessions')
      .select(
        'id, agent_type, status, transport, provider_session_id, created_at, updated_at, closed_at, model, connection_count, last_connected_at'
      )
      .eq('event_id', eventId)
      .eq('agent_id', agentId);

    if (statuses?.length) {
      query = query.in('status', statuses);
    }

    const response: PostgrestResponse<unknown> = await query;
    if (response.error) throw response.error;
    return mapAgentSessionRecords(response.data);
  }

  async deleteSessions(eventId: string, agentId: string): Promise<void> {
    const { error } = await this.client
      .from('agent_sessions')
      .delete()
      .eq('event_id', eventId)
      .eq('agent_id', agentId);

    if (error) throw error;
  }

  async insertSessions(sessions: AgentSessionUpsert[]): Promise<AgentSessionRecord[]> {
    if (sessions.length === 0) {
      return [];
    }

    const response = await this.client
      .from('agent_sessions')
      .insert(sessions)
      .select('*');
    const insertResponse: PostgrestResponse<unknown> = response;

    if (insertResponse.error) throw insertResponse.error;
    return mapAgentSessionRecords(insertResponse.data);
  }

  async upsertSessions(sessions: AgentSessionUpsert[]): Promise<void> {
    if (sessions.length === 0) return;
    const { error } = await this.client
      .from('agent_sessions')
      .upsert(sessions, { onConflict: 'event_id,agent_type' });

    if (error) throw error;
  }

  async updateSessionsStatus(
    eventId: string,
    agentId: string,
    fromStatuses: string[],
    newStatus: string
  ): Promise<void> {
    const { error } = await this.client
      .from('agent_sessions')
      .update({ status: newStatus })
      .eq('event_id', eventId)
      .eq('agent_id', agentId)
      .in('status', fromStatuses);

    if (error) throw error;
  }

  async updateSession(
    eventId: string,
    agentType: AgentType,
    updates: Record<string, unknown>
  ): Promise<void> {
    const { error } = await this.client
      .from('agent_sessions')
      .update(updates)
      .eq('event_id', eventId)
      .eq('agent_type', agentType);

    if (error) throw error;
  }

  async updateSessionMetrics(
    eventId: string,
    agentType: AgentType,
    tokenMetrics: Record<string, unknown>,
    runtimeStats: Record<string, unknown>
  ): Promise<void> {
    const { error } = await this.client
      .from('agent_sessions')
      .update({
        token_metrics: tokenMetrics,
        runtime_stats: runtimeStats,
        metrics_recorded_at: new Date().toISOString(),
      })
      .eq('event_id', eventId)
      .eq('agent_type', agentType);

    if (error) {
      throw new Error(`Failed to update session metrics: ${error.message}`);
    }
  }

  async incrementConnectionCount(
    eventId: string,
    agentType: AgentType
  ): Promise<{ connection_count: number; session_id: string }> {
    const sessionQuery = this.client
      .from('agent_sessions')
      .select('id, connection_count')
      .eq('event_id', eventId)
      .eq('agent_type', agentType)
      .single();
    const sessionResponse: PostgrestSingleResponse<unknown> = await sessionQuery;
    const { data: session, error: fetchError } = sessionResponse;

    if (fetchError || !session) {
      throw new Error(`Failed to find session for increment: ${fetchError?.message || 'not found'}`);
    }

    const sessionInfo = mapConnectionCountInfo(session);
    const currentCount = sessionInfo.connection_count || 0;
    const newCount = currentCount + 1;

    const { error: updateError } = await this.client
      .from('agent_sessions')
      .update({
        connection_count: newCount,
        last_connected_at: new Date().toISOString(),
      })
      .eq('id', sessionInfo.id);

    if (updateError) {
      throw new Error(`Failed to increment connection count: ${updateError.message}`);
    }

    return {
      connection_count: newCount,
      session_id: sessionInfo.id,
    };
  }

  async getSessionId(eventId: string, agentType: AgentType): Promise<string | null> {
    const sessionIdQuery = this.client
      .from('agent_sessions')
      .select('id')
      .eq('event_id', eventId)
      .eq('agent_type', agentType)
      .single();
    const sessionIdResponse: PostgrestSingleResponse<unknown> = await sessionIdQuery;
    const { data, error } = sessionIdResponse;

    if (error || !data) {
      return null;
    }

    return mapSingleId(data);
  }
}
