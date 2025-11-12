/**
 * In-memory Facts Store
 * Maintains a compact key-value store of stable facts extracted during events
 * Enforces maximum capacity with LRU eviction (lowest confidence first, then oldest)
 */

export interface Fact {
  key: string;
  value: unknown; // JSON-serializable value
  confidence: number; // 0-1
  lastSeenSeq: number;
  sources: number[]; // Transcript IDs that contributed
  mergedFrom: string[];
  mergedAt: string | null;
  missStreak: number;
  createdAt: number;
  lastTouchedAt: number;
  dormantAt: number | null;
  prunedAt: number | null;
}

export class FactsStore {
  private facts: Map<string, Fact> = new Map();
  private maxItems: number;
  private evictionCount: number = 0;
  private dormantFacts: Set<string> = new Set();
  private prunedFacts: Set<string> = new Set();
  private prunedQueue: Set<string> = new Set();

  constructor(maxItems: number = 50) {
    this.maxItems = maxItems;
  }

  /**
   * Evict facts when over capacity
   * Evicts lowest-confidence facts first, then oldest if confidence is tied
   * @returns Array of fact keys that were evicted
   */
  private evictIfNeeded(): string[] {
    if (this.facts.size <= this.maxItems) {
      return [];
    }

    const overCapacity = this.facts.size - this.maxItems;
    const factsArray = Array.from(this.facts.entries());

    // Sort by confidence (lowest first), then by lastSeenSeq (oldest first)
    factsArray.sort((a, b) => {
      const [, aFact] = a;
      const [, bFact] = b;
      
      // First sort by confidence (ascending - lowest first)
      if (aFact.confidence !== bFact.confidence) {
        return aFact.confidence - bFact.confidence;
      }
      
      // If confidence is tied, sort by lastSeenSeq (ascending - oldest first)
      return aFact.lastSeenSeq - bFact.lastSeenSeq;
    });

    // Evict the first N (lowest confidence/oldest)
    const evictedKeys: string[] = [];
    for (let i = 0; i < overCapacity; i++) {
      const [key] = factsArray[i];
      this.facts.delete(key);
      this.dormantFacts.delete(key);
      this.prunedFacts.delete(key);
      this.prunedQueue.delete(key);
      this.evictionCount++;
      evictedKeys.push(key);
    }

    console.log(`[facts] Evicted ${overCapacity} facts (capacity: ${this.maxItems}, total evictions: ${this.evictionCount})`);
    return evictedKeys;
  }

  /**
   * Upsert a fact (update if exists, insert if not)
   * Automatically evicts facts if over capacity
   * @returns Array of fact keys that were evicted (empty if no eviction occurred)
   */
  upsert(
    key: string,
    value: unknown,
    confidence: number,
    sourceSeq: number,
    sourceId?: number
  ): string[] {
    const existing = this.facts.get(key);
    const now = Date.now();

    if (existing) {
      // Update existing fact
      // Increase confidence if new value matches, decrease if different
      const valueMatches = JSON.stringify(existing.value) === JSON.stringify(value);
      const newConfidence = valueMatches
        ? Math.min(1.0, existing.confidence + 0.1) // Boost confidence
        : Math.max(0.1, existing.confidence - 0.2); // Lower confidence on mismatch

      const updatedSources =
        typeof sourceId === 'number' && Number.isFinite(sourceId)
          ? this.appendUniqueSource(existing.sources, sourceId)
          : existing.sources;

      this.facts.set(key, {
        key,
        value,
        confidence: newConfidence,
        lastSeenSeq: sourceSeq,
        sources: updatedSources,
        mergedFrom: existing.mergedFrom,
        mergedAt: existing.mergedAt,
        missStreak: existing.missStreak ?? 0,
        createdAt: existing.createdAt,
        lastTouchedAt: now,
        dormantAt: null,
        prunedAt: null,
      });
      this.dormantFacts.delete(key);
      this.prunedFacts.delete(key);
      this.prunedQueue.delete(key);
      return [];
    } else {
      // Insert new fact
      const initialSources =
        typeof sourceId === 'number' && Number.isFinite(sourceId) ? [sourceId] : [];

      this.facts.set(key, {
        key,
        value,
        confidence,
        lastSeenSeq: sourceSeq,
        sources: initialSources,
        mergedFrom: [],
        mergedAt: null,
        missStreak: 0,
        createdAt: now,
        lastTouchedAt: now,
        dormantAt: null,
        prunedAt: null,
      });
      this.dormantFacts.delete(key);
      this.prunedFacts.delete(key);
      this.prunedQueue.delete(key);

      // Evict if over capacity and return evicted keys
      return this.evictIfNeeded();
    }
  }

  /**
   * Load facts into the store (used when initializing from database)
   * If loading more facts than capacity, evictions will occur automatically
   * @returns Array of fact keys that were evicted (if any)
   */
  loadFacts(
    facts: Array<{
      key: string;
      value: unknown;
      confidence: number;
      lastSeenSeq: number;
      sources: number[];
      mergedFrom?: string[];
      mergedAt?: string | null;
      missStreak?: number;
      createdAt?: number;
      lastTouchedAt?: number;
      dormantAt?: number | null;
      prunedAt?: number | null;
    }>
  ): string[] {
    const evictedKeys: string[] = [];
    const now = Date.now();
    this.dormantFacts.clear();
    this.prunedFacts.clear();
    this.prunedQueue.clear();
    
    for (const fact of facts) {
      this.facts.set(fact.key, {
        key: fact.key,
        value: fact.value,
        confidence: fact.confidence,
        lastSeenSeq: fact.lastSeenSeq,
        sources: fact.sources || [],
        mergedFrom: fact.mergedFrom ?? [],
        mergedAt: fact.mergedAt ?? null,
        missStreak: fact.missStreak ?? 0,
        createdAt: fact.createdAt ?? now,
        lastTouchedAt: fact.lastTouchedAt ?? now,
        dormantAt: fact.dormantAt ?? null,
        prunedAt: fact.prunedAt ?? null,
      });
      
      // Check if we need to evict after each addition (if we're over capacity)
      if (this.facts.size > this.maxItems) {
        const keysEvicted = this.evictIfNeeded();
        evictedKeys.push(...keysEvicted);
      }
    }
    
    return evictedKeys;
  }

  /**
   * Get a fact by key
   */
  get(key: string): Fact | undefined {
    return this.facts.get(key);
  }

  /**
   * Snapshot all facts (optionally including dormant)
   */
  getSnapshot(includeDormant: boolean = false): Fact[] {
    const snapshot: Fact[] = [];
    for (const fact of this.facts.values()) {
      if (this.prunedFacts.has(fact.key)) {
        continue;
      }
      if (!includeDormant && this.dormantFacts.has(fact.key)) {
        continue;
      }
      snapshot.push({ ...fact });
    }
    return snapshot;
  }

  /**
   * Alias for backwards compatibility
   */
  getAll(includeDormant: boolean = false): Fact[] {
    return this.getSnapshot(includeDormant);
  }

  isDormant(key: string): boolean {
    return this.dormantFacts.has(key);
  }

  isPruned(key: string): boolean {
    return this.prunedFacts.has(key);
  }

  getDormantKeys(): string[] {
    return Array.from(this.dormantFacts);
  }

  markDormant(key: string, now: number, confidenceDrop: number): boolean {
    if (this.dormantFacts.has(key) || this.prunedFacts.has(key)) {
      return false;
    }
    const fact = this.facts.get(key);
    if (!fact) {
      return false;
    }
    fact.confidence = clampConfidence(fact.confidence - confidenceDrop);
    fact.dormantAt = now;
    this.dormantFacts.add(key);
    this.facts.set(key, fact);
    return true;
  }

  reviveFromSelection(
    key: string,
    previousConfidence: number | undefined,
    currentConfidence: number,
    now: number,
    hysteresisDelta: number
  ): boolean {
    const fact = this.facts.get(key);
    if (!fact) {
      return false;
    }

    const delta = currentConfidence - (previousConfidence ?? currentConfidence);
    const wasDormant = this.dormantFacts.has(key);

    fact.lastTouchedAt = now;
    fact.prunedAt = null;

    if (!wasDormant) {
      this.facts.set(key, fact);
      return false;
    }

    if (delta < hysteresisDelta) {
      // Fact remains dormant; do not revive yet
      this.facts.set(key, fact);
      return false;
    }

    fact.dormantAt = null;
    fact.missStreak = 0;
    this.dormantFacts.delete(key);
    this.facts.set(key, fact);
    return true;
  }

  prune(key: string, now: number): boolean {
    if (this.prunedFacts.has(key)) {
      return false;
    }
    const fact = this.facts.get(key);
    if (!fact) {
      return false;
    }

    fact.prunedAt = now;
    const lifespanMs = now - (fact.createdAt ?? now);
    console.log(
      `[facts] pruned fact ${key} lifespan=${Math.round(lifespanMs / 1000)}s`
    );

    this.prunedFacts.add(key);
    this.dormantFacts.delete(key);
    this.prunedQueue.add(key);
    this.facts.delete(key);
    return true;
  }

  drainPrunedKeys(): string[] {
    const keys = Array.from(this.prunedQueue);
    this.prunedQueue.clear();
    return keys;
  }

  /**
   * Get all facts above a confidence threshold
   */
  getHighConfidence(threshold: number = 0.5): Fact[] {
    return this.getSnapshot().filter((f) => f.confidence >= threshold);
  }

  /**
   * Get all facts as a compact JSON structure for context
   */
  getContextFormat(): Record<string, unknown> {
    const highConf = this.getHighConfidence(0.5);
    const result: Record<string, unknown> = {};
    for (const fact of highConf) {
      result[fact.key] = fact.value;
    }
    return result;
  }

  private appendUniqueSource(existingSources: number[], sourceId: number): number[] {
    if (!Number.isFinite(sourceId)) {
      return existingSources;
    }

    if (existingSources.includes(sourceId)) {
      return existingSources.slice(-10);
    }

    return [...existingSources, sourceId].slice(-10);
  }

  /**
   * Get facts as bullet points for prompt inclusion
   */
  getBullets(): string[] {
    const highConf = this.getHighConfidence(0.5);
    return highConf.map((fact) => {
      const valueStr =
        typeof fact.value === 'string' ? fact.value : JSON.stringify(fact.value);
      return `- ${fact.key}: ${valueStr} (confidence: ${fact.confidence.toFixed(2)})`;
    });
  }

  /**
   * Remove a fact
   */
  delete(key: string): boolean {
    const deleted = this.facts.delete(key);
    if (deleted) {
      this.dormantFacts.delete(key);
      this.prunedFacts.delete(key);
      this.prunedQueue.delete(key);
    }
    return deleted;
  }

  /**
   * Clear all facts
   */
  clear(): void {
    this.facts.clear();
    this.dormantFacts.clear();
    this.prunedFacts.clear();
    this.prunedQueue.clear();
  }

  /**
   * Get current stats
   */
  getStats() {
    const all = this.getSnapshot(true);
    return {
      total: all.length,
      maxItems: this.maxItems,
      capacityUsed: `${all.length}/${this.maxItems}`,
      highConfidence: all.filter((f) => f.confidence >= 0.5).length,
      mediumConfidence: all.filter((f) => f.confidence >= 0.3 && f.confidence < 0.5).length,
      lowConfidence: all.filter((f) => f.confidence < 0.3).length,
      evictions: this.evictionCount,
    };
  }

  applyConfidenceAdjustments(
    adjustments: Array<{ key: string; newConfidence?: number; newMissStreak?: number }>
  ): void {
    if (!adjustments.length) {
      return;
    }

    for (const adjustment of adjustments) {
      const existing = this.facts.get(adjustment.key);
      if (!existing) {
        continue;
      }
      const updated: Fact = { ...existing };

      if (typeof adjustment.newConfidence === 'number' && !Number.isNaN(adjustment.newConfidence)) {
        const confidence = clampConfidence(adjustment.newConfidence);
        updated.confidence = confidence;
      }

      if (typeof adjustment.newMissStreak === 'number' && adjustment.newMissStreak >= 0) {
        updated.missStreak = adjustment.newMissStreak;
      }

      this.facts.set(adjustment.key, updated);
    }
  }

  recordMerge(primaryKey: string, memberKeys: string[], mergedAt: string): void {
    if (memberKeys.length === 0) {
      return;
    }

    const primary = this.facts.get(primaryKey);
    if (!primary) {
      return;
    }

    const mergedSet = new Set(primary.mergedFrom);
    for (const memberKey of memberKeys) {
      if (memberKey && memberKey !== primaryKey) {
        mergedSet.add(memberKey);
      }
    }

    primary.mergedFrom = Array.from(mergedSet);
    primary.mergedAt = mergedAt;
    primary.missStreak = 0;
    primary.lastTouchedAt = Date.now();
    primary.dormantAt = null;
    primary.prunedAt = null;
    this.facts.set(primaryKey, primary);
    this.dormantFacts.delete(primaryKey);
    this.prunedFacts.delete(primaryKey);
  }

  mergeFact(
    key: string,
    params: {
      value: unknown;
      confidence: number;
      sourceSeq: number;
      sourceId?: number;
      mergedKeys?: string[];
      preferIncomingValue?: boolean;
    }
  ): Fact | null {
    const existing = this.facts.get(key);
    if (!existing) {
      return null;
    }

    const sourcesSet = new Set(existing.sources);
    if (typeof params.sourceId === 'number' && Number.isFinite(params.sourceId)) {
      sourcesSet.add(params.sourceId);
    }

    const mergedFromSet = new Set(existing.mergedFrom);
    if (Array.isArray(params.mergedKeys)) {
      for (const mergedKey of params.mergedKeys) {
        if (mergedKey && mergedKey !== key) {
          mergedFromSet.add(mergedKey);
        }
      }
    }

    const updatedConfidence = clampConfidence(
      (existing.confidence + params.confidence) / 2
    );

    const preferIncoming = params.preferIncomingValue ?? true;
    const nextValue = preferIncoming ? params.value : existing.value;
    const mergedAt =
      preferIncoming || mergedFromSet.size !== existing.mergedFrom.length
        ? new Date().toISOString()
        : existing.mergedAt;
    const now = Date.now();

    const updatedFact: Fact = {
      key,
      value: nextValue,
      confidence: updatedConfidence,
      lastSeenSeq: params.sourceSeq,
      sources: Array.from(sourcesSet),
      mergedFrom: Array.from(mergedFromSet),
      mergedAt,
      missStreak: 0,
      createdAt: existing.createdAt,
      lastTouchedAt: now,
      dormantAt: null,
      prunedAt: null,
    };

    this.facts.set(key, updatedFact);
    this.dormantFacts.delete(key);
    this.prunedFacts.delete(key);
    return updatedFact;
  }
}

const clampConfidence = (value: number): number => {
  if (Number.isNaN(value)) {
    return 0.1;
  }
  return Math.min(1, Math.max(0.1, value));
};

