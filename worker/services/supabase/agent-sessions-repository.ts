import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentType } from '../../types';
import type {
  AgentSessionRecord,
  AgentSessionUpsert,
  AgentSessionHistoryParams,
} from './types';

export class AgentSessionsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getSessionsByEvent(eventId: string): Promise<AgentSessionRecord[]> {
    const { data, error } = await this.client
      .from('agent_sessions')
      .select('*')
      .eq('event_id', eventId);

    if (error) throw error;
    return (data as AgentSessionRecord[]) || [];
  }

  async getSessionsForAgent(
    eventId: string,
    agentId: string,
    statuses?: string[]
  ): Promise<AgentSessionRecord[]> {
    let query = this.client
      .from('agent_sessions')
      .select(
        'id, agent_type, status, provider_session_id, created_at, updated_at, closed_at, model, connection_count, last_connected_at'
      )
      .eq('event_id', eventId)
      .eq('agent_id', agentId);

    if (statuses?.length) {
      query = query.in('status', statuses);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data as AgentSessionRecord[]) || [];
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

    const { data, error } = await this.client
      .from('agent_sessions')
      .insert(sessions)
      .select('*');

    if (error) throw error;
    return (data as AgentSessionRecord[]) || [];
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
    updates: Record<string, any>
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
    tokenMetrics: Record<string, any>,
    runtimeStats: Record<string, any>
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
    const { data: session, error: fetchError } = await this.client
      .from('agent_sessions')
      .select('id, connection_count')
      .eq('event_id', eventId)
      .eq('agent_type', agentType)
      .single();

    if (fetchError || !session) {
      throw new Error(`Failed to find session for increment: ${fetchError?.message || 'not found'}`);
    }

    const currentCount = session.connection_count || 0;
    const newCount = currentCount + 1;

    const { error: updateError } = await this.client
      .from('agent_sessions')
      .update({
        connection_count: newCount,
        last_connected_at: new Date().toISOString(),
      })
      .eq('id', session.id);

    if (updateError) {
      throw new Error(`Failed to increment connection count: ${updateError.message}`);
    }

    return {
      connection_count: newCount,
      session_id: session.id,
    };
  }

  async getSessionId(eventId: string, agentType: AgentType): Promise<string | null> {
    const { data, error } = await this.client
      .from('agent_sessions')
      .select('id')
      .eq('event_id', eventId)
      .eq('agent_type', agentType)
      .single();

    if (error || !data) {
      return null;
    }

    return data.id;
  }

  async logHistory(params: AgentSessionHistoryParams): Promise<void> {
    const { error } = await this.client.rpc('log_agent_session_history', {
      p_agent_session_id: params.agent_session_id,
      p_event_id: params.event_id,
      p_agent_id: params.agent_id,
      p_agent_type: params.agent_type,
      p_event_type: params.event_type,
      p_provider_session_id: params.provider_session_id || null,
      p_previous_status: params.previous_status || null,
      p_new_status: params.new_status || null,
      p_connection_count: params.connection_count || null,
      p_error_message: params.error_message || null,
      p_metadata: params.metadata || null,
    });

    if (error) {
      console.error(`Failed to log session history: ${error.message}`, params);
    }
  }
}
