'use server';

import { createServerClient } from '@/shared/lib/supabase/server';
import { requireAuth, requireEventOwnership } from '@/shared/lib/auth';
import { Card } from '@/shared/types/card';

export async function getCardsByEventId(eventId: string): Promise<{ data: Card[] | null; error: string | null }> {
  try {
    const supabase = await createServerClient();
    const user = await requireAuth(supabase);
    await requireEventOwnership(supabase, user.id, eventId);

    // Fetch active cards from the canonical cards table
    const { data, error } = await supabase
      .from('cards')
      .select('card_id, event_id, payload, last_seen_seq, created_at, updated_at, card_kind, is_active')
      .eq('event_id', eventId)
      .eq('is_active', true)
      .order('last_seen_seq', { ascending: false });

    if (error) {
      return { data: null, error: error.message };
    }

    // Map to Card type
    const cards: Card[] = (data || []).map((row) => {
      const payload =
        row?.payload && typeof row.payload === 'object'
          ? (row.payload as Record<string, unknown>)
          : null;

      const emittedAt = typeof row.updated_at === 'string'
        ? row.updated_at
        : typeof row.created_at === 'string'
        ? row.created_at
        : new Date().toISOString();

      const kind =
        typeof row.card_kind === 'string'
          ? row.card_kind
          : payload && typeof payload.kind === 'string'
          ? payload.kind
          : 'Context';

      return {
        id: row.card_id,
        event_id: row.event_id,
        emitted_at: emittedAt,
        kind,
        payload,
        is_active: row.is_active !== false,
      };
    });

    return { data: cards, error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { data: null, error: errorMessage };
  }
}

export async function updateCardActiveStatus(
  eventId: string,
  cardId: string,
  isActive: boolean
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!cardId) {
      return { ok: false, error: 'Card ID is required' };
    }

    const supabase = await createServerClient();
    const user = await requireAuth(supabase);
    await requireEventOwnership(supabase, user.id, eventId);

    const { error } = await supabase
      .from('cards')
      .update({ is_active: isActive })
      .eq('event_id', eventId)
      .eq('card_id', cardId);

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { ok: false, error: errorMessage };
  }
}

