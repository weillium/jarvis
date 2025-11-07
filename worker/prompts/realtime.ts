/**
 * Real-time card and facts prompts used by streaming processors.
 */

export function createCardGenerationUserPrompt(
  runtimeContext: string,
  currentTranscript: string,
  recentCards: string,
  glossaryContext: string
): string {
  return `You are an event assistant generating concise, insightful recap cards.

Context:
${runtimeContext}

Current Transcript Segment:
${currentTranscript}

Recent Cards:
${recentCards}

Glossary Context:
${glossaryContext}

Instructions:
- Create 1-2 new cards summarizing the key points
- Each card: title (<= 8 words) + body (2 sentences max)
- Highlight actionable insights, decisions, or notable moments
- Avoid repeating previous cards unless it adds new information
- Use present tense and concise language
- Return JSON array of cards`;
}

export const FACTS_EXTRACTION_SYSTEM_PROMPT = `You are a facts extractor. Track stable keys (agenda, decisions, deadlines, metrics). Return JSON array of facts.`;

export function createFactsExtractionUserPrompt(
  recentTranscript: string,
  existingFacts: string
): string {
  return `You are an event intelligence assistant extracting stable facts.

Recent Transcript Window:
${recentTranscript}

Existing Facts:
${existingFacts}

Instructions:
- Identify durable facts (agenda, decisions, deadlines, metrics, speakers)
- Update confidence scores based on new evidence
- Mark outdated facts as "stale": true
- Do NOT include speculative or unverified statements
- Return JSON array of facts`;
}

export function createRealtimeCardsUserPrompt(
  runtimeContext: string,
  activeAgents: string,
  nextChunkPreview: string
): string {
  return `You are orchestrating real-time card generation for a live event.

Runtime Context:
${runtimeContext}

Active Agents:
${activeAgents}

Next Transcript Preview:
${nextChunkPreview}

Provide 1-2 guidance bullets for the cards agent focusing on actionable insights, audience value, and clarity.`;
}

export function createRealtimeFactsUserPrompt(
  runtimeContext: string,
  activeAgents: string,
  nextChunkPreview: string
): string {
  return `You are orchestrating real-time facts tracking for a live event.

Runtime Context:
${runtimeContext}

Active Agents:
${activeAgents}

Next Transcript Preview:
${nextChunkPreview}

Provide 1-2 guidance bullets for the facts agent focusing on durable facts, missing fields, and confidence adjustments.`;
}

