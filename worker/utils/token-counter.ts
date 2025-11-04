/**
 * Token counting utility for context budget enforcement
 * Uses simple approximation: ~4 characters = 1 token
 * This is a conservative estimate based on OpenAI's tokenizer behavior
 */

/**
 * Count tokens in a text string
 * Approximation: ~4 characters per token (conservative estimate)
 * 
 * @param text - Text to count tokens for
 * @returns Estimated token count
 */
export function countTokens(text: string): number {
  if (!text || text.length === 0) {
    return 0;
  }

  // Conservative approximation: ~4 characters per token
  // This accounts for:
  // - Most words are 1-2 tokens
  // - Punctuation and whitespace
  // - Special characters
  // - Multi-byte characters count as more
  return Math.ceil(text.length / 4);
}

/**
 * Count tokens in an array of strings
 * 
 * @param texts - Array of text strings
 * @returns Total estimated token count
 */
export function countTokensArray(texts: string[]): number {
  return texts.reduce((total, text) => total + countTokens(text), 0);
}

/**
 * Truncate text to fit within token budget
 * 
 * @param text - Text to truncate
 * @param maxTokens - Maximum token budget
 * @returns Truncated text that fits within budget
 */
export function truncateToTokenBudget(text: string, maxTokens: number): string {
  const estimatedTokens = countTokens(text);
  
  if (estimatedTokens <= maxTokens) {
    return text;
  }

  // Calculate target character count (conservative)
  const targetChars = maxTokens * 4;
  
  // Truncate and add ellipsis
  return text.slice(0, targetChars - 3) + '...';
}

/**
 * Get token budget breakdown for logging
 * 
 * @param components - Object with component names and their text
 * @returns Breakdown object with token counts per component
 */
export function getTokenBreakdown(components: Record<string, string>): {
  total: number;
  breakdown: Record<string, number>;
} {
  const breakdown: Record<string, number> = {};
  let total = 0;

  for (const [name, text] of Object.entries(components)) {
    const tokens = countTokens(text);
    breakdown[name] = tokens;
    total += tokens;
  }

  return { total, breakdown };
}

/**
 * Check if token usage is approaching budget limit
 * 
 * @param used - Current token usage
 * @param budget - Token budget limit
 * @returns Object with warning status and percentage
 */
export function checkBudgetStatus(used: number, budget: number): {
  warning: boolean;
  critical: boolean;
  percentage: number;
  remaining: number;
} {
  const percentage = (used / budget) * 100;
  const remaining = budget - used;
  
  return {
    warning: percentage >= 80,
    critical: percentage >= 95,
    percentage: Math.round(percentage * 10) / 10,
    remaining,
  };
}

/**
 * Format token breakdown for logging
 * 
 * @param breakdown - Token breakdown object
 * @param maxLength - Maximum length for each component name
 * @returns Formatted string
 */
export function formatTokenBreakdown(
  breakdown: Record<string, number>,
  maxLength: number = 12
): string {
  const parts: string[] = [];
  
  for (const [name, tokens] of Object.entries(breakdown)) {
    const paddedName = name.padEnd(maxLength);
    parts.push(`${paddedName}: ${tokens}`);
  }
  
  return parts.join(', ');
}

