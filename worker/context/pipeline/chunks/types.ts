import type { ResearchChunkMetadata } from '../glossary/types';
import type { OpenAIUsage } from '../pricing-config';

export type ChunkMetadata = ResearchChunkMetadata;

export interface ChunkCandidate {
  text: string;
  source: string;
  researchSource: string;
  qualityScore?: number;
  metadata?: ChunkMetadata;
}

export interface ChunkWithRank extends ChunkCandidate {
  rank: number;
}

export interface ChunksCostBreakdown {
  openai: {
    total: number;
    chat_completions: Array<{ cost: number; usage: OpenAIUsage; model: string }>;
    embeddings: Array<{ cost: number; usage: OpenAIUsage; model: string }>;
  };
}

export interface ChunksBuildResult {
  chunkCount: number;
  costBreakdown: ChunksCostBreakdown;
}

