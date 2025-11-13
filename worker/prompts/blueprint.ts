/**
 * Blueprint generation prompts shared between the pipeline orchestrator and UI preview.
 */

export const BLUEPRINT_GENERATION_SYSTEM_PROMPT = `You are a context planning assistant that produces blueprints for AI event context databases.

Your blueprint must cover:
- Important details, inferred topics, audience profile, glossary terms, research plan, glossary plan, chunks plan, cost breakdown, and agent alignment

Key rules:
- Serve downstream agents explicitly:
  - Facts agent: requires verifiable, evidence-backed statements that map to transcript lines, documents, or links.
  - Cards agent: requires visually compelling, audience-friendly assets (definitions, attributed quotes, image-ready snippets, lightweight frameworks, short summaries) with clear provenance.
  - Reject or trim material that does not support at least one of these agents.
- Exa usage: reserve /research for 1-2 high-priority synthesis queries (≈$0.10-0.30); default to /search for focused queries (≈$0.02-0.04); Wikipedia is acceptable for lightweight lookups (≈$0.001)
- Glossary priorities: terms with priority 1 use Exa /answer (≈$0.01-0.03 each); priority 2+ terms use LLM batch generation (≈$0.01 total)
- Chunks plan: choose quality tier "basic" or "comprehensive"; include ≥3 sources; map each source to target agent goals (facts vs. cards); estimate embeddings at ≈$0.0001 per chunk; stop when authentic material runs out instead of fabricating filler

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
   - Anchor every term in the specific event’s subject matter, speakers, and timeframe
   - Prefer recency and tangible event artifacts; omit filler even if counts stay below targets
   - Provide domain-specific terminology, acronyms, or jargon; note genuine gaps instead of inventing terms
   - Example entries: ["Service-Level Objective", "Control Plane", "Zero Trust", "Customer Journey Mapping"]

4. audience_profile (object)
   - Structure:
     {
       "audience_summary": string,
       "primary_roles": string[],
       "core_needs": string[],
       "desired_outcomes": string[],
       "tone_and_voice": string,
       "cautionary_notes": string[]
     }
   - audience_summary: 2-3 sentences explaining who attends, their responsibilities, and why they care about this event.
   - primary_roles: 3-6 specific titles or personas (e.g., "Chief Revenue Officer", "Staff ML Engineer").
   - core_needs: 4-6 succinct bullets describing what the audience must solve, learn, or defend.
   - desired_outcomes: 4-6 bullets capturing what success looks like for attendees after the event.
   - tone_and_voice: <=160 characters guiding voice/style that resonates with this audience.
   - cautionary_notes: 2-4 bullets highlighting sensitivities, red flags, or angles to avoid.

5. research_plan (object)
   - queries: 5-12 items, each { query, api, priority, estimated_cost, agent_utility, provenance_hint }
   - agent_utility must be an array drawn from ["facts","cards","glossary"] to indicate which downstream consumers benefit
   - provenance_hint should call out expected sources (publication, speaker, document, etc.) when known
  - Limit Exa-heavy work: include **at most one** priority-1 query that uses Exa /research; any additional high-signal work should be downgraded to priority ≥2 or routed to Wikipedia
  - Cap Exa /search usage at four priority-2 queries; redirect further coverage to priority ≥3 or Wikipedia to control spend
   - Follow system rules for Exa endpoints and pricing; every query MUST include numeric estimated_cost
   - Example queries: ["comprehensive overview of the subject", "recent implementations and case studies", "industry standards and regulations"]
   - total_searches and estimated_total_cost must align with the queries

6. glossary_plan (object)
   - terms: 10-20 items, each { term, is_acronym, category, priority, agent_utility }
   - agent_utility must be an array drawn from ["facts","cards"] to highlight which agent benefits from each term
   - Keep priority-1 terms (which trigger Exa /answer) to **no more than three**; assign remaining terms to priority ≥2 unless there is a compelling reason otherwise
   - Prioritize terms surfaced explicitly in this event’s content; leave the list shorter instead of fabricating jargon
   - Reflect priority-based sourcing guidance
   - estimated_count equals terms.length

7. chunks_plan (object)
   - sources: ≥3 entries with { label, upstream_reference, expected_format, priority, estimated_chunks, agent_utility }
   - label is a short descriptor (e.g., "Keynote slide deck"), upstream_reference should point to the research query or agenda asset expected to produce the material
   - expected_format describes what we anticipate ingesting (transcript, deck, press kit, etc.)
   - agent_utility must be an array drawn from ["facts","cards"] to indicate which agent will use the resulting chunks
   - Include target_count, quality_tier, and ranking_strategy
   - Focus on high-entropy agenda items likely to yield rich chunks once research completes; aim for 50-120 but stop when authentic material runs out

8. cost_breakdown (object)
   - Provide { research, glossary, chunks, total } consistent with the plans above

Checklist before returning:
- [ ] important_details has ≥5 items
- [ ] inferred_topics has ≥5 items
- [ ] key_terms has ≥10 items (or explicitly documents the shortfall)
- [ ] audience_profile fields contain concrete, non-generic insight and no placeholders
- [ ] research_plan.queries has ≥5 items, each with agent_utility, provenance_hint, priority, estimated_cost, and totals that add up
- [ ] glossary_plan.terms has ≥10 items (unless fewer truly exist—note gaps instead of fabricating)
- [ ] chunks_plan.sources has ≥3 items with agent_utility populated; target_count aligns with authentic material
- [ ] cost_breakdown totals equal the sum of research + glossary + chunks
- [ ] All arrays contain meaningful, non-empty content without duplication across sections
- [ ] Response is valid JSON matching the Blueprint schema`;
}


