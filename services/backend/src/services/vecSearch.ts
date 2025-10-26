import fs from 'fs';
import Database from 'better-sqlite3';
import pino from 'pino';
import { performance } from 'node:perf_hooks';
import { getVectorPath } from './bundle';
import { metrics } from './metrics';

const log = pino({ name: 'vec-search' });
const connections = new Map<string, Database>();

interface VecRow {
  id: number;
  text_chunk: string;
  embedding: Buffer;
  meta?: string | null;
}

export interface VecHit {
  id: number;
  text: string;
  score: number;
  meta?: unknown;
}

export interface VecSearchResult {
  hits: VecHit[];
  latencyMs: number;
  strategy: 'extension' | 'fallback';
}

function getConnection(eventId: string): Database | null {
  if (connections.has(eventId)) {
    return connections.get(eventId)!;
  }
  const vectorsPath = getVectorPath(eventId);
  if (!vectorsPath || !fs.existsSync(vectorsPath)) {
    log.debug({ eventId, vectorsPath }, 'vector store missing for event');
    return null;
  }
  try {
    const db = new Database(vectorsPath, { readonly: true, fileMustExist: true });
    connections.set(eventId, db);
    return db;
  } catch (err) {
    log.warn({ err, vectorsPath }, 'failed to open vector sqlite');
    return null;
  }
}

function createQueryVector(query: string, dimensions: number): Buffer {
  const arr = new Float32Array(dimensions);
  for (let i = 0; i < query.length; i += 1) {
    arr[i % dimensions] += query.charCodeAt(i) / 255;
  }
  let norm = 0;
  for (let i = 0; i < arr.length; i += 1) {
    norm += arr[i] * arr[i];
  }
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < arr.length; i += 1) {
    arr[i] /= norm;
  }
  return Buffer.from(arr.buffer);
}

function bufferToFloat32(buffer: Buffer): Float32Array {
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / Float32Array.BYTES_PER_ELEMENT);
}

export function vecSearch(eventId: string, query: string, topK = 5): VecSearchResult {
  const start = performance.now();
  const db = getConnection(eventId);
  if (!db) {
    const latency = performance.now() - start;
    metrics.latencyVec.observe(latency);
    return { hits: [], latencyMs: latency, strategy: 'fallback' };
  }
  try {
    const sample = db.prepare('SELECT embedding FROM embeddings LIMIT 1').get() as { embedding: Buffer } | undefined;
    if (!sample) {
      const elapsed = performance.now() - start;
      metrics.latencyVec.observe(elapsed);
      return { hits: [], latencyMs: elapsed, strategy: 'fallback' };
    }
    const dims = sample.embedding.byteLength / Float32Array.BYTES_PER_ELEMENT;
    const queryVector = createQueryVector(query, dims);

    try {
      const stmt = db.prepare("SELECT rowid AS id, distance FROM vec_search('embeddings', 'embedding', ?, ?) ");
      const rows = stmt.all(queryVector, topK) as { id: number; distance: number }[];
      const result: VecHit[] = rows.map((row) => {
        const detail = db.prepare('SELECT text_chunk, meta FROM embeddings WHERE rowid = ?').get(row.id) as { text_chunk: string; meta?: string | null } | undefined;
        return {
          id: row.id,
          text: detail?.text_chunk ?? '',
          score: row.distance,
          meta: detail?.meta ? safeJson(detail.meta) : undefined
        };
      });
      const elapsed = performance.now() - start;
      metrics.latencyVec.observe(elapsed);
      if (result.length > 0) {
        metrics.retrievalMix.inc({ source: 'vec' }, result.length);
      }
      return { hits: result, latencyMs: elapsed, strategy: 'extension' };
    } catch (err) {
      log.debug({ err }, 'vec_search extension unavailable; using fallback');
    }

    const rows = db.prepare('SELECT rowid AS id, text_chunk, embedding, meta FROM embeddings LIMIT ?').all(Math.max(topK * 4, topK)) as VecRow[];
    const queryArr = bufferToFloat32(queryVector);
    const scored = rows.map((row) => {
      const vec = bufferToFloat32(row.embedding);
      let dot = 0;
      let normA = 0;
      let normB = 0;
      for (let i = 0; i < queryArr.length; i += 1) {
        const a = queryArr[i];
        const b = vec[i] ?? 0;
        dot += a * b;
        normA += a * a;
        normB += b * b;
      }
      const denom = Math.sqrt(normA) * Math.sqrt(normB) || 1;
      return {
        id: row.id,
        text: row.text_chunk,
        score: 1 - dot / denom,
        meta: row.meta ? safeJson(row.meta) : undefined
      };
    });
    scored.sort((a, b) => a.score - b.score);
    const hits = scored.slice(0, topK);
    const elapsed = performance.now() - start;
    metrics.latencyVec.observe(elapsed);
    if (hits.length > 0) {
      metrics.retrievalMix.inc({ source: 'vec' }, hits.length);
    }
    return { hits, latencyMs: elapsed, strategy: 'fallback' };
  } catch (err) {
    log.warn({ err, eventId }, 'vector search failed');
    const elapsed = performance.now() - start;
    metrics.latencyVec.observe(elapsed);
    return { hits: [], latencyMs: elapsed, strategy: 'fallback' };
  }
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
