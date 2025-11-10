import type { RealtimeCardDTO } from '../types';

type CardType = RealtimeCardDTO['card_type'];

export interface CardRecordMetadata {
  title?: string;
  body?: string | null;
  label?: string | null;
  imageUrl?: string | null;
  agentOutputId?: number | string;
  [key: string]: unknown;
}

export interface CardRecord {
  conceptId: string;
  conceptLabel: string;
  cardType: CardType;
  sourceSeq: number;
  createdAt: number;
  metadata: CardRecordMetadata;
}

export interface ConceptCacheEntry {
  conceptId: string;
  conceptLabel: string;
  lastShownAt: number;
}

export class CardsStore {
  private readonly maxRecords: number;
  private records: CardRecord[] = [];
  private readonly conceptTimestamps: Map<string, ConceptCacheEntry> = new Map();

  constructor(maxRecords: number = 100) {
    this.maxRecords = maxRecords;
  }

  add(record: CardRecord): void {
    this.records.push(record);
    if (this.records.length > this.maxRecords) {
      this.records = this.records.slice(-this.maxRecords);
    }

    this.conceptTimestamps.set(record.conceptId, {
      conceptId: record.conceptId,
      conceptLabel: record.conceptLabel,
      lastShownAt: record.createdAt,
    });
  }

  getRecent(limit: number = 10): CardRecord[] {
    return this.records.slice(-limit).reverse();
  }

  getByConcept(conceptId: string): CardRecord[] {
    return this.records.filter((record) => record.conceptId === conceptId);
  }

  getConceptCache(): ConceptCacheEntry[] {
    return Array.from(this.conceptTimestamps.values());
  }

  getLastShownAt(conceptId: string): number | undefined {
    return this.conceptTimestamps.get(conceptId)?.lastShownAt;
  }

  hasRecentConcept(conceptId: string, freshnessMs: number): boolean {
    const entry = this.conceptTimestamps.get(conceptId);
    if (!entry) {
      return false;
    }
    return Date.now() - entry.lastShownAt <= freshnessMs;
  }

  clear(): void {
    this.records = [];
    this.conceptTimestamps.clear();
  }
}


