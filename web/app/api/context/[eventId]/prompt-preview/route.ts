import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Prompt Preview API Route
 * 
 * Returns the prompt that would be sent to the LLM for blueprint generation.
 * This allows the UI to show the prompt to the user before generation starts.
 * 
 * GET /api/context/[eventId]/prompt-preview
 */

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;

    // Validate eventId format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(eventId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid event_id format (must be UUID)' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // Fetch event data
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, title, topic')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json(
        { ok: false, error: `Failed to fetch event: ${eventError?.message || 'Event not found'}` },
        { status: 404 }
      );
    }

    // Check for documents
    const { data: docs } = await supabase
      .from('event_docs')
      .select('id')
      .eq('event_id', eventId);

    const hasDocuments = docs && docs.length > 0;
    const topic = event.topic || event.title;

    // Construct the prompt (matching worker logic)
    const systemPrompt = `You are a context planning assistant that creates comprehensive blueprints for building AI context databases for live events.

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
- Chunks plan should target 500-1000 chunks depending on complexity
- Quality tier should be 'basic' (500 chunks) or 'comprehensive' (1000 chunks)
- Cost estimates should be realistic (Exa API ~$0.02-0.04 per search, embeddings ~$0.0001 per chunk)
- Prioritize high-value research queries and terms
- Consider both basic and comprehensive tiers in cost breakdown

CRITICAL REQUIREMENT: All array fields MUST be populated with actual, relevant content. Empty arrays are not acceptable.

Output format: Return a JSON object matching the Blueprint structure with these exact field names.`;

    const documentsSection = hasDocuments
      ? `\n\nDocuments Available:\n[${docs.length} document(s) uploaded - text extraction will be available in full implementation]\n\nConsider that documents are uploaded for this event. The blueprint should plan to extract and use content from these documents in the chunks construction phase.`
      : '\n\nNo documents have been uploaded for this event yet.';

    const userPrompt = `Generate a context generation blueprint for the following event:

Event Title: ${event.title}
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
     * estimated_cost: number (0.02-0.04 for exa, 0.001 for wikipedia)
   - Example queries for "${topic}":
     * {"query": "latest developments and trends in ${topic} 2024", "api": "exa", "priority": 1, "estimated_cost": 0.03}
     * {"query": "best practices for ${topic} implementation", "api": "exa", "priority": 2, "estimated_cost": 0.03}
     * {"query": "${topic} industry standards and guidelines", "api": "exa", "priority": 3, "estimated_cost": 0.03}
   - total_searches: number (must match queries array length)
   - estimated_total_cost: number (sum of all query costs)
   - REQUIRED: Minimum 5 queries

5. Glossary Plan (object with terms array):
   - terms: Array of 10-20 term objects, each with:
     * term: string (the actual term)
     * is_acronym: boolean
     * category: string (e.g., "technical", "business", "domain-specific")
     * priority: number (1-10, lower is higher priority)
   - estimated_count: number (must match terms array length)
   - REQUIRED: Minimum 10 terms related to "${topic}"

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

    return NextResponse.json({
      ok: true,
      prompt: {
        system: systemPrompt,
        user: userPrompt,
      },
      event: {
        title: event.title,
        topic: topic,
        hasDocuments: hasDocuments,
        documentCount: docs?.length || 0,
      },
    });
  } catch (error: any) {
    console.error('[api/context/prompt-preview] Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
