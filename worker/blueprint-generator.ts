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
import {
  BLUEPRINT_GENERATION_SYSTEM_PROMPT,
  createBlueprintUserPrompt,
} from './prompts';

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

  // Use shared system prompt
  const systemPrompt = BLUEPRINT_GENERATION_SYSTEM_PROMPT;

  const documentsSection = hasDocuments
    ? `\n\nDocuments Available:\n${documentsText}\n\nConsider that documents are uploaded for this event. The blueprint should plan to extract and use content from these documents in the chunks construction phase.`
    : '\n\nNo documents have been uploaded for this event yet.';

  const baseUserPrompt = createBlueprintUserPrompt(eventTitle, topic, documentsSection);

  // Retry logic with validation
  const maxRetries = 2; // 3 attempts total (initial + 2 retries)
  let attempt = 0;
  let parsed: LLMBlueprintResponse | null = null;
  let lastError: Error | null = null;

  while (attempt <= maxRetries) {
    try {
      const isRetry = attempt > 0;
      
      // Some models have temperature restrictions:
      // - o1 models: Don't support temperature parameter at all
      // - Some models (like gpt-5): Only support temperature = 1 (default), not custom values
      // We'll only set temperature if the model supports custom values
      const isO1Model = genModel.startsWith('o1');
      // Models that only support default temperature (1) or don't support it at all
      const onlySupportsDefaultTemp = isO1Model || genModel.includes('gpt-5');
      
      // Only set custom temperature if model supports it
      const supportsCustomTemperature = !onlySupportsDefaultTemp;
      const currentTemperature = supportsCustomTemperature ? (isRetry ? 0.5 : 0.7) : undefined;
      
      // Enhance prompt on retries with more explicit requirements
      const currentUserPrompt = isRetry
        ? `${baseUserPrompt}

IMPORTANT: This is a retry attempt. The previous response had empty or insufficient arrays. You MUST fill ALL arrays with actual, relevant content. Do not return empty arrays. Every array field must have the minimum required items as specified above.`
        : baseUserPrompt;

      console.log(`[blueprint] LLM attempt ${attempt + 1}/${maxRetries + 1} for topic "${topic}"${isRetry && supportsCustomTemperature ? ' (retry with lower temperature)' : ''}`);

      // Build request options - conditionally include temperature
      const requestOptions: any = {
        model: genModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: currentUserPrompt },
        ],
        response_format: { type: 'json_object' },
      };
      
      // Only add temperature if model supports custom temperature values
      // Models that only support default (1) or don't support it at all will omit the parameter
      if (supportsCustomTemperature && currentTemperature !== undefined) {
        requestOptions.temperature = currentTemperature;
      }

      const response = await openai.chat.completions.create(requestOptions);

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from LLM');
      }

      parsed = JSON.parse(content) as LLMBlueprintResponse;

      // Validate array lengths
      const importantDetailsCount = Array.isArray(parsed.important_details) ? parsed.important_details.length : 0;
      const inferredTopicsCount = Array.isArray(parsed.inferred_topics) ? parsed.inferred_topics.length : 0;
      const keyTermsCount = Array.isArray(parsed.key_terms) ? parsed.key_terms.length : 0;
      const researchQueriesCount = Array.isArray(parsed.research_plan?.queries) ? parsed.research_plan.queries.length : 0;
      const glossaryTermsCount = Array.isArray(parsed.glossary_plan?.terms) ? parsed.glossary_plan.terms.length : 0;
      const chunksSourcesCount = Array.isArray(parsed.chunks_plan?.sources) ? parsed.chunks_plan.sources.length : 0;

      console.log(`[blueprint] LLM response validation - attempt ${attempt + 1}:`, {
        important_details: importantDetailsCount,
        inferred_topics: inferredTopicsCount,
        key_terms: keyTermsCount,
        research_queries: researchQueriesCount,
        glossary_terms: glossaryTermsCount,
        chunks_sources: chunksSourcesCount,
      });

      // Check if validation passes
      const validationPassed = 
        importantDetailsCount >= 5 &&
        inferredTopicsCount >= 5 &&
        keyTermsCount >= 10 &&
        researchQueriesCount >= 5 &&
        glossaryTermsCount >= 10 &&
        chunksSourcesCount >= 3;

      if (validationPassed) {
        console.log(`[blueprint] Validation passed on attempt ${attempt + 1}`);
        break; // Success, exit retry loop
      } else {
        // Validation failed, log what's missing
        const missing: string[] = [];
        if (importantDetailsCount < 5) missing.push(`important_details (${importantDetailsCount}/5)`);
        if (inferredTopicsCount < 5) missing.push(`inferred_topics (${inferredTopicsCount}/5)`);
        if (keyTermsCount < 10) missing.push(`key_terms (${keyTermsCount}/10)`);
        if (researchQueriesCount < 5) missing.push(`research_queries (${researchQueriesCount}/5)`);
        if (glossaryTermsCount < 10) missing.push(`glossary_terms (${glossaryTermsCount}/10)`);
        if (chunksSourcesCount < 3) missing.push(`chunks_sources (${chunksSourcesCount}/3)`);
        
        console.warn(`[blueprint] Validation failed on attempt ${attempt + 1}. Missing: ${missing.join(', ')}`);
        
        if (attempt < maxRetries) {
          attempt++;
          continue; // Retry
        } else {
          // All retries exhausted, use parsed but log critical error
          console.error(`[blueprint] All retries exhausted. Using response with insufficient data: ${missing.join(', ')}`);
          break;
        }
      }
    } catch (error: any) {
      lastError = error;
      console.error(`[blueprint] Error on attempt ${attempt + 1}: ${error.message}`);
      
      if (attempt < maxRetries) {
        attempt++;
        continue; // Retry
      } else {
        // All retries exhausted, rethrow
        throw new Error(`Failed to generate blueprint after ${maxRetries + 1} attempts: ${error.message}`);
      }
    }
  }

  if (!parsed) {
    throw new Error(`Failed to parse LLM response: ${lastError?.message || 'Unknown error'}`);
  }

  // Validate and normalize the blueprint
  const blueprint: Blueprint = {
    important_details: (Array.isArray(parsed.important_details) && parsed.important_details.length >= 5)
      ? parsed.important_details.filter((item: any) => item && typeof item === 'string' && item.trim().length > 0)
      : (parsed.important_details || []).length > 0
        ? parsed.important_details
        : [`Event focuses on ${topic} - content generation failed, please regenerate blueprint`],
    
    inferred_topics: (Array.isArray(parsed.inferred_topics) && parsed.inferred_topics.length >= 5)
      ? parsed.inferred_topics.filter((item: any) => item && typeof item === 'string' && item.trim().length > 0)
      : (parsed.inferred_topics || []).length > 0
        ? parsed.inferred_topics
        : [`${topic} Fundamentals`, `${topic} Best Practices`],
    
    key_terms: (Array.isArray(parsed.key_terms) && parsed.key_terms.length >= 10)
      ? parsed.key_terms.filter((item: any) => item && typeof item === 'string' && item.trim().length > 0)
      : (parsed.key_terms || []).length > 0
        ? parsed.key_terms
        : [topic],
    
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

  // Apply minimal fallbacks only if arrays are still empty after all retries
  if (blueprint.research_plan.queries.length === 0) {
    blueprint.research_plan.queries = [{
      query: `latest developments and trends in ${topic} 2024`,
      api: 'exa' as const,
      priority: 1,
      estimated_cost: 0.03,
    }];
    blueprint.research_plan.total_searches = 1;
    blueprint.research_plan.estimated_total_cost = 0.03;
    console.error(`[blueprint] CRITICAL: Research plan queries empty after all retries, using minimal fallback`);
  }

  if (blueprint.glossary_plan.terms.length === 0) {
    blueprint.glossary_plan.terms = [{
      term: topic,
      is_acronym: false,
      category: 'domain-specific',
      priority: 1,
    }];
    blueprint.glossary_plan.estimated_count = 1;
    console.error(`[blueprint] CRITICAL: Glossary plan terms empty after all retries, using minimal fallback`);
  }

  if (blueprint.chunks_plan.sources.length === 0) {
    blueprint.chunks_plan.sources = [{
      source: 'llm_generated',
      priority: 1,
      estimated_chunks: blueprint.chunks_plan.target_count || 500,
    }];
    console.error(`[blueprint] CRITICAL: Chunks plan sources empty after all retries, using minimal fallback`);
  }

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

    console.log(`[blueprint] LLM generated blueprint with ${blueprint.important_details.length} important details, ${blueprint.inferred_topics.length} inferred topics, ${blueprint.key_terms.length} key terms, ${blueprint.research_plan.queries.length} research queries, ${blueprint.glossary_plan.terms.length} glossary terms, target ${blueprint.chunks_plan.target_count} chunks`);
    
    return blueprint;
}
