import type { SupabaseClient } from '@supabase/supabase-js';
import type { GlossaryRecord } from './types';
import { mapGlossaryRecords, mapIdList } from './dto-mappers';

export class GlossaryRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getGlossaryTerms(eventId: string, generationCycleId?: string): Promise<GlossaryRecord[]> {
    const { data: activeCycles, error: cycleError } = await this.client
      .from('generation_cycles')
      .select('id')
      .eq('event_id', eventId)
      .neq('status', 'superseded')
      .in('cycle_type', ['glossary']);

    if (cycleError) {
      console.warn('[glossary-repo] Warning: Failed to fetch active glossary cycles:', cycleError.message);
    }

    const activeCycleIds: string[] = mapIdList(activeCycles);

    let query = this.client.from('glossary_terms').select('*').eq('event_id', eventId);

    if (generationCycleId) {
      query = query.eq('generation_cycle_id', generationCycleId);
    } else if (activeCycleIds.length > 0) {
      query = query.or(
        `generation_cycle_id.is.null,generation_cycle_id.in.(${activeCycleIds.join(',')})`
      );
    } else {
      query = query.is('generation_cycle_id', null);
    }

    const { data, error } = await query.order('confidence_score', { ascending: false });
    if (error) throw error;
    return mapGlossaryRecords(data);
  }
}
