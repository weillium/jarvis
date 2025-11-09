/**
 * Blueprint generation prompts shared between the pipeline orchestrator and UI preview.
 */

export const BLUEPRINT_GENERATION_SYSTEM_PROMPT = `You are a context planning assistant that produces blueprints for AI event context databases.

Your blueprint must cover:
- Important details, inferred topics, glossary terms, research plan, glossary plan, chunks plan, and cost breakdown

Key rules:
- Exa usage: reserve /research for 1-2 high-priority synthesis queries (≈$0.10-0.30); default to /search for focused queries (≈$0.02-0.04); Wikipedia is acceptable for lightweight lookups (≈$0.001)
- Glossary priorities: terms with priority 1-3 use Exa /answer (≈$0.01-0.03 each); priority 4+ terms use LLM batch generation (≈$0.01 total)
- Chunks plan: choose quality tier "basic" (500 chunks) or "comprehensive" (1000 chunks); include ≥3 sources; estimate embeddings at ≈$0.0001 per chunk

Requirements:
- Populate every array with relevant content
- Return a JSON object that matches the Blueprint schema exactly`;

export function createBlueprintUserPrompt(
  eventTitle: string,
  topic: string,
  documentsSection: string
): string {
  return `Generate a blueprint for the event context system.

Event Title: ${eventTitle}
Event Topic: ${topic}${documentsSection}

Return a JSON object with these sections:

1. important_details (5-10 strings)
   - Capture essential takeaways attendees must know
   - Example entries: ["Goals and outcomes", "Key stakeholders", "Critical timeline notes"]

2. inferred_topics (5-10 strings)
   - List likely subtopics, themes, or tracks
   - Example entries: ["Foundational concepts", "Implementation practices", "Case studies", "Tools and platforms", "Emerging trends"]

3. key_terms (10-20 strings)
   - Provide domain-specific terminology, acronyms, or jargon
   - Example entries: ["Service-Level Objective", "Control Plane", "Zero Trust", "Customer Journey Mapping"]

4. research_plan (object)
   - queries: 5-12 items, each { query, api, priority, estimated_cost }
   - Follow system rules for Exa endpoints and pricing
   - Example queries: ["comprehensive overview of the subject", "recent implementations and case studies", "industry standards and regulations"]
   - total_searches and estimated_total_cost must align with the queries

5. glossary_plan (object)
   - terms: 10-20 items, each { term, is_acronym, category, priority }
   - Reflect priority-based sourcing guidance
   - estimated_count equals terms.length

6. chunks_plan (object)
   - sources: ≥3 entries with { source, priority, estimated_chunks }
   - Include target_count (500 basic or 1000 comprehensive), quality_tier, and ranking_strategy

7. cost_breakdown (object)
   - Provide { research, glossary, chunks, total } consistent with the plans above

Checklist before returning:
- [ ] important_details has ≥5 items
- [ ] inferred_topics has ≥5 items
- [ ] key_terms has ≥10 items
- [ ] research_plan.queries has ≥5 items and costs add up
- [ ] glossary_plan.terms has ≥10 items
- [ ] chunks_plan.sources has ≥3 items
- [ ] All arrays contain meaningful, non-empty content
- [ ] Response is valid JSON matching the Blueprint schema`;
}


