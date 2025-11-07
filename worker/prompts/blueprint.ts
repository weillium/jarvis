/**
 * Blueprint generation prompts shared between the pipeline orchestrator and UI preview.
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


