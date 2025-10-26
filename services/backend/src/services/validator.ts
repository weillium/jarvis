import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import pino from 'pino';
import cardSchema from '../../../../packages/models/schemas/Card.schema.json' assert { type: 'json' };
import { metrics } from './metrics';

const log = pino({ name: 'card-validator' });

const ajv = new Ajv({ 
  allErrors: true, 
  strict: false,
  strictSchema: false
});
addFormats(ajv);
const validate = ajv.compile(cardSchema);

export interface ValidationResult<T> {
  valid: T[];
  invalid: { card: unknown; errors: string[] }[];
}

export function validateCards<T = unknown>(cards: unknown[]): ValidationResult<T> {
  const valid: T[] = [];
  const invalid: { card: unknown; errors: string[] }[] = [];
  for (const card of cards ?? []) {
    if (validate(card)) {
      valid.push(card as T);
    } else {
      const errors = (validate.errors ?? []).map((err) => `${err.instancePath || '.'} ${err.message ?? ''}`.trim());
      log.warn({ errors, card }, 'card failed validation');
      invalid.push({ card, errors });
    }
  }
  if (invalid.length > 0) {
    metrics.jsonInvalid.inc(invalid.length);
  }
  return { valid, invalid };
}
