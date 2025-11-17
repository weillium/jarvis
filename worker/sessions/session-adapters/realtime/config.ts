const parseInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

export interface HeartbeatConfig {
  pingIntervalMs: number;
  pongTimeoutMs: number;
  maxMissedPongs: number;
}

export interface RetryPolicyConfig {
  maxErrorRetries: number;
  backoffBaseMs: number;
  backoffCapMs: number;
}

export const resolveHeartbeatConfig = (
  override?: HeartbeatConfig,
  env: NodeJS.ProcessEnv = process.env
): HeartbeatConfig => {
  if (override) {
    return override;
  }

  return {
    pingIntervalMs: parseInteger(env.REALTIME_PING_INTERVAL_MS, 25_000),
    pongTimeoutMs: parseInteger(env.REALTIME_PONG_TIMEOUT_MS, 10_000),
    maxMissedPongs: parseInteger(env.REALTIME_MAX_MISSED_PONGS, 3),
  };
};

export const resolveRetryPolicy = (
  override?: RetryPolicyConfig,
  env: NodeJS.ProcessEnv = process.env
): RetryPolicyConfig => {
  if (override) {
    return override;
  }

  return {
    maxErrorRetries: parseInteger(env.REALTIME_MAX_ERROR_RETRIES, 5),
    backoffBaseMs: parseInteger(env.REALTIME_RETRY_BACKOFF_MS, 1_000),
    backoffCapMs: parseInteger(env.REALTIME_RETRY_BACKOFF_CAP_MS, 8_000),
  };
};
