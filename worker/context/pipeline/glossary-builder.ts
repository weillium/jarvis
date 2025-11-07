/**
 * Glossary Builder
 * Builds glossary from blueprint plan and research results
 * Stores terms, definitions, acronyms, and related metadata in glossary_terms table
 */

import type { createClient } from '@supabase/supabase-js';
import type OpenAI from 'openai';
import { Exa } from 'exa-js';
import type { Blueprint } from './blueprint-generator';
import {
  calculateOpenAICost,
  calculateExaAnswerCost,
  getPricingVersion,
  type OpenAIUsage,
} from './pricing-config';
import {
  EXA_ANSWER_SYSTEM_PROMPT,
  GLOSSARY_DEFINITION_SYSTEM_PROMPT,
  createGlossaryDefinitionUserPrompt,
  EXA_ANSWER_TRANSFORM_SYSTEM_PROMPT,
  createExaAnswerTransformUserPrompt,
} from '../../prompts';

export interface GlossaryBuilderOptions {
  supabase: ReturnType<typeof createClient>;
  openai: OpenAI;
  genModel: string;
  embedModel: string;
  exaApiKey?: string; // Optional Exa API key for authoritative definitions
}

export type ResearchChunkMetadata = {
  api?: string;
  quality_score?: number;
} & Record<string, unknown>;

export interface ResearchResults {
  chunks: Array<{
    text: string;
    source: string;
    metadata?: ResearchChunkMetadata;
  }>;
}
type ResearchChunk = ResearchResults['chunks'][number];

/**
 * Build glossary from blueprint plan and research results
 * Fetches research from research_results table if not provided
 */
export interface GlossaryCostBreakdown {
  openai: {
    total: number;
    chat_completions: Array<{ cost: number; usage: OpenAIUsage; model: string }>;
  };
  exa: {
    total: number;
    answer: { cost: number; queries: number };
  };
}

export interface GlossaryBuildResult {
  termCount: number;
  costBreakdown: GlossaryCostBreakdown;
}

type SupabaseErrorLike = { message: string } | null;
type SupabaseMutationResult = { error: SupabaseErrorLike };
type SupabaseListResult<T> = { data: T[] | null; error: SupabaseErrorLike };
type IdRow = { id: string };
type ResearchResultRecord = {
  content: string;
  metadata: ResearchChunkMetadata | null;
  query: string | null;
  api: string | null;
};
type ChatCompletionRequest = Parameters<OpenAI['chat']['completions']['create']>[0];
type GlossaryPlanTerm = {
  term: string;
  is_acronym: boolean;
  category: string;
  priority: number;
};
const asDbPayload = <T>(payload: T) => payload as unknown as never;
type ErrorWithResponse = Error & { response?: { data?: unknown } };

export async function buildGlossary(
  eventId: string,
  blueprintId: string,
  generationCycleId: string,
  blueprint: Blueprint,
  researchResults: ResearchResults | null,
  options: GlossaryBuilderOptions
): Promise<GlossaryBuildResult> {
  const { supabase, openai, genModel, exaApiKey } = options;

  console.log(`[glossary] Building glossary for event ${eventId}, cycle ${generationCycleId}`);
  console.log(`[glossary] Blueprint has ${blueprint.glossary_plan.terms.length} terms planned`);

  const termsToBuild = blueprint.glossary_plan.terms || [];
  if (termsToBuild.length === 0) {
    console.log(`[glossary] No terms to build, skipping`);
    return {
      termCount: 0,
      costBreakdown: {
        openai: { total: 0, chat_completions: [] },
        exa: { total: 0, answer: { cost: 0, queries: 0 } },
      },
    };
  }

  // Initialize cost tracking
  const costBreakdown: GlossaryCostBreakdown = {
    openai: {
      total: 0,
      chat_completions: [],
    },
    exa: {
      total: 0,
      answer: { cost: 0, queries: 0 },
    },
  };

  // Fetch research from research_results table if not provided
  // Exclude research from superseded generation cycles
  let research: ResearchResults;
  if (!researchResults) {
    // First, get all active (non-superseded) generation cycle IDs for research
    const {
      data: activeCycles,
      error: cycleError,
    }: SupabaseListResult<IdRow> = await supabase
      .from('generation_cycles')
      .select('id')
      .eq('event_id', eventId)
      .neq('status', 'superseded')
      .in('cycle_type', ['research']);

    if (cycleError) {
      console.warn(`[glossary] Warning: Failed to fetch active research cycles: ${cycleError.message}`);
    }

    // Build list of active cycle IDs
    const activeCycleIds: string[] = [];
    if (activeCycles && activeCycles.length > 0) {
      activeCycleIds.push(...activeCycles.map((cycle: IdRow) => cycle.id));
    }

    // Fetch research results only from active cycles (or legacy items)
    let researchQuery = supabase
      .from('research_results')
      .select('content, metadata, query, api')
      .eq('event_id', eventId)
      .eq('blueprint_id', blueprintId);

    if (activeCycleIds.length > 0) {
      // Include items with null generation_cycle_id OR items from active cycles
      researchQuery = researchQuery.or(`generation_cycle_id.is.null,generation_cycle_id.in.(${activeCycleIds.join(',')})`);
    } else {
      // If no active cycles, only show legacy items (null generation_cycle_id)
      researchQuery = researchQuery.is('generation_cycle_id', null);
    }

    const {
      data: researchData,
      error: researchError,
    }: SupabaseListResult<ResearchResultRecord> = await researchQuery;

    if (researchError) {
      console.warn(`[glossary] Warning: Failed to fetch research results: ${researchError.message}`);
    }

    research = {
      chunks: (researchData ?? []).map((item: ResearchResultRecord) => ({
        text: item.content,
        source: item.api || 'research',
        metadata: item.metadata || undefined,
      })),
    };
  } else {
    research = researchResults;
  }

  // Legacy deletion code removed - we now use superseding approach
  // Old glossary terms are marked as superseded via generation cycles, not deleted

  // Extract context from research results
  const researchContext = research.chunks
    .map((chunk: ResearchChunk) => chunk.text)
    .join('\n\n')
    .substring(0, 10000); // Limit context size

  let insertedCount = 0;

  // Update generation cycle progress
  const { error: processingError }: SupabaseMutationResult = await supabase
    .from('generation_cycles')
    .update(asDbPayload({
      status: 'processing',
      progress_total: termsToBuild.length,
    }))
    .eq('id', generationCycleId);

  if (processingError) {
    console.warn(`[glossary] Failed to mark cycle ${generationCycleId} as processing: ${processingError.message}`);
  }

  // Process terms in batches to avoid rate limits
  const batchSize = 5;
  for (let i = 0; i < termsToBuild.length; i += batchSize) {
    const batch = termsToBuild.slice(i, i + batchSize);
    
    try {
      const { definitions } = await generateTermDefinitions(
        batch,
        researchContext,
        blueprint.important_details.join('\n'),
        openai,
        genModel,
        exaApiKey ? new Exa(exaApiKey) : undefined,
        costBreakdown
      );

      // Store definitions in database
      for (const def of definitions) {
        try {
          const { error: insertError }: SupabaseMutationResult = await supabase
            .from('glossary_terms')
            .insert(asDbPayload({
              event_id: eventId,
              generation_cycle_id: generationCycleId,
              term: def.term,
              definition: def.definition,
              acronym_for: def.acronym_for || null,
              category: def.category || 'general',
              usage_examples: def.usage_examples || [],
              related_terms: def.related_terms || [],
              confidence_score: def.confidence_score || 0.8,
              source: def.source || 'llm_generation',
              source_url: def.source_url || null,
            }));

          if (insertError) {
            console.error(`[glossary] Error inserting term "${def.term}": ${insertError.message}`);
          } else {
            insertedCount++;
            // Update progress
            const { error: progressError }: SupabaseMutationResult = await supabase
              .from('generation_cycles')
              .update(asDbPayload({ progress_current: insertedCount }))
              .eq('id', generationCycleId);

            if (progressError) {
              console.warn(`[glossary] Failed to update cycle progress for ${generationCycleId}: ${progressError.message}`);
            }
          }
        // TODO: narrow unknown -> PostgrestError after upstream callsite analysis
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[glossary] Error processing term "${def.term}": ${message}`);
        }
      }
    // TODO: narrow unknown -> OpenAIAPIError after upstream callsite analysis
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[glossary] Error processing batch: ${message}`);
    }
  }

  // Calculate total cost and store in cycle metadata
  const totalCost = costBreakdown.openai.total + costBreakdown.exa.total;
  const costMetadata = {
    cost: {
      total: totalCost,
      currency: 'USD',
      breakdown: {
        openai: {
          total: costBreakdown.openai.total,
          chat_completions: costBreakdown.openai.chat_completions,
        },
        exa: {
          total: costBreakdown.exa.total,
          answer: costBreakdown.exa.answer,
        },
      },
      tracked_at: new Date().toISOString(),
      pricing_version: getPricingVersion(),
    },
  };

  // Mark cycle as completed with cost metadata
  const { error: cycleUpdateError }: SupabaseMutationResult = await supabase
    .from('generation_cycles')
    .update(asDbPayload({
      status: 'completed',
      progress_current: insertedCount,
      completed_at: new Date().toISOString(),
      metadata: costMetadata,
    }))
    .eq('id', generationCycleId);

  if (cycleUpdateError) {
    console.error(`[glossary] ERROR: Failed to update generation cycle to completed: ${cycleUpdateError.message}`);
    throw new Error(`Failed to update generation cycle: ${cycleUpdateError.message}`);
  }

  console.log(`[glossary] Inserted ${insertedCount} glossary terms for event ${eventId}`);
  console.log(`[glossary] Generation cycle ${generationCycleId} marked as completed`);
  return {
    termCount: insertedCount,
    costBreakdown,
  };
}

interface TermDefinition {
  term: string;
  definition: string;
  acronym_for?: string;
  category: string;
  usage_examples?: string[];
  related_terms?: string[];
  confidence_score?: number;
  source?: string;
  source_url?: string;
}

/**
 * Generate definitions for terms using Exa /answer for high-priority terms, LLM for others
 */
async function generateTermDefinitions(
  terms: Array<{ term: string; is_acronym: boolean; category: string; priority: number }>,
  researchContext: string,
  importantDetails: string,
  openai: OpenAI,
  genModel: string,
  exa?: Exa,
  costBreakdown?: GlossaryCostBreakdown
): Promise<{ definitions: TermDefinition[]; batchCostBreakdown: GlossaryCostBreakdown }> {
  const definitions: TermDefinition[] = [];
  const termsForLLM: Array<{ term: string; is_acronym: boolean; category: string; priority: number }> = [];
  
  // Initialize batch cost breakdown
  const batchCostBreakdown: GlossaryCostBreakdown = {
    openai: {
      total: 0,
      chat_completions: [],
    },
    exa: {
      total: 0,
      answer: { cost: 0, queries: 0 },
    },
  };

  // Process high-priority terms (priority <= 3) with Exa /answer if available
  for (const term of terms) {
    if (term.priority <= 3 && exa) {
      try {
        console.log(`[glossary] Using Exa /answer for high-priority term (priority ${term.priority}): ${term.term}`);
        
        const answer = await exa.answer(`What is ${term.term}?`, {
          text: true,
          systemPrompt: EXA_ANSWER_SYSTEM_PROMPT,
        });

        const answerText = typeof answer.answer === 'string' ? answer.answer.trim() : '';
        if (answerText) {
          // Extract source URL from citations if available
          const sourceUrl = Array.isArray(answer.citations) && answer.citations.length > 0
            ? answer.citations[0]?.url 
            : undefined;

          // Transform Exa markdown answer into structured glossary format using LLM
          const transformedDef = await transformExaAnswerToGlossary(
            term.term,
            term.is_acronym,
            term.category,
            answerText,
            sourceUrl,
            openai,
            genModel
          );

          if (transformedDef) {
            definitions.push(transformedDef);
            console.log(`[glossary] Generated definition for "${term.term}" using Exa /answer (transformed to glossary format)`);
            
            // Track Exa answer cost
            const answerCost = calculateExaAnswerCost(1);
            batchCostBreakdown.exa.total += answerCost;
            batchCostBreakdown.exa.answer.cost += answerCost;
            batchCostBreakdown.exa.answer.queries += 1;
            
            continue; // Skip LLM generation for this term
          } else {
            console.warn(`[glossary] Failed to transform Exa answer for "${term.term}", falling back to LLM`);
            // Fall through to LLM generation
          }
        }
      // TODO: narrow unknown -> ExaAPIError after upstream callsite analysis
      } catch (exaError: unknown) {
        const message = exaError instanceof Error ? exaError.message : String(exaError);
        console.warn(`[glossary] Exa /answer failed for term "${term.term}": ${message}. Falling back to LLM.`);
        // Fall through to LLM generation
      }
    }

    // Add to LLM batch if Exa wasn't used or failed
    termsForLLM.push(term);
  }

  // Generate remaining terms with LLM
  if (termsForLLM.length > 0) {
    const systemPrompt = GLOSSARY_DEFINITION_SYSTEM_PROMPT;

    const termsList = termsForLLM
      .map((term: GlossaryPlanTerm) => `- ${term.term}${term.is_acronym ? ' (acronym)' : ''} - ${term.category}`)
      .join('\n');

    const userPrompt = createGlossaryDefinitionUserPrompt(
      termsList,
      researchContext,
      importantDetails
    );

    try {
      // Some models (like o1, o1-preview, o1-mini, gpt-5) don't support custom temperature values
      // Only set temperature if model supports custom values
      // Check for models that only support default temperature (1) or don't support it at all
      const modelLower = genModel.toLowerCase();
      const isO1Model = modelLower.startsWith('o1');
      const isGpt5Model = modelLower.includes('gpt-5') || modelLower.startsWith('gpt5');
      const onlySupportsDefaultTemp = isO1Model || isGpt5Model;
      const supportsCustomTemperature = !onlySupportsDefaultTemp;
      
      if (onlySupportsDefaultTemp) {
        console.log(`[glossary] Model "${genModel}" only supports default temperature (1), skipping custom temperature setting`);
      }
      
      // Build request options - conditionally include temperature
      const requestOptions: ChatCompletionRequest = {
        model: genModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      };
      
      // Only add temperature if model supports custom temperature values
      if (supportsCustomTemperature) {
        requestOptions.temperature = 0.5; // Lower temperature for more consistent definitions
      }
      
      const response = await openai.chat.completions.create(
        requestOptions
      ) as OpenAI.Chat.Completions.ChatCompletion;

      // Track OpenAI cost
      if (response.usage) {
        const usage = response.usage;
        const cost = calculateOpenAICost(usage, genModel, false);
        batchCostBreakdown.openai.total += cost;
        batchCostBreakdown.openai.chat_completions.push({
          cost,
          usage: {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens,
            total_tokens: usage.total_tokens,
          },
          model: genModel,
        });
      }

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from LLM');
      }

      const parsed: unknown = JSON.parse(content);
      // Handle both "definitions" and "terms" keys (json_object format always returns object)
      const llmDefinitions =
        (parsed as { definitions?: unknown; terms?: unknown }).definitions ??
        (parsed as { definitions?: unknown; terms?: unknown }).terms ??
        [];

      if (!Array.isArray(llmDefinitions)) {
        throw new Error('LLM did not return array of definitions');
      }

      // Validate and normalize definitions
      const normalizedLLMDefinitions = llmDefinitions.map((def: unknown) => {
        const normalized = def as Partial<TermDefinition>;
        return {
          term: normalized.term || '',
          definition: normalized.definition || '',
          acronym_for: normalized.acronym_for || undefined,
          category: normalized.category || 'general',
          usage_examples: normalized.usage_examples || [],
          related_terms: normalized.related_terms || [],
          confidence_score: normalized.confidence_score || 0.8,
          source: normalized.source || 'llm_generation',
          source_url: normalized.source_url || undefined,
        };
      });

      definitions.push(...normalizedLLMDefinitions);
    // TODO: narrow unknown -> OpenAIAPIError after upstream callsite analysis
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[glossary] Error generating LLM definitions: ${message}`);
      // Return basic definitions on error
      const fallbackDefinitions = termsForLLM.map((term: GlossaryPlanTerm) => ({
        term: term.term,
        definition: `Term: ${term.term}. Definition to be completed.`,
        category: term.category,
        confidence_score: 0.5,
        source: 'llm_generation',
      }));
      definitions.push(...fallbackDefinitions);
    }
  }

  // Merge batch costs into main cost breakdown if provided
  if (costBreakdown) {
    costBreakdown.openai.total += batchCostBreakdown.openai.total;
    costBreakdown.openai.chat_completions.push(...batchCostBreakdown.openai.chat_completions);
    costBreakdown.exa.total += batchCostBreakdown.exa.total;
    costBreakdown.exa.answer.cost += batchCostBreakdown.exa.answer.cost;
    costBreakdown.exa.answer.queries += batchCostBreakdown.exa.answer.queries;
  }

  return { definitions, batchCostBreakdown };
}

/**
 * Transform Exa markdown answer into structured glossary format
 * Extracts clean definition, usage examples, and related terms
 */
async function transformExaAnswerToGlossary(
  term: string,
  isAcronym: boolean,
  category: string,
  exaAnswer: string,
  sourceUrl: string | undefined,
  openai: OpenAI,
  genModel: string
): Promise<TermDefinition | null> {
  try {
    const systemPrompt = EXA_ANSWER_TRANSFORM_SYSTEM_PROMPT;
    const termDescriptor = `- ${term}${isAcronym ? ' (acronym)' : ''} - ${category}`;
    const userPrompt = createExaAnswerTransformUserPrompt(termDescriptor, exaAnswer);

    // Some models (like o1, o1-preview, o1-mini, gpt-5) don't support custom temperature values
    const modelLower = genModel.toLowerCase();
    const isO1Model = modelLower.startsWith('o1');
    const isGpt5Model = modelLower.includes('gpt-5') || modelLower.startsWith('gpt5');
    const onlySupportsDefaultTemp = isO1Model || isGpt5Model;
    const supportsCustomTemperature = !onlySupportsDefaultTemp;

    const requestOptions: ChatCompletionRequest = {
      model: genModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    };

    if (supportsCustomTemperature) {
      requestOptions.temperature = 0.3; // Low temperature for consistent transformation
    }

    const response = await openai.chat.completions.create(
      requestOptions
    ) as OpenAI.Chat.Completions.ChatCompletion;
    const content = response.choices[0]?.message?.content;

    if (!content) {
      console.warn(`[glossary] Empty response when transforming Exa answer for "${term}"`);
      return null;
    }

    try {
      const parsed = JSON.parse(content) as {
        term?: string;
        definition?: string;
        acronym_for?: string;
        category?: string;
        usage_examples?: string[];
        related_terms?: string[];
      };

      if (!parsed.definition || !parsed.definition.trim()) {
        console.warn(`[glossary] Missing definition in transformed Exa answer for "${term}"`);
        return null;
      }

      return {
        term: parsed.term || term,
        definition: parsed.definition.trim(),
        acronym_for: parsed.acronym_for || undefined,
        category: parsed.category || category,
        usage_examples: parsed.usage_examples || [],
        related_terms: parsed.related_terms || [],
        confidence_score: 0.9, // High confidence for Exa answers
        source: 'exa',
        source_url: sourceUrl,
      };
    // TODO: narrow unknown -> SyntaxError after upstream callsite analysis
    } catch (parseError: unknown) {
      const message = parseError instanceof Error ? parseError.message : String(parseError);
      console.warn(`[glossary] Failed to parse transformed Exa answer for "${term}": ${message}`);
      return null;
    }
  // TODO: narrow unknown -> OpenAIAPIError after upstream callsite analysis
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[glossary] Error transforming Exa answer for "${term}": ${message}`);
    return null;
  }
}
