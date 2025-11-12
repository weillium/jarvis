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
  mergedFrom?: string[];
  mergedAt?: number | null;
}

export class FactsStore {
  private facts: Map<string, Fact> = new Map();
  private maxItems: number;
  private evictionCount: number = 0;

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
      });
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
      });

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
      mergedAt?: number | null;
    }>
  ): string[] {
    const evictedKeys: string[] = [];
    
    for (const fact of facts) {
      this.facts.set(fact.key, {
        key: fact.key,
        value: fact.value,
        confidence: fact.confidence,
        lastSeenSeq: fact.lastSeenSeq,
        sources: fact.sources || [],
        mergedFrom: fact.mergedFrom ?? [],
        mergedAt: fact.mergedAt ?? null,
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
   * Get all facts above a confidence threshold
   */
  getHighConfidence(threshold: number = 0.5): Fact[] {
    return Array.from(this.facts.values()).filter((f) => f.confidence >= threshold);
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
    return this.facts.delete(key);
  }

  /**
   * Clear all facts
   */
  clear(): void {
    this.facts.clear();
  }

  /**
   * Get all facts
   */
  getAll(): Fact[] {
    return Array.from(this.facts.values());
  }

  /**
   * Get current stats
   */
  getStats() {
    const all = Array.from(this.facts.values());
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

  applyConfidenceAdjustments(adjustments: Array<{ key: string; newConfidence: number }>): void {
    if (!adjustments.length) {
      return;
    }

    for (const adjustment of adjustments) {
      const existing = this.facts.get(adjustment.key);
      if (!existing) {
        continue;
      }
      const confidence = clampConfidence(adjustment.newConfidence);
      if (Math.abs(confidence - existing.confidence) < 0.001) {
        continue;
      }
      this.facts.set(adjustment.key, {
        ...existing,
        confidence,
      });
    }
  }
}

const clampConfidence = (value: number): number => {
  if (Number.isNaN(value)) {
    return 0.1;
  }
  return Math.min(1, Math.max(0.1, value));
};

