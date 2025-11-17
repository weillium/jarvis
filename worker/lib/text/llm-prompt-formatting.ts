export const formatResearchSummaryForPrompt = (
  chunks: Array<{ text: string }>,
  maxLength = 3000
): string => {
  const summary = chunks.map((chunk) => chunk.text).join('\n\n');
  return summary.substring(0, maxLength);
};

export const formatBlueprintDetailsForPrompt = (params: {
  neededLLMChunks: number;
  qualityTier: string;
  inferredTopics: string[];
}): string => {
  const { neededLLMChunks, qualityTier, inferredTopics } = params;
  return [
    `Target chunks: ${neededLLMChunks}`,
    `Quality tier: ${qualityTier}`,
    `Inferred topics: ${inferredTopics.join(', ')}`,
  ].join('\n');
};

export const formatGlossaryHighlightsForPrompt = (
  keyTerms: string[],
  maxTerms = 10
): string => keyTerms.slice(0, maxTerms).join(', ');
