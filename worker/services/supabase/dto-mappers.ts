import type {
  AgentRecord,
  AgentSessionRecord,
  AgentStatusRecord,
  AgentSummaryRecord,
  CheckpointRecord,
  FactRecord,
  GlossaryRecord,
  TranscriptRecord,
  VectorMatchRecord
} from '../../types';
import type { AgentType } from '../../types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toRecord = (value: unknown, context: string): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new Error(`Invalid ${context} row received from Supabase`);
  }
  return value;
};

const getString = (
  record: Record<string, unknown>,
  key: string,
  context: string
): string => {
  const value = record[key];
  if (typeof value === 'string') {
    return value;
  }
  throw new Error(`Expected '${key}' to be a string in ${context}`);
};

const getNullableString = (
  record: Record<string, unknown>,
  key: string
): string | null => {
  const value = record[key];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  throw new Error(`Expected '${key}' to be a string or null`);
};

const getOptionalString = (
  record: Record<string, unknown>,
  key: string
): string | null | undefined => {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    return undefined;
  }
  const value = record[key];
  if (value === null) {
    return null;
  }
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  throw new Error(`Expected '${key}' to be a string, null, or undefined`);
};

const getNumber = (
  record: Record<string, unknown>,
  key: string,
  context: string
): number => {
  const value = record[key];
  if (typeof value === 'number') {
    return value;
  }
  throw new Error(`Expected '${key}' to be a number in ${context}`);
};

const getOptionalNumber = (
  record: Record<string, unknown>,
  key: string
): number | undefined => {
  if (!Object.prototype.hasOwnProperty.call(record, key)) {
    return undefined;
  }
  const value = record[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'number') {
    return value;
  }
  throw new Error(`Expected '${key}' to be a number or undefined`);
};

const getBoolean = (
  record: Record<string, unknown>,
  key: string,
  context: string
): boolean => {
  const value = record[key];
  if (typeof value === 'boolean') {
    return value;
  }
  throw new Error(`Expected '${key}' to be a boolean in ${context}`);
};

const getAgentType = (
  record: Record<string, unknown>,
  key: string
): AgentType => {
  const value = record[key];
  if (isAgentType(value)) {
    return value;
  }
  throw new Error(`Expected '${key}' to be a valid agent type`);
};

const getStringArray = (
  record: Record<string, unknown>,
  key: string
): string[] => {
  const value = record[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
};

const getNumberArray = (
  record: Record<string, unknown>,
  key: string
): number[] => {
  const value = record[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is number => typeof entry === 'number');
};

const isAgentType = (value: unknown): value is AgentType =>
  value === 'transcript' || value === 'cards' || value === 'facts';

const toArray = (rows: unknown): unknown[] => {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows;
};

export const mapCheckpointRecords = (rows: unknown): CheckpointRecord[] =>
  toArray(rows).map((row) => {
    const record = toRecord(row, 'CheckpointRecord');
    return {
      agent_type: getAgentType(record, 'agent_type'),
      last_seq_processed: getNumber(record, 'last_seq_processed', 'CheckpointRecord'),
    };
  });

export const mapAgentStatusRecord = (row: unknown): AgentStatusRecord => {
  const record = toRecord(row, 'AgentStatusRecord');
  return {
    status: getString(record, 'status', 'AgentStatusRecord'),
    stage: getNullableString(record, 'stage'),
    model_set: getNullableString(record, 'model_set'),
  };
};

export const mapAgentSummaryRecords = (rows: unknown): AgentSummaryRecord[] =>
  toArray(rows).map((row) => {
    const record = toRecord(row, 'AgentSummaryRecord');
    return {
      id: getString(record, 'id', 'AgentSummaryRecord'),
      status: getString(record, 'status', 'AgentSummaryRecord'),
      stage: getNullableString(record, 'stage'),
      model_set: getNullableString(record, 'model_set'),
    };
  });

export const mapAgentRecords = (rows: unknown): AgentRecord[] =>
  toArray(rows).map((row) => {
    const record = toRecord(row, 'AgentRecord');
    return {
      id: getString(record, 'id', 'AgentRecord'),
      event_id: getString(record, 'event_id', 'AgentRecord'),
      status: getString(record, 'status', 'AgentRecord'),
    };
  });

export const mapAgentSessionRecords = (rows: unknown): AgentSessionRecord[] =>
  toArray(rows).map(mapAgentSessionRecord);

export const mapAgentSessionRecord = (row: unknown): AgentSessionRecord => {
  const record = toRecord(row, 'AgentSessionRecord');
  const providerSessionId = getOptionalString(record, 'provider_session_id');
  const createdAt = getOptionalString(record, 'created_at');
  const updatedAt = getOptionalString(record, 'updated_at');
  const closedAt = getOptionalString(record, 'closed_at');
  const model = getOptionalString(record, 'model');
  const lastConnectedAt = getOptionalString(record, 'last_connected_at');
  return {
    id: getString(record, 'id', 'AgentSessionRecord'),
    agent_type: getAgentType(record, 'agent_type'),
    status: getString(record, 'status', 'AgentSessionRecord'),
    provider_session_id: providerSessionId === undefined ? undefined : providerSessionId,
    created_at: createdAt ?? undefined,
    updated_at: updatedAt ?? undefined,
    closed_at: closedAt === undefined ? undefined : closedAt,
    model: model === undefined ? undefined : model,
    connection_count: getOptionalNumber(record, 'connection_count'),
    last_connected_at: lastConnectedAt === undefined ? undefined : lastConnectedAt,
  };
};

export const mapTranscriptRecords = (rows: unknown): TranscriptRecord[] =>
  toArray(rows).map(mapTranscriptRecord);

export const mapTranscriptRecord = (row: unknown): TranscriptRecord => {
  const record = toRecord(row, 'TranscriptRecord');
  return {
    id: getNumber(record, 'id', 'TranscriptRecord'),
    event_id: getString(record, 'event_id', 'TranscriptRecord'),
    seq: getNumber(record, 'seq', 'TranscriptRecord'),
    at_ms: getNumber(record, 'at_ms', 'TranscriptRecord'),
    speaker: getNullableString(record, 'speaker'),
    text: getString(record, 'text', 'TranscriptRecord'),
    final: getBoolean(record, 'final', 'TranscriptRecord'),
  };
};

export const mapGlossaryRecords = (rows: unknown): GlossaryRecord[] =>
  toArray(rows).map((row) => {
    const record = toRecord(row, 'GlossaryRecord');
    return {
      term: getString(record, 'term', 'GlossaryRecord'),
      definition: getString(record, 'definition', 'GlossaryRecord'),
      acronym_for: getNullableString(record, 'acronym_for'),
      category: getNullableString(record, 'category'),
      usage_examples: getStringArray(record, 'usage_examples'),
      related_terms: getStringArray(record, 'related_terms'),
      confidence_score: getNumber(record, 'confidence_score', 'GlossaryRecord'),
    };
  });

export const mapFactRecords = (rows: unknown): FactRecord[] =>
  toArray(rows).map((row) => {
    const record = toRecord(row, 'FactRecord');
    return {
      event_id: getString(record, 'event_id', 'FactRecord'),
      fact_key: getString(record, 'fact_key', 'FactRecord'),
      fact_value: record['fact_value'],
      confidence: getNumber(record, 'confidence', 'FactRecord'),
      last_seen_seq: getNumber(record, 'last_seen_seq', 'FactRecord'),
      sources: getNumberArray(record, 'sources'),
      is_active: typeof record['is_active'] === 'boolean' ? record['is_active'] : undefined,
    };
  });

export const mapVectorMatchRecords = (rows: unknown): VectorMatchRecord[] =>
  toArray(rows).map((row) => {
    const record = toRecord(row, 'VectorMatchRecord');
    return {
      id: getString(record, 'id', 'VectorMatchRecord'),
      chunk: getString(record, 'chunk', 'VectorMatchRecord'),
      similarity: getNumber(record, 'similarity', 'VectorMatchRecord'),
    };
  });

export const mapIdList = (rows: unknown): string[] =>
  toArray(rows).map((row) => getString(toRecord(row, 'IdRecord'), 'id', 'IdRecord'));

export const mapSingleId = (row: unknown): string =>
  getString(toRecord(row, 'IdRecord'), 'id', 'IdRecord');

export const mapConnectionCountInfo = (
  row: unknown
): { id: string; connection_count: number } => {
  const record = toRecord(row, 'AgentSessionConnection');
  const countValue = record['connection_count'];
  const connectionCount = typeof countValue === 'number' ? countValue : 0;
  return {
    id: getString(record, 'id', 'AgentSessionConnection'),
    connection_count: connectionCount,
  };
};
