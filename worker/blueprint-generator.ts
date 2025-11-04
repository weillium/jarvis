/**
 * Blueprint Generator
 * Generates context generation blueprints for user review and approval
 * 
 * This is part of the manual context generation workflow where:
 * 1. User triggers blueprint generation
 * 2. System generates a plan (blueprint) using LLM
 * 3. User reviews and approves blueprint
 * 4. System executes the blueprint to build context
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// ============================================================================
// Type Definitions
// ============================================================================

export interface BlueprintGeneratorOptions {
  supabase: ReturnType<typeof createClient>;
  openai: OpenAI;
  genModel: string;
}

export interface Blueprint {
  // Extracted details
  important_details: string[];
  inferred_topics: string[];
  key_terms: string[];
  
  // Research plan
  research_plan: {
    queries: Array<{
      query: string;
      api: 'exa' | 'wikipedia';
      priority: number;
      estimated_cost?: number;
    }>;
    total_searches: number;
    estimated_total_cost: number;
  };
  
  // Glossary plan
  glossary_plan: {
    terms: Array<{
      term: string;
      is_acronym: boolean;
      category: string;
      priority: number;
    }>;
    estimated_count: number;
  };
  
  // Chunks plan
  chunks_plan: {
    sources: Array<{
      source: string;
      priority: number;
      estimated_chunks: number;
    }>;
    target_count: number; // 500 or 1000
    quality_tier: 'basic' | 'comprehensive';
    ranking_strategy: string;
  };
  
  // Cost breakdown
  cost_breakdown: {
    research: number;
    glossary: number;
    chunks: number;
    total: number;
  };
}

interface LLMBlueprintResponse {
  important_details: string[];
  inferred_topics: string[];
  key_terms: string[];
  research_plan: {
    queries: Array<{
      query: string;
      api: 'exa' | 'wikipedia';
      priority: number;
      estimated_cost?: number;
    }>;
    total_searches: number;
    estimated_total_cost: number;
  };
  glossary_plan: {
    terms: Array<{
      term: string;
      is_acronym: boolean;
      category: string;
      priority: number;
    }>;
    estimated_count: number;
  };
  chunks_plan: {
    sources: Array<{
      source: string;
      priority: number;
      estimated_chunks: number;
    }>;
    target_count: number;
    quality_tier: 'basic' | 'comprehensive';
    ranking_strategy: string;
  };
  cost_breakdown: {
    research: number;
    glossary: number;
    chunks: number;
    total: number;
  };
}

// ============================================================================
// Document Extraction (Stubbed for MVP)
// ============================================================================

/**
 * Extract text from documents uploaded to the event
 * Currently stubbed for MVP - returns placeholder indicating documents exist
 * TODO: Implement full extraction with pdf-parse and mammoth
 */
async function extractDocumentsText(
  eventId: string,
  supabase: ReturnType<typeof createClient>
): Promise<string> {
  try {
    // Fetch documents from event_docs table
    const { data: docs, error } = await supabase
      .from('event_docs')
      .select('id, path')
      .eq('event_id', eventId);

    if (error) {
      console.warn(`[blueprint] Error fetching documents: ${error.message}`);
      return '';
    }

    if (!docs || docs.length === 0) {
      console.log(`[blueprint] No documents found for event ${eventId}`);
      return '';
    }

    console.log(`[blueprint] Found ${docs.length} document(s) for event ${eventId}`);

    // MVP: Return placeholder indicating documents exist
    // Full implementation would:
    // 1. Download files from Supabase Storage using supabase.storage.from('bucket').download(path)
    // 2. Extract text using pdf-parse (PDF) or mammoth (DOCX)
    // 3. Chunk text intelligently
    // 
    // For now, LLM can create a blueprint knowing documents exist
    return `[${docs.length} document(s) uploaded - text extraction will be available in full implementation]`;
  } catch (error: any) {
    console.warn(`[blueprint] Error extracting documents: ${error.message}`);
    return '';
  }
}

// ============================================================================
// Blueprint Generation
// ============================================================================

/**
 * Generate a context generation blueprint for an event
 * 
 * This function:
 * 1. Fetches event data (title, topic)
 * 2. Fetches uploaded documents
 * 3. Extracts text from documents (if available)
 * 4. Calls LLM to generate a comprehensive blueprint
 * 5. Stores blueprint in database
 * 6. Updates agent status to 'blueprint_ready'
 */
export async function generateContextBlueprint(
  eventId: string,
  agentId: string,
  options: BlueprintGeneratorOptions
): Promise<string> {
  const { supabase, openai, genModel } = options;

  console.log(`[blueprint] Generating blueprint for event ${eventId}, agent ${agentId}`);

  try {
    // 1. Update agent status to 'blueprint_generating'
    const { error: statusError } = await (supabase
      .from('agents') as any)
      .update({ status: 'blueprint_generating' })
      .eq('id', agentId);

    if (statusError) {
      throw new Error(`Failed to update agent status: ${statusError.message}`);
    }

    // 2. Fetch event data
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, title, topic')
      .eq('id', eventId)
      .single() as { data: { id: string; title: string; topic: string | null } | null; error: any };

    if (eventError || !event) {
      throw new Error(`Failed to fetch event: ${eventError?.message || 'Event not found'}`);
    }

    console.log(`[blueprint] Event: ${event.title}, Topic: ${event.topic || 'N/A'}`);

    // 3. Extract text from documents (if any)
    const documentsText = await extractDocumentsText(eventId, supabase);
    const hasDocuments = documentsText.length > 0 && !documentsText.includes('will be available');

    // 4. Generate blueprint using LLM
    const blueprint = await generateBlueprintWithLLM(
      event.title,
      event.topic,
      documentsText,
      hasDocuments,
      openai,
      genModel
    );

    // 5. Store blueprint in database
    const { data: blueprintRecord, error: insertError } = await (supabase
      .from('context_blueprints') as any)
      .insert({
        event_id: eventId,
        agent_id: agentId,
        status: 'ready',
        blueprint: blueprint as any,
        important_details: blueprint.important_details,
        inferred_topics: blueprint.inferred_topics,
        key_terms: blueprint.key_terms,
        research_plan: blueprint.research_plan as any,
        research_apis: blueprint.research_plan.queries.map(q => q.api),
        research_search_count: blueprint.research_plan.total_searches,
        estimated_cost: blueprint.cost_breakdown.total,
        glossary_plan: blueprint.glossary_plan as any,
        chunks_plan: blueprint.chunks_plan as any,
        target_chunk_count: blueprint.chunks_plan.target_count,
        quality_tier: blueprint.chunks_plan.quality_tier,
      })
      .select('id')
      .single() as { data: { id: string } | null; error: any };

    if (insertError || !blueprintRecord) {
      throw new Error(`Failed to store blueprint: ${insertError?.message || 'Insert failed'}`);
    }

    console.log(`[blueprint] Blueprint stored with ID: ${blueprintRecord.id}`);

    // 6. Update agent status to 'blueprint_ready'
    const { error: finalStatusError } = await (supabase
      .from('agents') as any)
      .update({ status: 'blueprint_ready' })
      .eq('id', agentId);

    if (finalStatusError) {
      console.warn(`[blueprint] Warning: Failed to update agent status to blueprint_ready: ${finalStatusError.message}`);
      // Don't throw - blueprint is stored, status update can be retried
    }

    console.log(`[blueprint] Blueprint generation complete for event ${eventId}`);
    return blueprintRecord.id;
  } catch (error: any) {
    console.error(`[blueprint] Error generating blueprint: ${error.message}`);
    
    // Update agent status to error
    try {
      await (supabase
        .from('agents') as any)
        .update({ status: 'error' })
        .eq('id', agentId);
    } catch (err: any) {
      console.error(`[blueprint] Failed to update agent status to error: ${err.message}`);
    }

    // Try to store error in blueprint record if it exists
    try {
      await (supabase
        .from('context_blueprints') as any)
        .update({
          status: 'error',
          error_message: error.message,
        })
        .eq('agent_id', agentId);
    } catch {
      // Ignore if blueprint doesn't exist yet
    }

    throw error;
  }
}

/**
 * Generate blueprint using LLM
 */
async function generateBlueprintWithLLM(
  eventTitle: string,
  eventTopic: string | null,
  documentsText: string,
  hasDocuments: boolean,
  openai: OpenAI,
  genModel: string
): Promise<Blueprint> {
  const topic = eventTopic || eventTitle;

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

Output format: Return a JSON object matching the Blueprint structure with these exact field names.`;

  const documentsSection = hasDocuments
    ? `\n\nDocuments Available:\n${documentsText}\n\nConsider that documents are uploaded for this event. The blueprint should plan to extract and use content from these documents in the chunks construction phase.`
    : '\n\nNo documents have been uploaded for this event yet.';

  const userPrompt = `Generate a context generation blueprint for the following event:

Event Title: ${eventTitle}
Event Topic: ${topic}${documentsSection}

Please create a comprehensive blueprint that includes:

1. Important Details: Extract and clean important details from the event information (5-10 key points)
2. Inferred Topics: List 5-10 key topics that will likely be discussed
3. Key Terms: Identify 10-20 terms/concepts/acronyms that attendees might need help understanding
4. Research Plan: Create a research plan with 5-12 queries (prefer Exa API, use Wikipedia as fallback):
   - Each query should be specific and actionable
   - Assign priorities (1 = highest, 10 = lowest)
   - Estimate cost per query (Exa: ~$0.02-0.04, Wikipedia: ~$0.001)
   - Include total_searches and estimated_total_cost
5. Glossary Plan: List terms that need definitions with:
   - term: string
   - is_acronym: boolean
   - category: string (technical, business, domain-specific, etc.)
   - priority: number (1 = highest, 10 = lowest)
   - estimated_count: total number of terms
6. Chunks Plan: Plan how to construct vector database chunks:
   - sources: array with source name, priority, estimated_chunks
   - target_count: number (500 for basic, 1000 for comprehensive)
   - quality_tier: 'basic' or 'comprehensive'
   - ranking_strategy: string describing how chunks will be ranked
7. Cost Breakdown: Provide realistic cost estimates for:
   - research: total research cost
   - glossary: glossary generation cost (minimal, ~$0.01-0.02)
   - chunks: embedding and generation cost (~$0.0001 per chunk + generation)
   - total: sum of all costs

Return the blueprint as a JSON object with all fields properly structured.`;

  try {
    const response = await openai.chat.completions.create({
      model: genModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from LLM');
    }

    const parsed = JSON.parse(content) as LLMBlueprintResponse;

    // Validate and normalize the blueprint
    const blueprint: Blueprint = {
      important_details: parsed.important_details || [],
      inferred_topics: parsed.inferred_topics || [],
      key_terms: parsed.key_terms || [],
      research_plan: parsed.research_plan || {
        queries: [],
        total_searches: 0,
        estimated_total_cost: 0,
      },
      glossary_plan: parsed.glossary_plan || {
        terms: [],
        estimated_count: 0,
      },
      chunks_plan: parsed.chunks_plan || {
        sources: [],
        target_count: 500,
        quality_tier: 'basic',
        ranking_strategy: 'relevance',
      },
      cost_breakdown: parsed.cost_breakdown || {
        research: 0,
        glossary: 0,
        chunks: 0,
        total: 0,
      },
    };

    // Ensure quality_tier is valid
    if (blueprint.chunks_plan.quality_tier !== 'basic' && blueprint.chunks_plan.quality_tier !== 'comprehensive') {
      blueprint.chunks_plan.quality_tier = blueprint.chunks_plan.target_count >= 1000 ? 'comprehensive' : 'basic';
    }

    // Ensure target_count matches quality_tier
    if (blueprint.chunks_plan.quality_tier === 'comprehensive' && blueprint.chunks_plan.target_count < 1000) {
      blueprint.chunks_plan.target_count = 1000;
    } else if (blueprint.chunks_plan.quality_tier === 'basic' && blueprint.chunks_plan.target_count > 500) {
      blueprint.chunks_plan.target_count = 500;
    }

    // Validate and normalize research_plan queries
    if (blueprint.research_plan.queries) {
      blueprint.research_plan.queries = blueprint.research_plan.queries.map(q => ({
        query: q.query || '',
        api: (q.api === 'exa' || q.api === 'wikipedia') ? q.api : 'exa',
        priority: q.priority || 5,
        estimated_cost: q.estimated_cost || (q.api === 'exa' ? 0.03 : 0.001),
      }));
      blueprint.research_plan.total_searches = blueprint.research_plan.queries.length;
      blueprint.research_plan.estimated_total_cost = blueprint.research_plan.queries.reduce(
        (sum, q) => sum + (q.estimated_cost || 0),
        0
      );
    }

    // Validate glossary_plan terms
    if (blueprint.glossary_plan.terms) {
      blueprint.glossary_plan.terms = blueprint.glossary_plan.terms.map(t => ({
        term: t.term || '',
        is_acronym: t.is_acronym || false,
        category: t.category || 'general',
        priority: t.priority || 5,
      }));
      blueprint.glossary_plan.estimated_count = blueprint.glossary_plan.terms.length;
    }

    // Ensure cost_breakdown is calculated
    if (blueprint.cost_breakdown.total === 0) {
      blueprint.cost_breakdown.total = 
        blueprint.cost_breakdown.research +
        blueprint.cost_breakdown.glossary +
        blueprint.cost_breakdown.chunks;
    }

    console.log(`[blueprint] LLM generated blueprint with ${blueprint.research_plan.queries.length} research queries, ${blueprint.glossary_plan.terms.length} glossary terms, target ${blueprint.chunks_plan.target_count} chunks`);
    
    return blueprint;
  } catch (error: any) {
    console.error(`[blueprint] Error generating blueprint with LLM: ${error.message}`);
    throw new Error(`Failed to generate blueprint: ${error.message}`);
  }
}
