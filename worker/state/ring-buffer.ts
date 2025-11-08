/**
 * Ring Buffer for in-memory transcript storage
 * Maintains a rolling window of the last N minutes of finalized transcripts
 * Enforces token budget limits to prevent prompt bloat
 */

import { countTokens, countTokensArray } from '../utils/token-counter';

export interface TranscriptChunk {
  seq: number;
  at_ms: number;
  speaker?: string;
  text: string;
  final: boolean;
  transcript_id?: number;
}

export class RingBuffer {
  private buffer: TranscriptChunk[] = [];
  private maxSize: number;
  private maxAgeMs: number; // Maximum age in milliseconds (e.g., 5 minutes = 300000ms)

  constructor(maxSize: number = 1000, maxAgeMs: number = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.maxAgeMs = maxAgeMs;
  }

  /**
   * Add a transcript chunk to the buffer
   * Automatically evicts old entries based on size and age
   */
  add(chunk: TranscriptChunk): void {
    const now = Date.now();

    // Remove expired entries (older than maxAgeMs)
    this.buffer = this.buffer.filter(
      (item) => now - item.at_ms < this.maxAgeMs
    );

    // Remove existing entries with the same sequence number
    this.buffer = this.buffer.filter((item) => item.seq !== chunk.seq);

    // Add new chunk
    this.buffer.push(chunk);

    // If still over size limit, remove oldest entries
    if (this.buffer.length > this.maxSize) {
      this.buffer = this.buffer.slice(-this.maxSize);
    }

    // Sort by sequence number to maintain order
    this.buffer.sort((a, b) => a.seq - b.seq);
  }

  /**
   * Get the last N finalized transcripts
   */
  getLastN(n: number): TranscriptChunk[] {
    const finalized = this.buffer.filter((chunk) => chunk.final);
    return finalized.slice(-n);
  }

  /**
   * Get all finalized transcripts in the buffer
   */
  getAllFinalized(): TranscriptChunk[] {
    return this.buffer.filter((chunk) => chunk.final);
  }

  /**
   * Get transcripts since a specific sequence number
   */
  getSinceSeq(seq: number): TranscriptChunk[] {
    return this.buffer.filter((chunk) => chunk.seq > seq && chunk.final);
  }

  /**
   * Get a condensed summary of recent transcripts for context
   * Returns last N chunks as bullet points, capped at 2048 tokens
   * 
   * @param n - Maximum number of chunks to include
   * @param maxTokens - Maximum token budget (default 2048)
   * @returns Array of bullet point strings that fit within token budget
   */
  getContextBullets(n: number = 10, maxTokens: number = 2048): string[] {
    const recent = this.getLastN(n);
    const bullets: string[] = [];
    let totalTokens = 0;

    // Add bullets one by one until we hit token budget
    for (const chunk of recent) {
      const speaker = chunk.speaker ? `[${chunk.speaker}] ` : '';
      const bullet = `- ${speaker}${chunk.text}`;
      const bulletTokens = countTokens(bullet);

      // Check if adding this bullet would exceed budget
      if (totalTokens + bulletTokens > maxTokens) {
        break;
      }

      bullets.push(bullet);
      totalTokens += bulletTokens;
    }

    return bullets;
  }

  /**
   * Get token count for context bullets without creating them
   * Useful for logging and monitoring
   */
  getContextBulletsTokenCount(n: number = 10, maxTokens: number = 2048): number {
    const bullets = this.getContextBullets(n, maxTokens);
    return countTokensArray(bullets);
  }

  /**
   * Get the full text of recent transcripts (for Facts Agent)
   * Capped at 2048 tokens to prevent prompt bloat
   * 
   * @param n - Maximum number of chunks to include
   * @param maxTokens - Maximum token budget (default 2048)
   * @returns Text string that fits within token budget
   */
  getRecentText(n: number = 20, maxTokens: number = 2048): string {
    const recent = this.getLastN(n);
    const texts: string[] = [];
    let totalTokens = 0;

    // Add chunks one by one until we hit token budget
    for (const chunk of recent) {
      const chunkText = chunk.text;
      const chunkTokens = countTokens(chunkText);
      const separatorTokens = texts.length > 0 ? 1 : 0; // Space separator

      // Check if adding this chunk would exceed budget
      if (totalTokens + chunkTokens + separatorTokens > maxTokens) {
        break;
      }

      texts.push(chunkText);
      totalTokens += chunkTokens + separatorTokens;
    }

    return texts.join(' ');
  }

  /**
   * Get token count for recent text without creating it
   * Useful for logging and monitoring
   */
  getRecentTextTokenCount(n: number = 20, maxTokens: number = 2048): number {
    const text = this.getRecentText(n, maxTokens);
    return countTokens(text);
  }

  /**
   * Get current buffer stats
   */
  getStats() {
    return {
      total: this.buffer.length,
      finalized: this.buffer.filter((chunk) => chunk.final).length,
      oldest: this.buffer[0]?.at_ms || null,
      newest: this.buffer[this.buffer.length - 1]?.at_ms || null,
    };
  }

  /**
   * Clear the buffer
   */
  clear(): void {
    this.buffer = [];
  }
}
