import type { TemplatePlan } from '../sessions/agent-profiles/cards/templates/types';

export interface CardGenerationPromptInputs {
  transcriptSegment: string;
  transcriptSummary?: string;
  factsSnapshot: string;
  glossaryContext?: string;
  supportingFacts?: string;
  supportingGlossary?: string;
  transcriptBullets?: string;
  retrievedContext?: string;
  conceptWindow?: string;
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

  const templateLabel = plan.metadata.label ?? plan.templateId;

  return `Template Selected: ${templateLabel} (${plan.templateId})
Why it was chosen: ${plan.metadata.eligibilityReason ?? 'not provided'}
Emit these metadata fields exactly in every card output:
- template_id: ${plan.templateId}
- template_label: ${templateLabel}
Slots:
${slotLines}`;
};

export function createCardGenerationUserPrompt({
  transcriptSegment,
  transcriptSummary,
  factsSnapshot,
  supportingFacts,
  supportingGlossary,
  transcriptBullets,
  retrievedContext,
  conceptWindow,
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

${transcriptSummary && transcriptSummary.trim().length > 0 ? `TRANSCRIPT SUMMARY\n${transcriptSummary}\n` : ''}

FACTS SNAPSHOT
${factsSnapshot}

SUPPORTING FACTS
${supportingFactsSection}

FOCUSED GLOSSARY
${supportingGlossarySection}

TRANSCRIPT BULLETS
${transcriptBulletsSection}

RETRIEVED CONTEXT CHUNKS
${retrievedContextSection}

CONCEPT WINDOW
${conceptWindow && conceptWindow.trim().length > 0 ? conceptWindow : 'No high-salience concepts detected'}

RECENT CARDS
${recentCards}

${conceptFocus ? `CONCEPT FOCUS\n${conceptFocus}\n\n` : ''}INSTRUCTIONS
- Emit a card ONLY if it delivers genuinely new, audience-relevant insight that clarifies the live discussion.
- Reject duplicated or stale angles. Build on recent cards only when you add fresh interpretation or consequences.
- Map your content to the template slots: express each required slot explicitly in the card body as separate bullet points (e.g., "• Definition: ...", "• Why now: ...").
- Validate retrieved chunks before using them; ignore low-similarity or off-topic excerpts.
- Quote metrics, dates, and named entities precisely. Keep titles ≤ 8 words and body ≤ 3 tight bullets/sentences.
- Respect card_type semantics:
  * text: body required. label, image_url, visual_request must be null.
  * text_visual: body required and visual_request required; label null; image_url must remain null until the worker resolves the request.
  * visual: label required and visual_request required; body must be null; image_url must remain null until the worker resolves the request.
- Populate visual_request whenever a helpful visual exists:
  * Use {"strategy":"fetch","instructions":"...","source_url":"https://..."} for real-world photos or existing assets to retrieve.
  * Use {"strategy":"generate","instructions":"...","source_url":null} for conceptual diagrams or illustrations that must be generated later.
  * Provide concrete instructions (audience, style, framing). Omit visual_request when no visual is needed.
- If no useful card exists, respond with { "cards": [] } and do nothing else.

OUTPUT FORMAT (STRICT)
{
  "cards": [
    {
      "card_type": "text | text_visual | visual",
      "title": "concise title",
      "body": "slot-aligned bullets or null",
      "label": "visual label or null",
      "template_id": "definition.v1 | summary.v1 | ...",
      "template_label": "Definition Card | Summary Card | ...",
      "visual_request": {
        "strategy": "fetch | generate" or null,
        "instructions": "visual description or null",
        "source_url": "https://..." or null
      },
      "image_url": null,
      "source_seq": <number>
    }
  ]
}
- Respond with exactly one JSON object. No leading text, commentary, or extra fields.`;
}

