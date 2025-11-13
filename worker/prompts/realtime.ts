/**
 * Real-time card and facts prompts used by streaming processors.
 */

import type { TemplatePlan } from '../sessions/agent-profiles/cards/templates/types';

export interface CardGenerationPromptInputs {
  transcriptSegment: string;
  transcriptSummary: string;
  factsSnapshot: string;
  glossaryContext: string;
  supportingFacts?: string;
  supportingGlossary?: string;
  transcriptBullets?: string;
  retrievedContext?: string;
  recentCards: string;
  audienceProfile?: string;
  templatePlan?: TemplatePlan;
  conceptFocus?: string;
}

const formatTemplatePlan = (plan?: TemplatePlan): string => {
  if (!plan) {
    return 'No template was selected. Emit a card only if you are certain it fits a Definition or Summary pattern.';
  }

  const slotLines = plan.slotSpecs
    .map((slot) => {
      const requirement = slot.required ? 'REQUIRED' : 'optional';
      const strategy = slot.strategy.toUpperCase();
      const max = slot.maxLength ? `${slot.maxLength} chars` : 'free length';
      const markdown = slot.allowMarkdown ? 'markdown allowed' : 'plain text';
      return `- ${slot.id} (${requirement}; ${strategy}; ${max}; ${markdown}): ${slot.description}`;
    })
    .join('\n');

  return `Template Selected: ${plan.metadata.label} (${plan.templateId})
Why it was chosen: ${plan.metadata.eligibilityReason ?? 'not provided'}
Slots:
${slotLines}`;
};

export function createCardGenerationUserPrompt({
  transcriptSegment,
  transcriptSummary,
  factsSnapshot,
  glossaryContext,
  supportingFacts,
  supportingGlossary,
  transcriptBullets,
  retrievedContext,
  recentCards,
  audienceProfile,
  templatePlan,
  conceptFocus,
}: CardGenerationPromptInputs): string {
  const templateSection = formatTemplatePlan(templatePlan);
  const audienceSection =
    audienceProfile && audienceProfile.trim().length > 0
      ? audienceProfile.trim()
      : 'No audience profile available. Default to pragmatic, event-aligned insight and skip conjecture.';

  const supportingFactsSection =
    supportingFacts && supportingFacts.trim().length > 0
      ? supportingFacts.trim()
      : 'None provided.';

  const supportingGlossarySection =
    supportingGlossary && supportingGlossary.trim().length > 0
      ? supportingGlossary.trim()
      : 'None provided.';

  const transcriptBulletsSection =
    transcriptBullets && transcriptBullets.trim().length > 0
      ? transcriptBullets.trim()
      : 'No additional transcript bullets.';

  const retrievedContextSection =
    retrievedContext && retrievedContext.trim().length > 0
      ? `${retrievedContext.trim()}\n\nTreat each chunk as optional evidence. Validate relevance before citing it.`
      : 'No retrieved context chunks for this trigger.';

  return `You are an event assistant generating concise, high-signal recap cards.

TEMPLATE PLAN
${templateSection}

AUDIENCE PROFILE
${audienceSection}

TRANSCRIPT SEGMENT
${transcriptSegment}

TRANSCRIPT SUMMARY
${transcriptSummary}

FACTS SNAPSHOT
${factsSnapshot}

SUPPORTING FACTS
${supportingFactsSection}

GLOSSARY CONTEXT
${supportingGlossarySection}

TRANSCRIPT BULLETS
${transcriptBulletsSection}

RETRIEVED CONTEXT CHUNKS
${retrievedContextSection}

RECENT CARDS
${recentCards}

${conceptFocus ? `CONCEPT FOCUS\n${conceptFocus}\n\n` : ''}INSTRUCTIONS
- Emit a card ONLY if it delivers genuinely new, audience-relevant insight that clarifies the live discussion.
- Reject duplicated or stale angles. Build on recent cards only when you add fresh interpretation or consequences.
- Map your content to the template slots: express each required slot explicitly in the card body as separate bullet points (e.g., "• Definition: ...", "• Why now: ...").
- Validate retrieved chunks before using them; ignore low-similarity or off-topic excerpts.
- Quote metrics, dates, and named entities precisely. Keep titles ≤ 8 words and body ≤ 3 tight bullets/sentences.
- Respect card_type semantics:
  * text: body required, label/image_url null.
  * text_visual: body + image_url required, label null.
  * visual: label + image_url required, body null.
- If no useful card exists, respond with { "cards": [] } and do nothing else.

OUTPUT FORMAT (STRICT)
{
  "cards": [
    {
      "kind": "Definition | Summary | Framework | Timeline | Metric | Map | Comparison | Stakeholder | Process | Risk | Opportunity",
      "card_type": "text | text_visual | visual",
      "title": "concise title",
      "body": "slot-aligned bullets or null",
      "label": "visual label or null",
      "image_url": "https://..." or null,
      "source_seq": <number>
    }
  ]
}
- Respond with exactly one JSON object. No leading text, commentary, or extra fields.`;
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

