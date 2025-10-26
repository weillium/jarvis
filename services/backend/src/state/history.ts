import { randomUUID } from 'node:crypto';

export interface StoredCard {
  id: string;
  payload: any;
  ts: number;
  cursor: number;
}

const history = new Map<string, StoredCard[]>();
const cursors = new Map<string, number>();
const MAX_HISTORY = 500;

export function appendCards(eventId: string, cards: any[]): StoredCard[] {
  if (!cards.length) return [];
  const list = history.get(eventId) ?? [];
  const startCursor = (cursors.get(eventId) ?? 0) + 1;
  const stamped = cards.map((card, index) => ({
    id: randomUUID(),
    payload: { ...card },
    ts: Date.now(),
    cursor: startCursor + index
  }));
  const combined = [...list, ...stamped];
  while (combined.length > MAX_HISTORY) {
    combined.shift();
  }
  history.set(eventId, combined);
  cursors.set(eventId, stamped[stamped.length - 1].cursor);
  return stamped;
}

export function listCards(eventId: string, cursor = 0, limit = 50): { cards: StoredCard[]; nextCursor: number | null } {
  const list = history.get(eventId) ?? [];
  const filtered = list.filter((item) => item.cursor > cursor).slice(0, limit);
  const nextCursor = filtered.length ? filtered[filtered.length - 1].cursor : null;
  return { cards: filtered, nextCursor };
}
