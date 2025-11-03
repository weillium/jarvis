/**
 * Ring Buffer for in-memory transcript storage
 * Maintains a rolling window of the last N minutes of finalized transcripts
 */

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
   * Returns last N chunks as bullet points
   */
  getContextBullets(n: number = 10): string[] {
    const recent = this.getLastN(n);
    return recent.map((chunk) => {
      const speaker = chunk.speaker ? `[${chunk.speaker}] ` : '';
      return `- ${speaker}${chunk.text}`;
    });
  }

  /**
   * Get the full text of recent transcripts (for Facts Agent)
   */
  getRecentText(n: number = 20): string {
    const recent = this.getLastN(n);
    return recent.map((chunk) => chunk.text).join(' ');
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

