import { getLowercaseErrorField } from '../shared/payload-utils';

const TRANSIENT_INDICATORS = [
  'not ready',
  'could not send data',
  'connection closed',
  'connection reset',
  'timeout',
  'temporarily unavailable',
  'buffer too small',
  'ping',
  'pong',
  'retry later',
  'rate limit',
  '503',
  '504',
] as const;

const FATAL_INDICATORS = [
  'unknown parameter',
  'invalid api key',
  'api key not valid',
  'unauthorized',
  'forbidden',
  'unsupported',
  'malformed',
  'invalid_request_error',
  'policy violation',
] as const;

export const classifyRealtimeError = (error: unknown): 'transient' | 'fatal' => {
  const message = getLowercaseErrorField(error, 'message');
  const code = getLowercaseErrorField(error, 'code');
  const type = getLowercaseErrorField(error, 'type');

  if (TRANSIENT_INDICATORS.some((indicator) => message.includes(indicator))) {
    return 'transient';
  }

  if (
    FATAL_INDICATORS.some(
      (indicator) =>
        message.includes(indicator) || code.includes(indicator) || type.includes(indicator)
    )
  ) {
    return 'fatal';
  }

  if (type === 'invalid_request_error') {
    return 'fatal';
  }

  return 'transient';
};


