import type { Express, Request, Response } from 'express';
import pino from 'pino';
import { config } from '../config';
import { appendCards, listCards } from '../state/history';

const log = pino({ name: 'http' });

interface PoliciesPayload {
  cooldown_s: number;
  max_cards_per_min: number;
  merge_window_ms: number;
}

const policyState: PoliciesPayload = {
  cooldown_s: config.policies.cooldownSeconds,
  max_cards_per_min: config.policies.maxCardsPerMin,
  merge_window_ms: config.policies.mergeWindowMs
};

export function registerRoutes(app: Express) {
  app.get('/health', (_req: Request, res: Response) => res.status(200).json({ status: 'ok' }));

  app.post('/api/events', (req: Request, res: Response) => {
    log.info({ event: req.body }, 'received event bootstrap request');
    res.status(202).send();
  });

  app.post('/api/transcript', (_req: Request, res: Response) => {
    // HTTP ingest fallback is not implemented in the scaffold yet.
    res.status(204).send();
  });

  app.get('/api/cards/history', (req: Request, res: Response) => {
    const eventId = req.query.event_id;
    if (typeof eventId !== 'string' || !eventId) {
      return res.status(400).json({ error: 'event_id is required' });
    }
    const cursor = req.query.cursor ? Number(req.query.cursor) : 0;
    if (Number.isNaN(cursor) || cursor < 0) {
      return res.status(400).json({ error: 'cursor must be a non-negative number' });
    }
    const { cards, nextCursor } = listCards(eventId, cursor, 50);
    return res.json({
      cards: cards.map((entry) => ({ id: entry.id, ts: entry.ts, cursor: entry.cursor, ...entry.payload })),
      next_cursor: nextCursor ?? undefined
    });
  });

  app.post('/api/policies', (req: Request, res: Response) => {
    const payload = req.body as PoliciesPayload;
    if (!validatePolicies(payload)) {
      return res.status(400).json({ error: 'invalid policy payload' });
    }
    policyState.cooldown_s = payload.cooldown_s;
    policyState.max_cards_per_min = payload.max_cards_per_min;
    policyState.merge_window_ms = payload.merge_window_ms;
    log.info({ policyState }, 'updated policies');
    res.status(204).send();
  });

  app.post('/api/feedback', (req: Request, res: Response) => {
    log.info({ feedback: req.body }, 'feedback received');
    res.status(204).send();
  });
}

export function recordHistory(eventId: string, cards: any[]): void {
  appendCards(eventId, cards);
}

function validatePolicies(payload: PoliciesPayload | undefined): payload is PoliciesPayload {
  if (!payload) return false;
  return [
    Number.isInteger(payload.cooldown_s) && payload.cooldown_s >= 0,
    Number.isInteger(payload.max_cards_per_min) && payload.max_cards_per_min >= 1,
    Number.isInteger(payload.merge_window_ms) && payload.merge_window_ms >= 0
  ].every(Boolean);
}
