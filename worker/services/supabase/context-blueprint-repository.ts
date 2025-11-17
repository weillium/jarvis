import type { SupabaseClient } from '@supabase/supabase-js';
import type { ContextBlueprintRecord } from './types';
import { ensureBlueprintShape } from '../../lib/context-normalization';
import type { Blueprint } from '../../context/pipeline/blueprint/types';

export class ContextBlueprintRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getLatestApprovedBlueprint(eventId: string): Promise<Blueprint | null> {
    const { data, error } = await this.client
      .from('context_blueprints')
      .select('id, blueprint, created_at')
      .eq('event_id', eventId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<ContextBlueprintRecord>();

    if (error || !data || !data.blueprint) {
      return null;
    }

    try {
      return ensureBlueprintShape(data.blueprint);
    } catch (err) {
      console.error('[context-blueprint-repository] Failed to normalize blueprint', {
        eventId,
        blueprintId: data.id,
        error: String(err),
      });
      return null;
    }
  }

  async getAudienceProfile(eventId: string): Promise<Blueprint['audience_profile'] | null> {
    const blueprint = await this.getLatestApprovedBlueprint(eventId);
    return blueprint?.audience_profile ?? null;
  }
}

