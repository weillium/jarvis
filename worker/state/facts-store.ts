/**
 * In-memory Facts Store
 * Maintains a compact key-value store of stable facts extracted during events
 * Enforces maximum capacity with LRU eviction (lowest confidence first, then oldest)
 */

export interface Fact {
  key: string;
  value: any; // JSON-serializable value
  confidence: number; // 0-1
  lastSeenSeq: number;
  sources: number[]; // Transcript IDs that contributed
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
      const [aKey, aFact] = a;
      const [bKey, bFact] = b;
      
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
  upsert(key: string, value: any, confidence: number, sourceSeq: number, sourceId?: number): string[] {
    const existing = this.facts.get(key);

    if (existing) {
      // Update existing fact
      // Increase confidence if new value matches, decrease if different
      const valueMatches = JSON.stringify(existing.value) === JSON.stringify(value);
      const newConfidence = valueMatches
        ? Math.min(1.0, existing.confidence + 0.1) // Boost confidence
        : Math.max(0.1, existing.confidence - 0.2); // Lower confidence on mismatch

      this.facts.set(key, {
        key,
        value,
        confidence: newConfidence,
        lastSeenSeq: sourceSeq,
        sources: sourceId
          ? [...existing.sources, sourceId].slice(-10) // Keep last 10 sources
          : existing.sources,
      });
      return [];
    } else {
      // Insert new fact
      this.facts.set(key, {
        key,
        value,
        confidence,
        lastSeenSeq: sourceSeq,
        sources: sourceId ? [sourceId] : [],
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
  loadFacts(facts: Array<{ key: string; value: any; confidence: number; lastSeenSeq: number; sources: number[] }>): string[] {
    const evictedKeys: string[] = [];
    
    for (const fact of facts) {
      this.facts.set(fact.key, {
        key: fact.key,
        value: fact.value,
        confidence: fact.confidence,
        lastSeenSeq: fact.lastSeenSeq,
        sources: fact.sources || [],
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
  getContextFormat(): Record<string, any> {
    const highConf = this.getHighConfidence(0.5);
    const result: Record<string, any> = {};
    for (const fact of highConf) {
      result[fact.key] = fact.value;
    }
    return result;
  }

  /**
   * Get facts as bullet points for prompt inclusion
   */
  getBullets(): string[] {
    const highConf = this.getHighConfidence(0.5);
    return highConf.map((fact) => {
      const valueStr = typeof fact.value === 'string' 
        ? fact.value 
        : JSON.stringify(fact.value);
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
}

