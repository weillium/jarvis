import type { TemplatePlan } from "../sessions/agent-profiles/cards/templates/types";

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
    return "No template was selected. Emit a card only if you are certain it fits a Definition or Summary pattern.";
  }

  const slotLines = plan.slotSpecs
    .map((slot) => {
      const requirement = slot.required ? "REQUIRED" : "optional";
      const strategy = slot.strategy.toUpperCase();
      const max = slot.maxLength ? `${slot.maxLength} chars` : "free length";
      const markdown = slot.allowMarkdown ? "markdown allowed" : "plain text";
      const bodyNote = slot.id === "definition" || slot.id === "bullets"
        ? " → write as natural prose in body"
        : slot.id === "why_now" || slot.id === "visual_prompt"
        ? " → separate from body (internal/metadata only)"
        : "";
      return `- ${slot.id} (${requirement}; ${strategy}; ${max}; ${markdown})${bodyNote}: ${slot.description}`;
    })
    .join("\n");

  const templateLabel = plan.metadata.label ?? plan.templateId;

  return `Template Selected: ${templateLabel} (${plan.templateId})
Why it was chosen: ${plan.metadata.eligibilityReason ?? "not provided"}
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
  const audienceSection = audienceProfile && audienceProfile.trim().length > 0
    ? audienceProfile.trim()
    : "No audience profile available. Default to pragmatic, event-aligned insight and skip conjecture.";

  const supportingFactsSection =
    supportingFacts && supportingFacts.trim().length > 0
      ? supportingFacts.trim()
      : "None provided.";

  const supportingGlossarySection =
    supportingGlossary && supportingGlossary.trim().length > 0
      ? supportingGlossary.trim()
      : "None provided.";

  const transcriptBulletsSection =
    transcriptBullets && transcriptBullets.trim().length > 0
      ? transcriptBullets.trim()
      : "No additional transcript bullets.";

  const retrievedContextSection =
    retrievedContext && retrievedContext.trim().length > 0
      ? `${retrievedContext.trim()}\n\nTreat each chunk as optional evidence. Validate relevance before citing it.`
      : "No retrieved context chunks for this trigger.";

  return `You are an event assistant generating concise, high-signal recap cards.

TEMPLATE PLAN
${templateSection}

AUDIENCE PROFILE
${audienceSection}

TRANSCRIPT SEGMENT
${transcriptSegment}

${
    transcriptSummary && transcriptSummary.trim().length > 0
      ? `TRANSCRIPT SUMMARY\n${transcriptSummary}\n`
      : ""
  }

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
${
    conceptWindow && conceptWindow.trim().length > 0
      ? conceptWindow
      : "No high-salience concepts detected"
  }

RECENT CARDS
${recentCards}

INSTRUCTIONS
- Emit a card ONLY if it delivers genuinely new, audience-relevant insight that clarifies the live discussion.
- STRICTLY DEDUPLICATE: Do not emit a card if a similar topic was covered in the last 5 cards.
- Write the body as natural, conversational prose—not labeled bullets or structured sections. Use template slots as content guidelines, not formatting requirements.
- For definition cards: explain the concept naturally (EL5), incorporating the definition seamlessly. Do NOT ask the audience to do further research.
- For summary cards: address the audience directly ("You will see...", "This means..."). Do NOT use "moderator-speak".
- Keep the body focused on the main readable content. Why-now context and visual prompts are handled separately (not in the body).
- Validate retrieved chunks before using them; ignore low-similarity or off-topic excerpts.
- Quote metrics, dates, and named entities precisely. Keep titles ≤ 8 words in Title Case and body as natural, flowing text.
- Respect card_type semantics:
  * text: body required (natural prose). label, image_url, visual_request must be null.
  * text_visual: body required (natural prose) and visual_request required; label null; image_url must remain null until the worker resolves the request.
  * visual: label required and visual_request required; body must be null; image_url must remain null until the worker resolves the request.
- PRIORITIZE VISUALS: Visuals anchor the audience. Lean towards "text_visual" or "visual" cards when possible.
- Populate visual_request whenever a helpful visual exists:
  * DEFAULT STRATEGY: Use {"strategy":"fetch",...} unless the visual is inherently abstract/conceptual with no real-world representation. Fetch is faster and cheaper.
  * Use {"strategy":"fetch","instructions":"simple noun-based search terms (e.g. 'Tokyo skyline', 'Albert Einstein')","source_url":null} for:
    - Photographic content (people, places, objects, buildings, landscapes, real-world scenes)
    - Real-world representations of concepts (e.g., "Federal Reserve building", "trading floor", "bank vault")
    - Historical events, figures, locations
    - Products, tools, technology
    - Nature, science
    - Most financial/economic concepts that have real-world visual representations
  * ONLY use {"strategy":"generate","instructions":"detailed description like 'flowchart showing process steps'","source_url":null} for:
    - Pure abstract diagrams (flowcharts, system architectures, process flows) that cannot be photographed
    - Mathematical visualizations (graphs, charts of abstract data) without real-world representation
    - Conceptual illustrations that have no real-world photographic equivalent
  * If a specific source_url is known, include it in fetch strategy; otherwise leave null and let the system search.
  * Provide concrete, descriptive instructions (audience, style, framing). Omit visual_request when no visual is needed.
- If no useful card exists, respond with { "cards": [] } and do nothing else.

OUTPUT FORMAT (STRICT)
{
  "cards": [
    {
      "card_type": "text | text_visual | visual",
      "title": "concise title",
      "body": "natural prose or null",
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
- Respond with exactly one JSON object. No leading text, commentary, or extra fields.
- The body field should contain natural, conversational prose—not labeled bullets or structured sections.`;
}
