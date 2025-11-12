import type { SupabaseClient } from '@supabase/supabase-js';
import type { FactRecord } from './types';
import { mapFactRecords } from './dto-mappers';

export class FactsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async upsertFact(fact: FactRecord): Promise<void> {
    const factWithActive = {
      ...fact,
      is_active: fact.is_active !== undefined ? fact.is_active : true,
      merge_provenance: fact.merge_provenance ?? [],
      merged_at: fact.merged_at ?? null,
    };

    const { error } = await this.client
      .from('facts')
      .upsert(factWithActive, { onConflict: 'event_id,fact_key' });

    if (error) throw error;
  }

  async supportsNormalizedHashColumn(): Promise<boolean> {
    const { error } = await this.client.from('facts').select('normalized_hash').limit(1);
    return !error;
  }

  async getFacts(eventId: string, activeOnly: boolean = true): Promise<FactRecord[]> {
    let query = this.client.from('facts').select('*').eq('event_id', eventId);

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query.order('last_seen_seq', { ascending: false });

    if (error) throw error;
    return mapFactRecords(data);
  }

  async deleteFactsForEvent(eventId: string): Promise<void> {
    const { error } = await this.client.from('facts').update({ is_active: false }).eq('event_id', eventId);

    if (error) throw error;
  }

  async updateFactActiveStatus(eventId: string, factKeys: string[], isActive: boolean): Promise<void> {
    if (factKeys.length === 0) return;

    const { error } = await this.client
      .from('facts')
      .update({ is_active: isActive })
      .eq('event_id', eventId)
      .in('fact_key', factKeys);

    if (error) throw error;
  }
}
