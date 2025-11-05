import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { AgentType } from '../types';

interface CheckpointRecord {
  agent_type: AgentType;
  last_seq_processed: number;
}

interface AgentStatusRecord {
  status: string;
  stage: string | null;
}

interface AgentRecord {
  id: string;
  event_id: string;
  status: string;
}

interface AgentSessionRecord {
  id: string;
  agent_type: AgentType;
  status: string;
  provider_session_id?: string;
  created_at?: string;
  updated_at?: string;
  closed_at?: string | null;
  model?: string | null;
}

interface TranscriptRecord {
  id: number;
  seq: number;
  at_ms: number;
  speaker: string | null;
  text: string;
  final: boolean;
}

interface GlossaryRecord {
  term: string;
  definition: string;
  acronym_for: string | null;
  category: string | null;
  usage_examples: string[];
  related_terms: string[];
  confidence_score: number;
}

interface AgentOutputRecord {
  event_id: string;
  agent_id: string;
  agent_type: AgentType;
  for_seq: number;
  type: 'card' | 'fact_update';
  payload: any;
}

interface CardRecord {
  event_id: string;
  kind: string;
  payload: any;
}

interface FactRecord {
  event_id: string;
  fact_key: string;
  fact_value: any;
  confidence: number;
  last_seen_seq: number;
  sources: number[];
}

type TranscriptCallback = (payload: { new: any }) => void;

export class SupabaseService {
  private client: SupabaseClient;

  constructor(clientOrUrl: SupabaseClient | string, serviceRoleKey?: string) {
    if (typeof clientOrUrl === 'string') {
      if (!serviceRoleKey) {
        throw new Error('Supabase service role key is required when passing URL');
      }
      this.client = createClient(clientOrUrl, serviceRoleKey, {
        auth: { persistSession: false },
      });
    } else {
      this.client = clientOrUrl;
    }
  }

  getClient(): SupabaseClient {
    return this.client;
  }

  subscribeToTranscripts(callback: TranscriptCallback): { unsubscribe: () => Promise<void> } {
    const channel = this.client
      .channel('transcript_events')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'transcripts',
        },
        callback
      )
      .subscribe();

    return {
      unsubscribe: async () => {
        await this.client.removeChannel(channel);
      },
    };
  }

  async getCheckpoints(eventId: string): Promise<CheckpointRecord[]> {
    const { data, error } = await this.client
      .from('checkpoints')
      .select('agent_type, last_seq_processed')
      .eq('event_id', eventId);

    if (error) throw error;
    return (data as CheckpointRecord[]) || [];
  }

  async upsertCheckpoint(
    eventId: string,
    agentType: AgentType,
    lastSeq: number
  ): Promise<void> {
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

  async getAgentStatus(agentId: string): Promise<AgentStatusRecord | null> {
    const { data, error } = await this.client
      .from('agents')
      .select('status, stage')
      .eq('id', agentId)
      .single();

    if (error) return null;
    return data as AgentStatusRecord;
  }

  async updateAgentStatus(agentId: string, status: string, stage?: string | null): Promise<void> {
    const updateData: any = { status };
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
    return (data as AgentRecord[]) || [];
  }

  async getAgentSessionsByEvent(eventId: string): Promise<AgentSessionRecord[]> {
    const { data, error } = await this.client
      .from('agent_sessions')
      .select('*')
      .eq('event_id', eventId);

    if (error) throw error;
    return (data as AgentSessionRecord[]) || [];
  }

  async getAgentSessionsForAgent(
    eventId: string,
    agentId: string,
    statuses?: string[]
  ): Promise<AgentSessionRecord[]> {
    let query = this.client
      .from('agent_sessions')
      .select('id, agent_type, status, provider_session_id, created_at, updated_at, closed_at, model')
      .eq('event_id', eventId)
      .eq('agent_id', agentId);

    if (statuses && statuses.length > 0) {
      query = query.in('status', statuses);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data as AgentSessionRecord[]) || [];
  }

  async upsertAgentSession(session: {
    event_id: string;
    agent_id: string;
    provider_session_id: string;
    agent_type: AgentType;
    status: string;
  }): Promise<void> {
    const { error } = await this.client
      .from('agent_sessions')
      .upsert(session, { onConflict: 'event_id,agent_type' });

    if (error) throw error;
  }

  async upsertAgentSessions(
    sessions: Array<{
      event_id: string;
      agent_id: string;
      provider_session_id: string;
      agent_type: AgentType;
      status: string;
    }>
  ): Promise<void> {
    if (sessions.length === 0) return;
    const { error } = await this.client
      .from('agent_sessions')
      .upsert(sessions, { onConflict: 'event_id,agent_type' });

    if (error) throw error;
  }

  async updateAgentSessionsStatus(
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

  async updateAgentSession(
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

  async getTranscriptsForReplay(
    eventId: string,
    sinceSeq: number,
    limit: number = 1000
  ): Promise<TranscriptRecord[]> {
    const { data, error } = await this.client
      .from('transcripts')
      .select('id, seq, at_ms, speaker, text, final')
      .eq('event_id', eventId)
      .gt('seq', sinceSeq)
      .order('seq', { ascending: true })
      .limit(limit);

    if (error) throw error;
    return (data as TranscriptRecord[]) || [];
  }

  async updateTranscriptSeq(transcriptId: number, seq: number): Promise<void> {
    const { error } = await this.client
      .from('transcripts')
      .update({ seq })
      .eq('id', transcriptId);

    if (error) throw error;
  }

  async getGlossaryTerms(eventId: string, generationCycleId?: string): Promise<GlossaryRecord[]> {
    let query = this.client
      .from('glossary_terms')
      .select('*')
      .eq('event_id', eventId);
    
    if (generationCycleId) {
      query = query.eq('generation_cycle_id', generationCycleId);
    }
    
    const { data, error } = await query.order('confidence_score', { ascending: false });

    if (error) throw error;
    return (data as GlossaryRecord[]) || [];
  }

  async insertAgentOutput(output: AgentOutputRecord): Promise<void> {
    const { error } = await this.client
      .from('agent_outputs')
      .insert(output);

    if (error) throw error;
  }

  async insertCard(card: CardRecord): Promise<void> {
    const { error } = await this.client
      .from('cards')
      .insert(card);

    if (error) throw error;
  }

  async upsertFact(fact: FactRecord): Promise<void> {
    const { error } = await this.client
      .from('facts')
      .upsert(fact, { onConflict: 'event_id,fact_key' });

    if (error) throw error;
  }

  async vectorSearch(
    eventId: string,
    query: number[],
    topK: number = 5
  ): Promise<Array<{ id: string; chunk: string; similarity: number }>> {
    const { data, error } = await this.client.rpc('match_context', {
      p_event: eventId,
      p_query: query,
      p_limit: topK,
    });

    if (error) throw error;
    return (data || []) as Array<{ id: string; chunk: string; similarity: number }>;
  }
}
