import type OpenAI from 'openai';
import type { ChunkCandidate, ChunkWithRank, ChunksCostBreakdown } from './types';

export const rankChunks = (chunks: ChunkCandidate[]): ChunkWithRank[] => {
  const sourcePriority: Record<string, number> = {
    exa: 1.0,
    wikipedia: 0.9,
    llm_generation: 0.7,
    research: 0.8,
  };

  const scoredChunks = chunks.map((chunk) => {
    const sourceScore = sourcePriority[chunk.researchSource] ?? 0.5;
    const qualityScore = chunk.qualityScore ?? 0.7;
    const agentUtilityScore =
      Array.isArray(chunk.agentUtility) && chunk.agentUtility.length > 0
        ? chunk.agentUtility.includes('facts') && chunk.agentUtility.includes('cards')
          ? 0.15
          : 0.1
        : 0;
    const priorityScore =
      typeof chunk.queryPriority === 'number'
        ? Math.max(0, (5 - Math.min(chunk.queryPriority, 5))) * 0.05
        : 0;
    return {
      chunk,
      score: sourceScore * 0.5 + qualityScore * 0.35 + agentUtilityScore + priorityScore,
    };
  });

  scoredChunks.sort((a, b) => b.score - a.score);

  return scoredChunks.map(({ chunk }, index) => ({
    ...chunk,
    rank: index + 1,
  }));
};

