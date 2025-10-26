import fs from 'fs';
import path from 'path';
import pino from 'pino';
import { config } from '../config';

const log = pino({ name: 'bundle-loader' });

export interface BundleManifest {
  version: string;
  schema_date: string;
  sqlite: string;
  vectors?: string;
  rules?: string;
}

export interface BundleInfo {
  eventId: string;
  baseDir: string;
  manifest: BundleManifest;
}

const cache = new Map<string, BundleInfo>();

export function loadBundle(eventId: string): BundleInfo | null {
  const baseDir = path.join(config.bundlesDir, eventId);
  const manifestPath = path.join(baseDir, 'manifest.json');
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(raw) as BundleManifest;
    const info: BundleInfo = { eventId, baseDir, manifest };
    cache.set(eventId, info);
    return info;
  } catch (err) {
    log.warn({ err, eventId, manifestPath }, 'failed to load bundle manifest');
    return null;
  }
}

export function getBundle(eventId: string): BundleInfo | null {
  if (cache.has(eventId)) {
    return cache.get(eventId)!;
  }
  return loadBundle(eventId);
}

export function getSqlitePath(eventId: string): string | null {
  const bundle = getBundle(eventId);
  if (!bundle) return null;
  return path.join(bundle.baseDir, bundle.manifest.sqlite);
}

export function getVectorPath(eventId: string): string | null {
  const bundle = getBundle(eventId);
  if (!bundle || !bundle.manifest.vectors) return null;
  return path.join(bundle.baseDir, bundle.manifest.vectors);
}

export function preloadDefaultBundle() {
  const defaultId = process.env.DEFAULT_EVENT_ID || 'sample';
  const info = getBundle(defaultId);
  if (info) {
    log.info({ eventId: defaultId, baseDir: info.baseDir }, 'preloaded bundle');
  } else {
    log.warn({ eventId: defaultId }, 'default bundle not found');
  }
}
