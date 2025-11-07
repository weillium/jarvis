/**
 * Context generation prompts for research, chunks, and topic preparation.
 */

export const CONTEXT_CHUNKS_GENERATION_SYSTEM_PROMPT = `You are a context generation assistant that creates informative context chunks about event topics.

Goal: Produce a diverse set of context chunks that cover key aspects of the topic, drawing from research results, documents, and general knowledge.

Guidelines:
- Create 300-500 word chunks with coherent, well-structured content
- Include specific details, examples, and explanations where possible
- Cite source metadata when provided
- Maintain professional tone suitable for business/technical audience
- Avoid redundancy: each chunk should focus on distinct aspects
- Use "llm_generation" as source if content is generated from research summary
- Ensure content is factual and accurate

Output format: Return JSON array of context chunks.`;

export function createContextChunksUserPrompt(
  researchSummary: string,
  blueprintDetails: string,
  glossaryHighlights: string
): string {
  return `Generate high-quality context chunks for the event topic using the information below:

Research Summary:
${researchSummary}

Blueprint Details:
${blueprintDetails}

Glossary Highlights:
${glossaryHighlights}

Requirements:
- Produce 500-1000 chunks depending on blueprint target
- Each chunk: 200-400 words, well-structured
- Include specific facts, statistics, and examples when available
- Reference source information in metadata when available
- Ensure diversity across chunks (cover different subtopics)
- Include relevance scores and suggested metadata`;
}

export const STUB_RESEARCH_SYSTEM_PROMPT = `You are a research assistant. Generate 2-3 informative context chunks (200-300 words each) based on a research query.`;

export function createStubResearchUserPrompt(query: string): string {
  return `Query: ${query}

Instructions:
- Generate 2-3 chunks that provide rich context about this query
- Include key facts, historical context, and practical implications
- Use markdown headings for structure
- Include relevant bullet points or numbered lists when appropriate`;
}

export const TOPIC_CONTEXT_SYSTEM_PROMPT = `You are a knowledge assistant that generates comprehensive, factual context about topics for real-time event processing.

Instructions:
- Provide 8-12 concise knowledge chunks covering key aspects of the topic
- Each chunk should be 2-3 sentences with important facts, definitions, or context
- Include relevant statistics, dates, or examples when available
- Focus on information that helps summarize or explain the topic to a general audience
- Avoid speculation. Stick to factual, verifiable information.
- Organize content in a logical order

Return JSON object: { "chunks": string[] }`;

export function createTopicContextUserPrompt(
  topic: string,
  eventTitle: string
): string {
  return `Topic: ${topic}
Event Title: ${eventTitle}

Generate factual, comprehensive knowledge chunks about this topic.
Include:
- Key concepts and principles
- Recent developments or trends
- Common use cases or applications
- Related subtopics or domains
- Notable people, organizations, or products associated with the topic`;
}


