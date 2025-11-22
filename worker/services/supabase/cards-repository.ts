import type { SupabaseClient } from '@supabase/supabase-js';
import type { CardStateRecord } from './types';
import { mapCardStateRecords } from './dto-mappers';

const sanitizeNumber = (value: number | null | undefined): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return null;
};

const sanitizeNumberArray = (values: number[] | undefined): number[] => {
  if (!Array.isArray(values)) {
    return [];
  }
  return values.filter((entry) => typeof entry === 'number' && Number.isFinite(entry));
};

export class CardsRepository {
  constructor(private readonly client: SupabaseClient) {}

  async upsertCard(card: CardStateRecord): Promise<void> {
    const sanitized: CardStateRecord = {
      event_id: card.event_id,
      card_id: card.card_id,
      card_kind: card.card_kind ?? null,
      card_type: card.card_type ?? null,
      payload: card.payload,
      source_seq: sanitizeNumber(card.source_seq),
      last_seen_seq: typeof card.last_seen_seq === 'number' ? card.last_seen_seq : 0,
      sources: sanitizeNumberArray(card.sources),
      is_active: card.is_active ?? true,
    };

    const { error } = await this.client
      .from('cards')
      .upsert(sanitized, { onConflict: 'event_id,card_id' });

    if (error) throw error;
  }

  async getCards(eventId: string, activeOnly: boolean = true): Promise<CardStateRecord[]> {
    let query = this.client.from('cards').select('*').eq('event_id', eventId);
    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query.order('last_seen_seq', { ascending: false });
    if (error) throw error;
    return mapCardStateRecords(data);
  }

  async updateCardActiveStatus(eventId: string, cardIds: string[], isActive: boolean): Promise<void> {
    if (cardIds.length === 0) return;

    const { error } = await this.client
      .from('cards')
      .update({ is_active: isActive })
      .eq('event_id', eventId)
      .in('card_id', cardIds);

    if (error) throw error;
  }
}






