/**
 * In-memory Facts Store
 * Maintains a compact key-value store of stable facts extracted during events
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

  /**
   * Upsert a fact (update if exists, insert if not)
   */
  upsert(key: string, value: any, confidence: number, sourceSeq: number, sourceId?: number): void {
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
    } else {
      // Insert new fact
      this.facts.set(key, {
        key,
        value,
        confidence,
        lastSeenSeq: sourceSeq,
        sources: sourceId ? [sourceId] : [],
      });
    }
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
      highConfidence: all.filter((f) => f.confidence >= 0.5).length,
      mediumConfidence: all.filter((f) => f.confidence >= 0.3 && f.confidence < 0.5).length,
      lowConfidence: all.filter((f) => f.confidence < 0.3).length,
    };
  }
}

