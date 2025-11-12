export interface FactsPromptContext {
  transcriptWindow: string;
  existingFactsJson: string;
  glossaryContext?: string;
  rejectedFactsJson?: string;
}

export function createFactsGenerationUserPrompt(context: FactsPromptContext): string {
  const { transcriptWindow, existingFactsJson, glossaryContext } = context;

  return `You are an event intelligence assistant extracting stable facts.

Recent Transcript Window:
${transcriptWindow}

Existing Facts (with confidence):
${existingFactsJson}

Rejected Facts:
${rejectedFactsJson && rejectedFactsJson.trim().length > 0 ? rejectedFactsJson : 'None'}

Glossary Context:
${glossaryContext && glossaryContext.trim().length > 0 ? glossaryContext : 'None'}

Instructions:
- Each fact must be a single declarative sentence with a clear subject and verb describing a unique claim, observation, decision, or metric.
- Do not produce questions, prompts, or procedural notes unless you can rewrite them into neutral declarative statements.
- Treat high-confidence existing facts as canonical. Only change them when the transcript clearly updates or contradicts them.
- Compare against Existing Facts. If the meaning already exists, reuse its key, set "status": "update", and supply the revised declarative value.
- Use "status": "create" only for genuinely new facts; do not rephrase the same idea with different words.
- Resolve each entry in Rejected Facts by either producing a corrected update or explicitly omitting it when no reliable fact is present. Never repeat the rejected wording.
- Prefer descriptive snake_case keys (e.g., "launch_date", "budget_owner") and reuse existing keys when updating entries.
- Set realistic confidence scores based on the evidence in the transcript window.
- Return a JSON array of facts; each item must include at minimum {"key","value","confidence","status"} plus any helpful metadata.`;
}


