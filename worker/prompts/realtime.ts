/**
 * Real-time card and facts prompts used by streaming processors.
 */

export function createCardGenerationUserPrompt(
  runtimeContext: string,
  currentTranscript: string,
  recentCards: string,
  glossaryContext: string,
  conceptFocus?: string
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

${conceptFocus ? `Concept Focus:\n${conceptFocus}\n\n` : ''}
Instructions:
- Create 1-2 new cards only when they give the audience practical scaffolding to understand the discussion.
- Pick the best fitting kind for each card: Definition, Framework, Timeline, Metric, Map, Comparison, Stakeholder, Process, Risk, or Opportunity.
- Each card needs a short title (<= 8 words) and up to 3 tight bullets/sentences with concrete detail.
- Highlight what changed, why it matters, or how to interpret it. Avoid repeating recent cards unless adding new insight.
- Prefer present tense and direct language. Quote metrics, dates, and named entities precisely.
- Return a single JSON object shaped exactly as:
  {
    "cards": [
      {
        "kind": "Definition | Framework | Timeline | Metric | Map | Comparison | Stakeholder | Process | Risk | Opportunity",
        "card_type": "text | text_visual | visual",
        "title": "concise title",
        "body": "bullet or sentence summary (omit/null for visual)",
        "label": "short visual label or null",
        "image_url": "https://..." or null,
        "source_seq": <number>
      }
    ]
  }
- Do NOT emit multiple root JSON fragments or extra fields.`;
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

