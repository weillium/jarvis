/**
 * Shared Prompts for Context Generation
 * 
 * Centralized prompt definitions that can be used across multiple components
 * and visualized in the UI. This ensures consistency and makes it easy to
 * update prompts without searching through multiple files.
 */

// ============================================================================
// Blueprint Generation Prompts
// ============================================================================

/**
 * System prompt for blueprint generation
 * Used by blueprint-generator.ts and displayed in prompt preview modal
 */
export const BLUEPRINT_GENERATION_SYSTEM_PROMPT = `You are a context planning assistant that creates comprehensive blueprints for building AI context databases for live events.

Your task: Generate a detailed blueprint for context generation that includes:
1. Important details extracted from the event information
2. Inferred key topics and themes
3. Terms and concepts that need definitions (glossary)
4. A research plan using external APIs (Exa or Wikipedia)
5. A glossary construction plan
6. A vector database chunks construction plan
7. Cost estimates for each phase

Guidelines:
- Research plan should prefer Exa API for deep research (max 10-12 searches)
- IMPORTANT: Query priorities determine which Exa endpoint is used:
  * Priority 1-2 queries: Use Exa /research endpoint ONLY for complex, multi-step research that requires synthesis across sources (~$0.10-0.30 per query when optimized). Use sparingly - only 1-2 queries max per blueprint.
  * Priority 3+ queries: Use Exa /search endpoint for specific, focused searches (~$0.02-0.04 per query) - this should be the DEFAULT for most queries
  * CRITICAL: Exa /research uses variable pricing ($5/1k searches, $5/1k pages, $5/1M reasoning tokens). Cost increases with broad/vague queries. Only use /research when truly needed for synthesis.
  * Assign priority 1-2 VERY selectively - only to the most critical questions that absolutely require multi-source synthesis
  * Assign priority 3+ to ALL other queries - /search is faster, cheaper, and sufficient for most needs
- Glossary plan priorities:
  * Priority 1-3 terms: Will use Exa /answer endpoint for authoritative, citation-backed definitions (~$0.01-0.03 per term)
  * Priority 4+ terms: Will use LLM generation (lower cost, batch processing)
  * Assign priority 1-3 to the most critical terms that need authoritative definitions
- Chunks plan should target 500-1000 chunks depending on complexity
- Quality tier should be 'basic' (500 chunks) or 'comprehensive' (1000 chunks)
- Cost estimates should be realistic:
  * Exa /research: ~$0.10-0.30 per query when optimized with outputSchema (priority 1-2, use sparingly - max 1-2 per blueprint)
  * Exa /search: ~$0.02-0.04 per query (priority 3+, DEFAULT for most queries)
  * Exa /answer: ~$0.01-0.03 per term (priority 1-3)
  * LLM glossary: ~$0.01-0.02 total (priority 4+)
  * Embeddings: ~$0.0001 per chunk
- Prioritize high-value research queries and terms strategically
- Consider both basic and comprehensive tiers in cost breakdown

CRITICAL REQUIREMENT: All array fields MUST be populated with actual, relevant content. Empty arrays are not acceptable.

Output format: Return a JSON object matching the Blueprint structure with these exact field names.`;

/**
 * User prompt template for blueprint generation
 * Used by blueprint-generator.ts
 * @param eventTitle - The event title
 * @param topic - The event topic
 * @param documentsSection - Formatted section about available documents
 */
export function createBlueprintUserPrompt(
  eventTitle: string,
  topic: string,
  documentsSection: string
): string {
  return `Generate a context generation blueprint for the following event:

Event Title: ${eventTitle}
Event Topic: ${topic}${documentsSection}

CRITICAL: You MUST populate ALL arrays with actual, relevant content. Empty arrays are NOT acceptable and will cause the request to fail.

Your response must include:

1. Important Details (array of 5-10 strings):
   - Extract key points, insights, or highlights from the event information
   - Think about what makes this event important or what attendees should know
   - Example for topic "${topic}": ["Focuses on practical ${topic} implementation strategies", "Covers latest industry developments in ${topic}", "Provides hands-on experience with ${topic} tools"]
   - REQUIRED: Minimum 5 items

2. Inferred Topics (array of 5-10 strings):
   - List specific topics that will likely be discussed during the event
   - Think about subtopics, related areas, and themes
   - Example for topic "${topic}": ["${topic} Fundamentals", "${topic} Best Practices", "${topic} Case Studies", "${topic} Tools and Frameworks"]
   - REQUIRED: Minimum 5 items

3. Key Terms (array of 10-20 strings):
   - Identify terms, concepts, acronyms, or jargon that attendees might encounter
   - These should be domain-specific terms related to "${topic}"
   - Think about technical terms, industry jargon, acronyms, and key concepts
   - Example: Extract terms from the topic itself, related technologies, methodologies
   - REQUIRED: Minimum 10 items

4. Research Plan (object with queries array):
   - queries: Array of 5-12 search query objects, each with:
     * query: string (specific search query related to "${topic}")
     * api: "exa" or "wikipedia"
     * priority: number (1-10, lower is higher priority)
     * estimated_cost: number (0.10-0.50 for priority 1-2 exa /research, 0.02-0.04 for priority 3+ exa /search, 0.001 for wikipedia)
   - PRIORITY GUIDANCE:
     * Priority 1-2: Broad, comprehensive research questions that need deep analysis (uses Exa /research endpoint)
       Example: "comprehensive overview of ${topic} including latest developments, industry standards, and best practices"
     * Priority 3+: Specific, focused queries that benefit from fast search (uses Exa /search endpoint)
       Example: "specific ${topic} implementation techniques", "${topic} case studies"
   - Example queries for "${topic}":
     * {"query": "comprehensive overview of ${topic} including latest developments, industry standards, best practices, and key insights", "api": "exa", "priority": 1, "estimated_cost": 0.30}
     * {"query": "detailed analysis of ${topic} trends, applications, and practical implementations", "api": "exa", "priority": 2, "estimated_cost": 0.30}
     * {"query": "best practices for ${topic} implementation", "api": "exa", "priority": 3, "estimated_cost": 0.03}
     * {"query": "${topic} industry standards and guidelines", "api": "exa", "priority": 4, "estimated_cost": 0.03}
   - total_searches: number (must match queries array length)
   - estimated_total_cost: number (sum of all query costs, considering priority-based pricing)
   - REQUIRED: Minimum 5 queries
   - RECOMMENDED: Include 1-2 priority 1-2 queries for comprehensive research, rest as priority 3+

5. Glossary Plan (object with terms array):
   - terms: Array of 10-20 term objects, each with:
     * term: string (the actual term)
     * is_acronym: boolean
     * category: string (e.g., "technical", "business", "domain-specific")
     * priority: number (1-10, lower is higher priority)
   - PRIORITY GUIDANCE:
     * Priority 1-3: Most critical terms that need authoritative, citation-backed definitions (uses Exa /answer endpoint, ~$0.01-0.03 per term)
     * Priority 4+: Standard terms that can use batch LLM generation (lower cost)
     * Assign priority 1-3 to foundational concepts, key acronyms, and domain-specific terms that are essential to understanding
   - estimated_count: number (must match terms array length)
   - REQUIRED: Minimum 10 terms related to "${topic}"
   - RECOMMENDED: Include 3-5 priority 1-3 terms for authoritative definitions, rest as priority 4+

6. Chunks Plan (object):
   - sources: Array of at least 3 source objects, each with:
     * source: string (e.g., "research_results", "event_documents", "llm_generated")
     * priority: number (1-10)
     * estimated_chunks: number
   - target_count: number (500 for basic, 1000 for comprehensive)
   - quality_tier: "basic" or "comprehensive"
   - ranking_strategy: string describing ranking approach
   - REQUIRED: Minimum 3 sources

7. Cost Breakdown (object):
   - research: number (total cost from research plan)
   - glossary: number (typically 0.01-0.02)
   - chunks: number (approximately target_count * 0.0001 + 0.05)
   - total: number (sum of all costs)

VERIFY BEFORE RETURNING:
- important_details array has at least 5 items
- inferred_topics array has at least 5 items  
- key_terms array has at least 10 items
- research_plan.queries array has at least 5 items
- glossary_plan.terms array has at least 10 items
- chunks_plan.sources array has at least 3 items
- All arrays are non-empty

Return the blueprint as a JSON object with all fields properly structured and populated.`;
}

// ============================================================================
// Glossary Builder Prompts
// ============================================================================

/**
 * System prompt for Exa /answer API calls
 * Used by glossary-builder.ts when calling Exa API for authoritative definitions
 */
export const EXA_ANSWER_SYSTEM_PROMPT = `Provide a comprehensive, technical definition suitable for professionals. 
                        If this is an acronym, explain what it stands for. 
                        Include relevant context and related concepts.`;

/**
 * System prompt for LLM glossary term definition generation
 * Used by glossary-builder.ts for batch term definitions
 */
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

/**
 * User prompt template for LLM glossary term definition generation
 * Used by glossary-builder.ts
 * @param termsList - Formatted list of terms to define
 * @param researchContext - Research context text (max 5000 chars)
 * @param importantDetails - Important event details (max 2000 chars)
 */
export function createGlossaryDefinitionUserPrompt(
  termsList: string,
  researchContext: string,
  importantDetails: string
): string {
  return `Generate definitions for the following terms:

${termsList}

Research Context:
${researchContext.substring(0, 5000)}

Important Event Details:
${importantDetails.substring(0, 2000)}

For each term, provide:
- term: The exact term name
- definition: Clear definition (1-3 sentences)
- acronym_for: What the term stands for (if it's an acronym, otherwise omit)
- category: Category (e.g., technical, business, domain-specific)
- usage_examples: Array of 1-2 example sentences (optional)
- related_terms: Array of related term names (optional)
- confidence_score: Number between 0 and 1
- source: "llm_generation"

Return as JSON object with a "definitions" key containing an array of term definitions.`;
}

/**
 * System prompt for transforming Exa answers into glossary format
 * Used by glossary-builder.ts to clean up Exa markdown responses
 */
export const EXA_ANSWER_TRANSFORM_SYSTEM_PROMPT = `You are a glossary assistant that transforms authoritative answers into structured glossary entries.

Your task: Transform a markdown-formatted answer (which may contain links, formatting, and citations) into a clean, structured glossary entry.

Guidelines:
- Extract a clean definition (1-3 sentences) without markdown formatting or links
- If the term is an acronym, extract what it stands for
- Generate 1-2 usage examples based on the answer content
- Extract related terms mentioned in the answer (2-5 terms)
- Preserve the authoritative nature of the source material
- Remove markdown links, formatting, and citations from the definition text

Output format: Return a JSON object with this exact structure:
{
  "term": "exact term name",
  "definition": "clean definition without markdown (1-3 sentences)",
  "acronym_for": "what it stands for (if acronym, otherwise omit this field)",
  "category": "category name",
  "usage_examples": ["example sentence 1", "example sentence 2"],
  "related_terms": ["term1", "term2", "term3"]
}`;

/**
 * User prompt template for transforming Exa answers into glossary format
 * Used by glossary-builder.ts
 * @param term - The term name
 * @param isAcronym - Whether the term is an acronym
 * @param category - The term category
 * @param exaAnswer - The Exa answer text (markdown)
 */
export function createExaAnswerTransformUserPrompt(
  term: string,
  isAcronym: boolean,
  category: string,
  exaAnswer: string
): string {
  return `Transform this Exa answer into a structured glossary entry:

Term: ${term}
Is Acronym: ${isAcronym}
Category: ${category}

Exa Answer (markdown):
${exaAnswer}

Extract:
1. A clean definition (remove markdown, links, citations)
2. Acronym expansion (if applicable)
3. 1-2 usage examples based on the answer
4. 2-5 related terms mentioned in the answer

Return as JSON object.`;
}

// ============================================================================
// Chunks Builder Prompts
// ============================================================================

/**
 * System prompt for LLM context chunk generation
 * Used by chunks-builder.ts to generate additional context chunks
 */
export const CONTEXT_CHUNKS_GENERATION_SYSTEM_PROMPT = `You are a context generation assistant that creates informative context chunks about event topics.

Your task: Generate context chunks that provide valuable background information about the event topic and key themes.

Context: The research results provided may include:
- Comprehensive research reports (from Exa /research endpoint) for high-priority queries - these are synthesized, in-depth analyses
- Specific search results (from Exa /search endpoint) for focused queries - these are direct results from web searches
- Both types complement each other: comprehensive reports provide broad context, specific searches provide detailed information

Guidelines:
- Each chunk should be 200-400 words
- Be factual and informative
- Cover different aspects of the topic
- Each chunk should be self-contained
- Build on the research results provided, whether they are comprehensive reports or specific search results

Output format: Return a JSON object with a "chunks" field containing an array of strings, where each string is a context chunk. Example: {"chunks": ["chunk 1 text...", "chunk 2 text..."]}`;

/**
 * User prompt template for LLM context chunk generation
 * Used by chunks-builder.ts
 * @param neededLLMChunks - Number of chunks to generate
 * @param topics - Event topics (comma-separated)
 * @param keyTerms - Key terms (comma-separated, first 10)
 * @param researchSummary - Summary of research results (max 3000 chars)
 */
export function createContextChunksUserPrompt(
  neededLLMChunks: number,
  topics: string,
  keyTerms: string,
  researchSummary: string
): string {
  return `Generate ${neededLLMChunks} context chunks about the following event:

Event Topics: ${topics}
Key Terms: ${keyTerms}

Research Summary:
${researchSummary}

Generate informative context chunks that complement the research results. Each chunk should cover a different aspect or provide additional context.

Return as a JSON object with a "chunks" field containing an array of strings. Each string should be a complete context chunk (200-400 words).`;
}

// ============================================================================
// Context Generation Orchestrator Prompts
// ============================================================================

/**
 * System prompt for stub research chunk generation (fallback when Exa API not available)
 * Used by context-generation-orchestrator.ts
 */
export const STUB_RESEARCH_SYSTEM_PROMPT = `You are a research assistant. Generate 2-3 informative context chunks (200-300 words each) based on a research query.`;

/**
 * User prompt template for stub research chunk generation
 * Used by context-generation-orchestrator.ts
 * @param query - The research query
 */
export function createStubResearchUserPrompt(query: string): string {
  return `Generate informative context chunks about: ${query}\n\nReturn as JSON with "chunks" array.`;
}

// ============================================================================
// Context Builder Prompts
// ============================================================================

/**
 * System prompt for topic context generation
 * Used by context-builder.ts during event prep phase
 */
export const TOPIC_CONTEXT_SYSTEM_PROMPT = `You are a knowledge assistant that generates comprehensive, factual context about topics for real-time event processing.

Your task: Generate a structured set of context chunks about the given topic that will help an AI agent understand and generate relevant insights during a live event.

Guidelines:
- Generate factual, educational information about the topic
- Include key concepts, terminology, historical context, and relevant details
- Break information into digestible chunks (each chunk should be 200-400 words)
- Focus on information that would be useful for generating context cards during a live discussion
- Be comprehensive but concise

Output format: Return a JSON array of strings, where each string is a context chunk.
Example:
{
  "chunks": [
    "Chunk 1 text here...",
    "Chunk 2 text here...",
    ...
  ]
}`;

/**
 * User prompt template for topic context generation
 * Used by context-builder.ts
 * @param topic - The event topic
 * @param eventTitle - The event title
 */
export function createTopicContextUserPrompt(topic: string, eventTitle: string): string {
  return `Generate comprehensive context chunks about: ${topic}

The event title is: ${eventTitle}

Please provide 10-15 context chunks covering:
1. Key concepts and definitions
2. Important terminology
3. Historical context or background
4. Relevant examples or case studies
5. Common discussion points or questions
6. Related topics or connections

Each chunk should be 200-400 words and be self-contained.`;
}

// ============================================================================
// Orchestrator Prompts (Cards & Facts Agents)
// ============================================================================

/**
 * User prompt template for Cards agent card generation
 * Used by orchestrator.ts (fallback to standard API)
 * @param transcriptText - The transcript text
 * @param contextBullets - Recent context bullets
 * @param factsContext - Relevant facts (JSON string)
 * @param vectorContext - Additional vector search context
 */
export function createCardGenerationUserPrompt(
  transcriptText: string,
  contextBullets: string[],
  factsContext: string,
  glossaryContext?: string
): string {
  let prompt = `Transcript:\n${transcriptText}\n\nRecent context:\n${contextBullets.join('\n')}\n\nRelevant facts:\n${factsContext}`;
  
  if (glossaryContext) {
    prompt += `\n\n${glossaryContext}`;
  }
  
  prompt += `\n\nDetermine the appropriate card_type (text, text_visual, or visual) and generate the card accordingly.`;
  
  return prompt;
}

/**
 * System prompt for Facts agent (fallback to standard API)
 * Used by orchestrator.ts
 * Note: The main system prompt comes from policies.ts via getPolicy('facts')
 */
export const FACTS_EXTRACTION_SYSTEM_PROMPT = `You are a facts extractor. Track stable keys (agenda, decisions, deadlines, metrics). Return JSON array of facts.`;

/**
 * User prompt template for Facts agent fact extraction
 * Used by orchestrator.ts
 * @param recentText - Recent transcript text
 * @param currentFacts - Current facts (JSON string)
 */
export function createFactsExtractionUserPrompt(
  recentText: string,
  currentFacts: string,
  glossaryContext?: string
): string {
  let prompt = `Recent transcripts:\n${recentText}\n\nCurrent facts:\n${currentFacts}`;
  
  if (glossaryContext) {
    prompt += `\n\n${glossaryContext}`;
  }
  
  prompt += `\n\nExtract or update stable facts. Return JSON array with keys: key, value, confidence.`;
  
  return prompt;
}

// ============================================================================
// Realtime Session Prompts
// ============================================================================

/**
 * User prompt template for Cards agent in Realtime API
 * Used by realtime-session.ts formatMessage
 * @param message - The transcript message
 * @param bullets - Context bullets
 */
export function createRealtimeCardsUserPrompt(
  message: string,
  bullets: string[],
  glossaryContext?: string
): string {
  let prompt = `Transcript: ${message}\n\n`;

  if (bullets.length > 0) {
    prompt += `Recent Context:\n${bullets.join('\n')}\n\n`;
  }

  if (glossaryContext) {
    prompt += `${glossaryContext}\n\n`;
  }

  prompt += `Generate a context card if the content is novel and useful. `;
  prompt += `Determine the appropriate card_type (text, text_visual, or visual) based on content.`;
  
  return prompt;
}

/**
 * User prompt template for Facts agent in Realtime API
 * Used by realtime-session.ts formatMessage
 * @param recentText - Recent transcript text
 * @param facts - Current facts (JSON string)
 */
export function createRealtimeFactsUserPrompt(
  recentText: string,
  facts: string,
  glossaryContext?: string
): string {
  let prompt = `Recent Transcripts:\n${recentText}\n\n`;

  prompt += `Current Facts:\n${facts}\n\n`;

  if (glossaryContext) {
    prompt += `${glossaryContext}\n\n`;
  }

  prompt += `Extract or update stable facts. Track agenda, decisions, deadlines, metrics, attendees, topics. `;
  prompt += `Return JSON array of facts with key, value, and confidence.`;
  
  return prompt;
}

