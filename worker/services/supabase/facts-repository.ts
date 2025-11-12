import type { SupabaseClient } from '@supabase/supabase-js';
import type { FactAliasRecord, FactRecord } from './types';
import { mapFactAliasRecords, mapFactRecords } from './dto-mappers';

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
    const { error } = await this.client
      .from('facts')
      .select(
        'normalized_hash,fact_kind,exclude_from_prompt,original_fact_value,fingerprint_hash,fact_subject,fact_predicate,fact_objects'
      )
      .limit(1);
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

  async updateFactLifecycle(
    eventId: string,
    updates: Array<{ key: string; isActive?: boolean; dormantAt?: string | null; prunedAt?: string | null }>
  ): Promise<void> {
    if (updates.length === 0) {
      return;
    }

    for (const update of updates) {
      const payload: Record<string, unknown> = {};
      if (update.isActive !== undefined) {
        payload.is_active = update.isActive;
      }
      if (update.dormantAt !== undefined) {
        payload.dormant_at = update.dormantAt;
      }
      if (update.prunedAt !== undefined) {
        payload.pruned_at = update.prunedAt;
      }
      if (Object.keys(payload).length === 0) {
        continue;
      }

      const { error } = await this.client
        .from('facts')
        .update(payload)
        .eq('event_id', eventId)
        .eq('fact_key', update.key);

      if (error) throw error;
    }
  }

  async getFactAliases(eventId: string): Promise<FactAliasRecord[]> {
    const { data, error } = await this.client
      .from('fact_key_aliases')
      .select('*')
      .eq('event_id', eventId);

    if (error) throw error;
    return mapFactAliasRecords(data);
  }

  async upsertFactAliases(
    eventId: string,
    aliases: Array<{ aliasKey: string; canonicalKey: string }>
  ): Promise<void> {
    if (aliases.length === 0) {
      return;
    }

    const rows = aliases.map((alias) => ({
      event_id: eventId,
      alias_key: alias.aliasKey,
      canonical_key: alias.canonicalKey,
    }));

    const { error } = await this.client
      .from('fact_key_aliases')
      .upsert(rows, { onConflict: 'event_id,alias_key' });

    if (error) throw error;
  }

  async deleteFactAliases(eventId: string, aliasKeys: string[]): Promise<void> {
    if (aliasKeys.length === 0) {
      return;
    }

    const { error } = await this.client
      .from('fact_key_aliases')
      .delete()
      .eq('event_id', eventId)
      .in('alias_key', aliasKeys);

    if (error) throw error;
  }
}
