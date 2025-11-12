export interface FactsPromptContext {
  transcriptWindow: string;
  existingFactsJson: string;
  glossaryContext?: string;
}

export function createFactsGenerationUserPrompt(context: FactsPromptContext): string {
  const { transcriptWindow, existingFactsJson, glossaryContext } = context;

  return `You are an event intelligence assistant extracting stable facts.

Recent Transcript Window:
${transcriptWindow}

Existing Facts:
${existingFactsJson}

Glossary Context:
${glossaryContext && glossaryContext.trim().length > 0 ? glossaryContext : 'None'}

Instructions:
- Each fact must be a single declarative sentence with a clear subject and verb describing a unique claim, observation, decision, or metric.
- Do not produce questions, prompts, or procedural notes. Skip topic labels like "Live debate" or "Start discussion" unless you can rewrite them into neutral declarative statements.
- Compare against Existing Facts. If the meaning already exists:
  - Reuse that fact's key and set "status": "update".
  - Provide the updated declarative value rather than duplicating the original wording.
- Only emit "status": "create" for genuinely new facts; do not rephrase the same idea with different words.
- Rewrite any reporting scaffolding ("the speaker said...", "he emphasized...") into a neutral declarative statement about the topic itself.
- Prefer descriptive snake_case keys (e.g., "launch_date", "budget_owner") and reuse existing keys when updating entries.
- Update confidence scores based on new evidence and omit speculative or unverified statements.
- Return JSON array of facts where each item includes at minimum {"key","value","confidence","status"} and optional metadata.`;
}


