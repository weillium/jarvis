import type { EventRuntime } from '../../types';

const MIN_INTERVAL_MS = Number(process.env.CARDS_MIN_INTERVAL_MS ?? 30_000);
const MAX_CARDS_PER_WINDOW = Number(process.env.CARDS_MAX_PER_WINDOW ?? 1);
const WINDOW_MS = Number(process.env.CARDS_RATE_WINDOW_MS ?? 120_000);

export interface RateLimitCheck {
  allowed: boolean;
  reason?: string;
}

export const CARD_RATE_LIMIT_MIN_INTERVAL_MS = MIN_INTERVAL_MS;
export const CARD_RATE_LIMIT_MAX_PER_WINDOW = MAX_CARDS_PER_WINDOW;
export const CARD_RATE_LIMIT_WINDOW_MS = WINDOW_MS;

export function checkCardRateLimit(runtime: EventRuntime, now: number = Date.now()): RateLimitCheck {
  const history = runtime.cardsRateHistory ?? [];
  if (history.length > 0) {
    const lastFired = history[history.length - 1];
    if (now - lastFired < MIN_INTERVAL_MS) {
      return {
        allowed: false,
        reason: 'min_interval',
      };
    }
  }

  const windowStart = now - WINDOW_MS;
  const windowHits = history.filter((timestamp) => timestamp >= windowStart);
  if (windowHits.length >= MAX_CARDS_PER_WINDOW) {
    return {
      allowed: false,
      reason: 'window_limit',
    };
  }

  return { allowed: true };
}

export function recordCardFire(runtime: EventRuntime, timestamp: number = Date.now()): void {
  const history = runtime.cardsRateHistory ?? [];
  history.push(timestamp);

  const windowStart = timestamp - WINDOW_MS;
  while (history.length > 0 && history[0] < windowStart) {
    history.shift();
  }

  runtime.cardsRateHistory = history;
  runtime.cardsLastTriggeredAt = timestamp;
}

