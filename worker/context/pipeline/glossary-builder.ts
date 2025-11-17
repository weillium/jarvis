/**
 * Glossary Builder
 * Builds glossary from blueprint plan and research results
 * Stores terms, definitions, acronyms, and related metadata in glossary_terms table
 */

import type OpenAI from 'openai';
import { Exa } from 'exa-js';
import type { Blueprint } from './blueprint/types';
import type {
  SupabaseMutationResult,
} from './blueprint/types';
import { getPricingVersion } from '../../lib/pricing';
import type { WorkerSupabaseClient } from '../../services/supabase';
import {
  fetchActiveResearchResults,
  insertGlossaryTerm,
  updateGlossaryCycle,
} from './glossary/persistence';
import type { ResearchResults, GlossaryCostBreakdown, GlossaryPlanTerm } from './glossary/types';
import { selectGlossaryTerms } from './glossary/term-selector';
import { generateTermDefinitions } from './glossary/definition-runner';

export interface GlossaryBuilderOptions {
  supabase: WorkerSupabaseClient;
  openai: OpenAI;
  genModel: string;
  glossaryModel: string;
  embedModel: string;
  exaApiKey?: string; // Optional Exa API key for authoritative definitions
}

export interface GlossaryBuildResult {
  termCount: number;
  costBreakdown: GlossaryCostBreakdown;
}

type GenerationCycleUpdate = Partial<{
  status: string;
  progress_total: number;
  progress_current: number;
  completed_at: string;
  metadata: Record<string, unknown>;
}>;

export async function buildGlossary(
  eventId: string,
  blueprintId: string,
  generationCycleId: string,
  blueprint: Blueprint,
  researchResults: ResearchResults | null,
  options: GlossaryBuilderOptions
): Promise<GlossaryBuildResult> {
  const { supabase, openai, glossaryModel, exaApiKey } = options;

  console.log(`[glossary] Building glossary for event ${eventId}, cycle ${generationCycleId}`);
  console.log(`[glossary] Blueprint has ${blueprint.glossary_plan.terms.length} terms planned`);

  const termsToBuild: GlossaryPlanTerm[] = selectGlossaryTerms(blueprint);
  if (termsToBuild.length === 0) {
    console.log(`[glossary] No terms to build, skipping`);
    return {
      termCount: 0,
      costBreakdown: {
        openai: { total: 0, chat_completions: [] },
        exa: { total: 0, answer: { cost: 0, queries: 0, calls: [] } },
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
      answer: { cost: 0, queries: 0, calls: [] },
    },
  };

  // Fetch research from research_results table if not provided
  // Exclude research from superseded generation cycles
  let research: ResearchResults;
  if (!researchResults) {
    const researchData = await fetchActiveResearchResults(supabase, {
      eventId,
      blueprintId,
    });

    research = {
      chunks: researchData.map((item) => ({
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

  let insertedCount = 0;

  // Update generation cycle progress
  const { error: processingError }: SupabaseMutationResult = await supabase
    .from('generation_cycles')
    .update<GenerationCycleUpdate>({
      status: 'processing',
      progress_total: termsToBuild.length,
    })
    .eq('id', generationCycleId);

  if (processingError) {
    console.warn(`[glossary] Failed to mark cycle ${generationCycleId} as processing: ${processingError.message}`);
  }

  // Process terms in batches to avoid rate limits
  const batchSize = 5;
  for (let i = 0; i < termsToBuild.length; i += batchSize) {
    const batch = termsToBuild.slice(i, i + batchSize);
    
    try {
      const { definitions, batchCostBreakdown } = await generateTermDefinitions(
        batch,
        research,
        blueprint.important_details.join('\n'),
        openai,
        glossaryModel,
        exaApiKey ? new Exa(exaApiKey) : undefined
      );

      costBreakdown.openai.total += batchCostBreakdown.openai.total;
      costBreakdown.openai.chat_completions = costBreakdown.openai.chat_completions.concat(
        batchCostBreakdown.openai.chat_completions
      );
      costBreakdown.exa.total += batchCostBreakdown.exa.total;
      costBreakdown.exa.answer.cost += batchCostBreakdown.exa.answer.cost;
      costBreakdown.exa.answer.queries += batchCostBreakdown.exa.answer.queries;
      costBreakdown.exa.answer.calls = costBreakdown.exa.answer.calls.concat(
        batchCostBreakdown.exa.answer.calls
      );

      // Store definitions in database
      for (const def of definitions) {
        try {
          await insertGlossaryTerm(supabase, {
            event_id: eventId,
            generation_cycle_id: generationCycleId,
            term: def.term,
            definition: def.definition,
            acronym_for: def.acronym_for ?? null,
            category: def.category || 'general',
            usage_examples: def.usage_examples ?? [],
            related_terms: def.related_terms ?? [],
            confidence_score: def.confidence_score ?? 0.8,
            source: def.source || 'llm_generation',
            source_url: def.source_url ?? null,
            agent_utility: def.agent_utility ?? [],
          });

          insertedCount++;
          const progressSuccess = await updateGlossaryCycle(supabase, generationCycleId, {
            progress_current: insertedCount,
          });
          if (!progressSuccess) {
            console.warn(
              `[glossary] Failed to update cycle progress for ${generationCycleId}`
            );
          }
        } catch (err: unknown) {
          console.error("[worker] error:", String(err));
        }
      }
      // TODO: narrow unknown -> OpenAIAPIError after upstream callsite analysis
    } catch (err: unknown) {
      console.error("[worker] error:", String(err));
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
  const completionSuccess = await updateGlossaryCycle(supabase, generationCycleId, {
    status: 'completed',
    progress_current: insertedCount,
    completed_at: new Date().toISOString(),
    metadata: costMetadata,
  });
  if (!completionSuccess) {
    throw new Error('Failed to mark glossary generation cycle as completed');
  }

  console.log(`[glossary] Inserted ${insertedCount} glossary terms for event ${eventId}`);
  console.log(`[glossary] Generation cycle ${generationCycleId} marked as completed`);
  return {
    termCount: insertedCount,
    costBreakdown,
  };
}
