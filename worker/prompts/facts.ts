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
- Identify durable facts (agenda, decisions, deadlines, metrics, speakers)
- Update confidence scores based on new evidence
- Mark outdated facts as "stale": true
- Do NOT include speculative or unverified statements
- Return JSON array of facts`;
}


