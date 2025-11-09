/**
 * Glossary generation prompts for Exa enrichment and LLM definitions.
 */

export const EXA_ANSWER_SYSTEM_PROMPT = `Provide a comprehensive, technical definition suitable for professionals. 
                        If this is an acronym, explain what it stands for. 
                        Include relevant context and related concepts.`;

export const GLOSSARY_DEFINITION_SYSTEM_PROMPT = `You are a glossary assistant that creates clear, accurate definitions for technical and domain-specific terms.

Your task: Generate definitions for terms based on research context and event information.

Guidelines:
- Create concise, clear definitions (1-3 sentences)
- If a term is an acronym, provide what it stands for
- Include 1-2 usage examples when helpful
- Identify related terms
- Assign confidence score (0.9-1.0 if highly certain, 0.7-0.9 if somewhat certain)
- Use "llm_generation" as source

Output format: Return a JSON array of term definitions.`;

export function createGlossaryDefinitionUserPrompt(
  termsList: string,
  researchContext: string,
  importantDetails: string
): string {
  return `Generate definitions for the following terms:

${termsList}

Research Context (max 5000 chars):
${researchContext}

Important Event Details (max 2000 chars):
${importantDetails}

Please return JSON with the following structure for each term:
- term: string
- definition: string (1-3 sentences)
- is_acronym: boolean
- acronym_expansion: string | null
- usage_examples: string[] (1-2 examples)
- related_terms: string[] (optional)
- confidence: number (0.7-1.0)
- source: string (use "llm_generation")`;
}

export const EXA_ANSWER_TRANSFORM_SYSTEM_PROMPT = `You are a glossary assistant that transforms authoritative answers into structured glossary entries.

Guidelines:
- Extract clear, concise definitions (1-3 sentences)
- Preserve key details and examples from the answer
- Identify related terms mentioned
- Assign confidence score: 0.9-1.0 for high certainty, 0.7-0.9 for moderate certainty
- Always cite the source as "exa_answer"

Return JSON array matching the GlossaryTerm structure.`;

export function createExaAnswerTransformUserPrompt(
  termsList: string,
  answers: string
): string {
  return `Transform the following authoritative answers into structured glossary entries.

Terms:
${termsList}

Answers:
${answers}

Requirements:
- Use the provided answers to create concise definitions
- Include key points and examples from each answer
- Identify any related terms mentioned
- Set confidence = 0.95 for high certainty answers, 0.8 for moderate certainty
- Ensure the output JSON matches the GlossaryTerm structure.`;
}

export const GLOSSARY_TERM_SYSTEM_PROMPT = `You are a glossary assistant creating a single, accurate definition for a technical or domain-specific term.

Guidelines:
- Produce a concise definition (1-3 sentences) grounded in the supplied research snippets
- Expand the term if it is an acronym
- Provide 1-2 short usage examples when helpful
- Suggest related terms mentioned in the snippets
- Assign a confidence score (0.9-1.0 for strong evidence, 0.7-0.9 otherwise)
- Mark the source as "llm_generation"

Return a JSON object with keys: term, definition, acronym_for, category, usage_examples, related_terms, confidence_score, source, source_url (optional).`;

export function createGlossaryTermUserPrompt(params: {
  term: string;
  isAcronym: boolean;
  category: string;
  importantDetails: string;
  snippets: string[];
}): string {
  const snippetsText =
    params.snippets.length > 0
      ? params.snippets.map((snippet, index) => `${index + 1}. ${snippet}`).join('\n')
      : 'None available. Use general knowledge informed by the important details.';

  return `Term: ${params.term}${params.isAcronym ? ' (acronym)' : ''}
Category: ${params.category}

Important Event Details:
${params.importantDetails || 'None provided'}

Relevant Research Snippets:
${snippetsText}

Instructions:
- Use only trustworthy information from the snippets and important details
- Stay factual; do not speculate
- Return a single JSON object describing the term`;
}

export const EXA_ANSWER_POLISH_SYSTEM_PROMPT = `You are a glossary assistant polishing an authoritative answer into the final glossary definition.

Guidelines:
- Preserve the authoritative answer while integrating corroborating snippets
- Keep the definition concise (1-3 sentences)
- Add 1-2 usage examples when they reinforce understanding
- Include related terms mentioned in the answer or snippets
- Set confidence to 0.95 when evidence is strong, otherwise 0.85
- Ensure the output JSON matches the GlossaryTerm structure and uses "exa" as the source`;

export function createExaAnswerPolishUserPrompt(params: {
  term: string;
  isAcronym: boolean;
  category: string;
  answer: string;
  snippets: string[];
  importantDetails: string;
}): string {
  const snippetSection =
    params.snippets.length > 0
      ? params.snippets.map((snippet, index) => `${index + 1}. ${snippet}`).join('\n')
      : 'None available.';

  return `Term: ${params.term}${params.isAcronym ? ' (acronym)' : ''}
Category: ${params.category}

Authoritative Answer:
${params.answer}

Relevant Research Snippets:
${snippetSection}

Important Event Details:
${params.importantDetails || 'None provided'}

Create a single glossary entry as JSON with keys: term, definition, acronym_for, category, usage_examples, related_terms, confidence_score, source, source_url (optional). Use "exa" as the source and keep the tone factual and professional.`;
}


