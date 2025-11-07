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

import type { SupabaseClient } from '@supabase/supabase-js';
import type OpenAI from 'openai';
import {
  BLUEPRINT_GENERATION_SYSTEM_PROMPT,
  createBlueprintUserPrompt,
} from '../../prompts';
import {
  calculateOpenAICost,
  getPricingVersion,
  type OpenAIUsage,
} from './pricing-config';
import { ensureBlueprintShape } from '../../lib/context-normalization';

type WorkerSupabaseClient = SupabaseClient;

// ============================================================================
// Type Definitions
// ============================================================================

export interface BlueprintGeneratorOptions {
  supabase: WorkerSupabaseClient;
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

type SupabaseErrorLike = { message: string } | null;

type SupabaseMutationResult = { error: SupabaseErrorLike };

type SupabaseSingleResult<T> = {
  data: T | null;
  error: SupabaseErrorLike;
};

type SupabaseListResult<T> = {
  data: T[] | null;
  error: SupabaseErrorLike;
};

type BlueprintWithUsage = Blueprint & {
  __actualUsage?: OpenAIUsage | null;
};

type EventRecord = { id: string; title: string; topic: string | null };
type BlueprintRecord = { id: string };
type GenerationCycleRecord = { id: string };
type ChatCompletionRequest = Parameters<OpenAI['chat']['completions']['create']>[0];
const asDbPayload = <T>(payload: T) => payload as unknown as never;

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
  supabase: WorkerSupabaseClient
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
  // TODO: narrow unknown -> PostgrestError | Error after upstream callsite analysis
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[blueprint] Error extracting documents: ${message}`);
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
    // 1. Update agent to ensure it's in the correct state for blueprint generation
    // Status should be 'idle' with stage 'blueprint' (already set by /start endpoint)
    // We just ensure it's correct - no need to change status during generation
    const { error: statusError }: SupabaseMutationResult = await supabase
      .from('agents')
      .update(asDbPayload({ status: 'idle', stage: 'blueprint' }))
      .eq('id', agentId);

    if (statusError) {
      throw new Error(`Failed to update agent status: ${statusError.message}`);
    }

    // 2. Fetch event data
    const {
      data: event,
      error: eventError,
    }: SupabaseSingleResult<EventRecord> = await supabase
      .from('events')
      .select('id, title, topic')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      throw new Error(`Failed to fetch event: ${eventError?.message || 'Event not found'}`);
    }

    console.log(`[blueprint] Event: ${event.title}, Topic: ${event.topic || 'N/A'}`);

    // 3. Extract text from documents (if any)
    const documentsText = await extractDocumentsText(eventId, supabase);
    const hasDocuments = documentsText.length > 0 && !documentsText.includes('will be available');

    // 4. Insert blueprint record with 'generating' status first (so we can create generation cycle)
    const {
      data: blueprintRecord,
      error: insertError,
    }: SupabaseSingleResult<BlueprintRecord> = await supabase
      .from('context_blueprints')
      .insert(asDbPayload({
        event_id: eventId,
        agent_id: agentId,
        status: 'generating',
      }))
      .select('id')
      .single();

    if (insertError || !blueprintRecord) {
      throw new Error(`Failed to create blueprint record: ${insertError?.message || 'Insert failed'}`);
    }

    const blueprintId = blueprintRecord.id;
    console.log(`[blueprint] Blueprint record created with ID: ${blueprintId}`);

    // 5. Create generation cycle for blueprint generation (to track costs)
    let generationCycleId: string | null = null;
    try {
      const {
        data: cycleData,
        error: cycleError,
      }: SupabaseSingleResult<GenerationCycleRecord> = await supabase
        .from('generation_cycles')
        .insert(asDbPayload({
          event_id: eventId,
          agent_id: agentId,
          blueprint_id: blueprintId,
          cycle_type: 'blueprint',
          component: 'blueprint',
          status: 'processing',
          progress_current: 0,
          progress_total: 0,
        }))
        .select('id')
        .single();

      if (!cycleError && cycleData) {
        generationCycleId = cycleData.id;
        console.log(`[blueprint] Generation cycle created with ID: ${generationCycleId}`);
      } else {
        console.warn(`[blueprint] Failed to create generation cycle: ${cycleError?.message || 'Unknown error'}`);
      }
    // TODO: narrow unknown -> PostgrestError after upstream callsite analysis
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[blueprint] Error creating generation cycle: ${message}`);
    }

    // 6. Generate blueprint using LLM
    const blueprint = await generateBlueprintWithLLM(
      event.title,
      event.topic,
      documentsText,
      hasDocuments,
      openai,
      genModel
    );

    // 7. Update blueprint with generated data and mark as 'ready'
    const { error: updateError }: SupabaseMutationResult = await supabase
      .from('context_blueprints')
      .update(asDbPayload({
        status: 'ready',
        blueprint,
        important_details: blueprint.important_details,
        inferred_topics: blueprint.inferred_topics,
        key_terms: blueprint.key_terms,
        research_plan: blueprint.research_plan,
        research_apis: blueprint.research_plan.queries.map(q => q.api),
        research_search_count: blueprint.research_plan.total_searches,
        estimated_cost: blueprint.cost_breakdown.total,
        glossary_plan: blueprint.glossary_plan,
        chunks_plan: blueprint.chunks_plan,
        target_chunk_count: blueprint.chunks_plan.target_count,
        quality_tier: blueprint.chunks_plan.quality_tier,
      }))
      .eq('id', blueprintId);

    if (updateError) {
      throw new Error(`Failed to update blueprint: ${updateError.message}`);
    }

    console.log(`[blueprint] Blueprint updated with generated data and marked as ready`);

    // 8. Update generation cycle with cost information and mark as completed
    if (generationCycleId) {
      try {
        // Calculate actual cost from LLM usage (passed from generateBlueprintWithLLM)
        const actualUsage = blueprint.__actualUsage ?? null;
        let actualCost = 0;
        const estimatedCost = blueprint.cost_breakdown.total || 0;

        if (actualUsage) {
          actualCost = calculateOpenAICost(actualUsage, genModel, false);
          console.log(`[blueprint] Actual LLM cost: $${actualCost.toFixed(4)} (tokens: ${actualUsage.prompt_tokens} prompt + ${actualUsage.completion_tokens} completion = ${actualUsage.total_tokens} total)`);
        } else {
          console.warn(`[blueprint] No usage data available, using estimated cost: $${estimatedCost.toFixed(4)}`);
          actualCost = estimatedCost;
        }

        // Store cost metadata in generation cycle (following pattern from other cycles)
        const costMetadata = {
          cost_breakdown: {
            openai: {
              total: actualCost,
              chat_completions: [{
                cost: actualCost,
                model: genModel,
                prompt_tokens: actualUsage?.prompt_tokens ?? 0,
                completion_tokens: actualUsage?.completion_tokens ?? 0,
                total_tokens: actualUsage?.total_tokens ?? 0,
              }],
            },
          },
          estimated_cost: estimatedCost,
          actual_cost: actualCost,
          tracked_at: new Date().toISOString(),
          pricing_version: getPricingVersion(),
        };

        const { error: cycleUpdateError }: SupabaseMutationResult = await supabase
          .from('generation_cycles')
          .update(asDbPayload({
            status: 'completed',
            progress_current: 1,
            progress_total: 1,
            metadata: costMetadata,
          }))
          .eq('id', generationCycleId);

        if (cycleUpdateError) {
          console.warn(`[blueprint] Failed to update generation cycle: ${cycleUpdateError.message}`);
        } else {
          console.log(`[blueprint] Generation cycle updated with actual cost: $${actualCost.toFixed(4)}`);
        }
      // TODO: narrow unknown -> PostgrestError after upstream callsite analysis
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[blueprint] Error updating generation cycle: ${message}`);
      }
    }

    // 9. Mark any remaining non-superseded blueprints as superseded (safety check)
    // The API endpoint should have already handled this, but we do it here as a safety measure
    const {
      data: existingBlueprints,
      error: checkError,
    }: SupabaseListResult<BlueprintRecord> = await supabase
      .from('context_blueprints')
      .select('id')
      .eq('agent_id', agentId)
      .neq('id', blueprintId)
      .in('status', ['generating', 'ready', 'approved']);

    if (!checkError && existingBlueprints && existingBlueprints.length > 0) {
      const blueprintIds = existingBlueprints.map((b: { id: string }) => b.id);

      // Mark blueprints as superseded
      const { error: supersedeError }: SupabaseMutationResult = await supabase
        .from('context_blueprints')
        .update(asDbPayload({
          status: 'superseded',
          superseded_at: new Date().toISOString(),
        }))
        .eq('agent_id', agentId)
        .neq('id', blueprintId)
        .in('status', ['generating', 'ready', 'approved']);

      if (supersedeError) {
        console.warn(`[blueprint] Warning: Failed to mark existing blueprints as superseded: ${supersedeError.message}`);
        // Don't throw - new blueprint is created, this is just cleanup
      } else {
        console.log(`[blueprint] Marked ${existingBlueprints.length} existing blueprint(s) as superseded`);

        // Mark blueprint generation cycles as superseded
        const { error: blueprintCycleError }: SupabaseMutationResult = await supabase
          .from('generation_cycles')
          .update(asDbPayload({ status: 'superseded' }))
          .eq('event_id', eventId)
          .in('blueprint_id', blueprintIds)
          .eq('cycle_type', 'blueprint')
          .in('status', ['started', 'processing', 'completed']);

        if (blueprintCycleError) {
          console.warn(`[blueprint] Warning: Failed to mark blueprint cycles as superseded: ${blueprintCycleError.message}`);
        }

        // Mark downstream generation cycles (research, glossary, chunks) as superseded
        // These cycles are associated with the superseded blueprints
        const { error: downstreamCycleError }: SupabaseMutationResult = await supabase
          .from('generation_cycles')
          .update(asDbPayload({ status: 'superseded' }))
          .eq('event_id', eventId)
          .in('blueprint_id', blueprintIds)
          .in('cycle_type', ['research', 'glossary', 'chunks'])
          .in('status', ['started', 'processing', 'completed']);

        if (downstreamCycleError) {
          console.warn(`[blueprint] Warning: Failed to mark downstream cycles as superseded: ${downstreamCycleError.message}`);
        }

        console.log(`[blueprint] Marked associated generation cycles as superseded`);
      }
    }

    // 6. Agent remains in 'idle' status with 'blueprint' stage
    // The blueprint is now ready for approval - no status change needed
    // The agent status/stage is already correct (idle/blueprint) and will be updated
    // when the blueprint is approved or when the user starts the next phase

    console.log(`[blueprint] Blueprint generation complete for event ${eventId}`);
    return blueprintId;
  // TODO: narrow unknown -> PostgrestError | Error after upstream callsite analysis
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[blueprint] Error generating blueprint: ${message}`);
    
    // Update agent status to error
    try {
      await supabase
        .from('agents')
        .update(asDbPayload({ status: 'error' }))
        .eq('id', agentId);
    // TODO: narrow unknown -> PostgrestError after upstream callsite analysis
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : String(err);
      console.error(`[blueprint] Failed to update agent status to error: ${errMessage}`);
    }

    // Try to store error in blueprint record if it exists
    try {
      // Find the blueprint record that was created (if any)
      const {
        data: blueprintRecords,
      }: SupabaseListResult<BlueprintRecord> = await supabase
        .from('context_blueprints')
        .select('id')
        .eq('agent_id', agentId)
        .eq('status', 'generating')
        .order('created_at', { ascending: false })
        .limit(1);

      if (blueprintRecords && blueprintRecords.length > 0) {
        const blueprintId = blueprintRecords[0].id;
        
        // Update blueprint status to error
        await supabase
          .from('context_blueprints')
          .update(asDbPayload({
            status: 'error',
            error_message: message,
          }))
          .eq('id', blueprintId);

        // Update generation cycle to failed if it exists
        const {
          data: cycles,
        }: SupabaseListResult<GenerationCycleRecord> = await supabase
          .from('generation_cycles')
          .select('id')
          .eq('blueprint_id', blueprintId)
          .eq('cycle_type', 'blueprint')
          .in('status', ['started', 'processing']);

        if (cycles && cycles.length > 0) {
          await supabase
            .from('generation_cycles')
            .update(asDbPayload({
              status: 'failed',
              error_message: message,
            }))
            .in('id', cycles.map(c => c.id));
        }
      }
    // TODO: narrow unknown -> PostgrestError after upstream callsite analysis
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : String(err);
      console.error(`[blueprint] Failed to update blueprint/generation cycle error status: ${errMessage}`);
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
): Promise<BlueprintWithUsage> {
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
  let parsedBlueprint: Blueprint | null = null;
  let lastError: Error | null = null;
  let totalUsage: OpenAIUsage | null = null; // Track cumulative usage across retries

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
      const requestOptions: ChatCompletionRequest = {
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

      const response = await openai.chat.completions.create(
        requestOptions
      ) as OpenAI.Chat.Completions.ChatCompletion;

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from LLM');
      }

      // Track actual usage for cost calculation (accumulate across retries)
      const attemptUsage: OpenAIUsage | null = response.usage ? {
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens ?? 0,
        total_tokens: response.usage.total_tokens ?? (response.usage.prompt_tokens + (response.usage.completion_tokens ?? 0)),
      } : null;

      // Accumulate usage across retry attempts
      if (attemptUsage) {
        if (totalUsage) {
          totalUsage = {
            prompt_tokens: totalUsage.prompt_tokens + attemptUsage.prompt_tokens,
            completion_tokens: (totalUsage.completion_tokens ?? 0) + (attemptUsage.completion_tokens ?? 0),
            total_tokens: totalUsage.total_tokens + attemptUsage.total_tokens,
          };
        } else {
          totalUsage = attemptUsage;
        }
      }

      const parsedJson = JSON.parse(content) as unknown;
      const ensuredBlueprint = ensureBlueprintShape(parsedJson);
      parsedBlueprint = ensuredBlueprint;

      // Validate array lengths
      const importantDetailsCount = parsedBlueprint.important_details.length;
      const inferredTopicsCount = parsedBlueprint.inferred_topics.length;
      const keyTermsCount = parsedBlueprint.key_terms.length;
      const researchQueriesCount = parsedBlueprint.research_plan.queries.length;
      const glossaryTermsCount = parsedBlueprint.glossary_plan.terms.length;
      const chunksSourcesCount = parsedBlueprint.chunks_plan.sources.length;

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
    // TODO: narrow unknown -> OpenAIAPIError after upstream callsite analysis
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[blueprint] Error on attempt ${attempt + 1}: ${message}`);
      
      if (attempt < maxRetries) {
        attempt++;
        continue; // Retry
      } else {
        // All retries exhausted, rethrow
        throw new Error(`Failed to generate blueprint after ${maxRetries + 1} attempts: ${message}`);
      }
    }
  }

  if (!parsedBlueprint) {
    throw new Error(`Failed to parse LLM response: ${lastError?.message || 'Unknown error'}`);
  }

  const isMeaningfulString = (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0;

  // Validate and normalize the blueprint using shared helpers
  const blueprint: BlueprintWithUsage = {
    ...parsedBlueprint,
    important_details: [...parsedBlueprint.important_details],
    inferred_topics: [...parsedBlueprint.inferred_topics],
    key_terms: [...parsedBlueprint.key_terms],
    research_plan: {
      ...parsedBlueprint.research_plan,
      queries: [...parsedBlueprint.research_plan.queries],
    },
    glossary_plan: {
      ...parsedBlueprint.glossary_plan,
      terms: [...parsedBlueprint.glossary_plan.terms],
    },
    chunks_plan: {
      ...parsedBlueprint.chunks_plan,
      sources: [...parsedBlueprint.chunks_plan.sources],
    },
    cost_breakdown: { ...parsedBlueprint.cost_breakdown },
  };

  if (blueprint.important_details.length >= 5) {
    blueprint.important_details = blueprint.important_details.filter(isMeaningfulString);
  } else if (blueprint.important_details.length === 0) {
    blueprint.important_details = [`Event focuses on ${topic} - content generation failed, please regenerate blueprint`];
  }

  if (blueprint.inferred_topics.length >= 5) {
    blueprint.inferred_topics = blueprint.inferred_topics.filter(isMeaningfulString);
  } else if (blueprint.inferred_topics.length === 0) {
    blueprint.inferred_topics = [`${topic} Fundamentals`, `${topic} Best Practices`];
  }

  if (blueprint.key_terms.length >= 10) {
    blueprint.key_terms = blueprint.key_terms.filter(isMeaningfulString);
  } else if (blueprint.key_terms.length === 0) {
    blueprint.key_terms = [topic];
  }

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
    
    // Attach actual usage for cost calculation (will be removed before storing in DB)
    if (totalUsage) {
      blueprint.__actualUsage = totalUsage;
    }
    
    return blueprint;
}
