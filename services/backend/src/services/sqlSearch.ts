import fs from 'fs';
import Database from 'better-sqlite3';
import pino from 'pino';
import { performance } from 'node:perf_hooks';
import { getSqlitePath } from './bundle';
import { metrics } from './metrics';

const log = pino({ name: 'sql-search' });
const connections = new Map<string, Database>();

function getConnection(eventId: string): Database | null {
  if (connections.has(eventId)) {
    return connections.get(eventId)!;
  }
  const sqlitePath = getSqlitePath(eventId);
  if (!sqlitePath || !fs.existsSync(sqlitePath)) {
    log.warn({ eventId, sqlitePath }, 'sqlite file missing for event');
    return null;
  }
  try {
    const db = new Database(sqlitePath, { readonly: true, fileMustExist: true });
    connections.set(eventId, db);
    return db;
  } catch (err) {
    log.error({ err, sqlitePath }, 'failed to open sqlite database');
    return null;
  }
}

export interface SqlHit {
  title: string;
  summary: string | null;
  refs: { label?: string; url: string }[];
  score: number;
}

export interface SqlSearchResult {
  hits: SqlHit[];
  latencyMs: number;
}

export function sqlSearch(eventId: string, query: string, topK = 5): SqlSearchResult {
  const start = performance.now();
  const db = getConnection(eventId);
  if (!db) {
    const latency = performance.now() - start;
    metrics.latencySql.observe(latency);
    return { hits: [], latencyMs: latency };
  }
  try {
    const stmt = db.prepare(`
      SELECT e.surface AS title, e.summary AS summary, e.refs AS refs, bm25(entities_fts) AS score
      FROM entities_fts
      JOIN entities e ON e.id = entities_fts.rowid
      WHERE entities_fts MATCH ?
      ORDER BY score ASC
      LIMIT ?
    `);
    const rows = stmt.all(`${query}*`, topK) as { title: string; summary: string | null; refs: string | null; score: number }[];
    const hits = rows.map((row) => ({
      title: row.title,
      summary: row.summary,
      refs: safeParseRefs(row.refs),
      score: row.score
    }));
    const elapsed = performance.now() - start;
    metrics.latencySql.observe(elapsed);
    if (hits.length > 0) {
      metrics.retrievalMix.inc({ source: 'sql' }, hits.length);
    }
    return { hits, latencyMs: elapsed };
  } catch (err) {
    log.warn({ err, eventId }, 'sql search failed');
    const elapsed = performance.now() - start;
    metrics.latencySql.observe(elapsed);
    return { hits: [], latencyMs: elapsed };
  }
}

function safeParseRefs(value: string | null): { label?: string; url: string }[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((ref): ref is { label?: string; url: string } => typeof ref?.url === 'string');
    }
  } catch (err) {
    log.warn({ err }, 'failed to parse refs column');
  }
  return [];
}
