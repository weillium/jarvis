import type { ResearchChunkMetadata } from '../glossary/types';
import type { OpenAIUsage } from '../../../lib/pricing';

export type ChunkMetadata = ResearchChunkMetadata;

export interface ChunkCandidate {
  text: string;
  promptText: string;
  hash: string;
  source: string;
  researchSource: string;
  qualityScore?: number;
  metadata?: ChunkMetadata;
  agentUtility?: Array<'facts' | 'cards' | 'glossary'>;
  queryPriority?: number;
  provenanceHint?: string;
  topics?: string[];
  originalLength?: number;
  promptLength?: number;
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

