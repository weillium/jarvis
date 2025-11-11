/**
 * Blueprint Generator
 * Generates context generation blueprints for user review and approval.
 *
 * Flow:
 * 1. User triggers blueprint generation
 * 2. System generates a plan (blueprint) using LLM
 * 3. User reviews and approves blueprint
 * 4. System executes the blueprint to build context
 */

import {
  calculateOpenAICost,
  getPricingVersion,
} from './pricing-config';
import type {
  Blueprint,
  BlueprintGeneratorOptions,
  BlueprintPromptPreview,
  BlueprintWithUsage,
  WorkerSupabaseClient,
} from './blueprint/types';
import { loadBlueprintDocumentsSection } from './blueprint/documents';
import { generateBlueprintWithLLM } from './blueprint/llm-runner';
import {
  ensureAgentBlueprintStage,
  fetchEventRecord,
  insertBlueprintRecord,
  createBlueprintGenerationCycle,
  updateBlueprintRecord,
  updateGenerationCycleWithCost,
  supersedeExistingBlueprints,
  markBlueprintError,
  markBlueprintGenerationCycleFailed,
} from './blueprint/persistence';
import { buildBlueprintPrompts } from './blueprint/prompt-builder';

const hasUploadedDocuments = (documentsText: string) =>
  documentsText.length > 0 && !documentsText.includes('will be available');

const prepareGenerationCycleMetadata = (blueprint: BlueprintWithUsage, genModel: string) => {
  const usage = blueprint.usage ?? null;
  const estimatedCost = blueprint.cost_breakdown.total || 0;
  const actualCost = usage ? calculateOpenAICost(usage, genModel, false) : estimatedCost;

  return {
    usage,
    estimatedCost,
    actualCost,
    metadata: {
      cost_breakdown: {
        openai: {
          total: actualCost,
          chat_completions: [
            {
              cost: actualCost,
              model: genModel,
              prompt_tokens: usage?.prompt_tokens ?? 0,
              completion_tokens: usage?.completion_tokens ?? 0,
              total_tokens: usage?.total_tokens ?? 0,
            },
          ],
        },
      },
      estimated_cost: estimatedCost,
      actual_cost: actualCost,
      tracked_at: new Date().toISOString(),
      pricing_version: getPricingVersion(),
    },
  };
};

const extractBlueprintErrorMessage = (err: unknown): string => {
  const defaultMessage = 'Blueprint generation failed due to unexpected shape';

  if (err && typeof err === 'object') {
    const issues = (err as { blueprintIssues?: unknown }).blueprintIssues;
    if (Array.isArray(issues) && issues.length > 0) {
      return `Blueprint validation failed: ${issues.join('; ')}`;
    }
  }

  if (err instanceof Error && err.message) {
    return err.message;
  }

  return defaultMessage;
};

export async function generateContextBlueprint(
  eventId: string,
  agentId: string,
  options: BlueprintGeneratorOptions
): Promise<string> {
  const { supabase, openai, genModel } = options;

  console.log(`[blueprint] Generating blueprint for event ${eventId}, agent ${agentId}`);

  try {
    await ensureAgentBlueprintStage(supabase, agentId);

    const event = await fetchEventRecord(supabase, eventId);
    console.log(`[blueprint] Event: ${event.title}, Topic: ${event.topic || 'N/A'}`);

    const documentsSection = await loadBlueprintDocumentsSection(eventId, supabase);
    const documentsText = documentsSection.text;
    const blueprintId = await insertBlueprintRecord(supabase, eventId, agentId);
    console.log(`[blueprint] Blueprint record created with ID: ${blueprintId}`);

    const generationCycleId = await createBlueprintGenerationCycle(supabase, {
      eventId,
      agentId,
      blueprintId,
    });

    if (generationCycleId) {
      console.log(`[blueprint] Generation cycle created with ID: ${generationCycleId}`);
    }

    let blueprint: BlueprintWithUsage;

    try {
      blueprint = await generateBlueprintWithLLM({
        context: {
          eventTitle: event.title,
          eventTopic: event.topic,
          documentsText,
          hasDocuments: hasUploadedDocuments(documentsText),
        },
        openai,
        genModel,
      });
    } catch (err: unknown) {
      const errorMessage = extractBlueprintErrorMessage(err);

      await markBlueprintError(supabase, {
        blueprintId,
        errorMessage,
      });

      if (generationCycleId) {
        await markBlueprintGenerationCycleFailed(supabase, {
          generationCycleId,
          errorMessage,
        });
      }

      throw err;
    }

    const cycleCost = prepareGenerationCycleMetadata(blueprint, genModel);

    await updateBlueprintRecord(supabase, {
      blueprintId,
      blueprint: blueprint as Blueprint,
    });

    if (generationCycleId) {
      const { metadata, actualCost, usage, estimatedCost } = cycleCost;

      if (usage) {
        console.log(
          `[blueprint] Actual LLM cost: $${actualCost.toFixed(4)} (tokens: ${usage.prompt_tokens} prompt + ${usage.completion_tokens} completion = ${usage.total_tokens} total)`
        );
      } else {
        console.warn(
          `[blueprint] No usage data available, using estimated cost: $${estimatedCost.toFixed(4)}`
        );
      }

      await updateGenerationCycleWithCost(supabase, {
        generationCycleId,
        metadata,
      });
    }

    await supersedeExistingBlueprints(supabase, {
      eventId,
      agentId,
      currentBlueprintId: blueprintId,
    });

    console.log(`[blueprint] Blueprint generation complete for event ${eventId}`);
    return blueprintId;
  } catch (err: unknown) {
    console.error('[blueprint-generator] error:', String(err));
    return '';
  }
}

export async function getBlueprintPromptPreview(
  eventId: string,
  options: { supabase: WorkerSupabaseClient }
): Promise<BlueprintPromptPreview> {
  const { supabase } = options;

  const event = await fetchEventRecord(supabase, eventId);
  const documentsSection = await loadBlueprintDocumentsSection(eventId, supabase);
  const documentsText = documentsSection.text;
  const hasDocuments = hasUploadedDocuments(documentsText);
  const topic = event.topic || event.title;

  const { systemPrompt, userPrompt } = buildBlueprintPrompts({
    eventTitle: event.title,
    topic,
    documentsText,
    hasDocuments,
  });

  return {
    systemPrompt,
    userPrompt,
    event: {
      title: event.title,
      topic,
      hasDocuments,
      documentCount: documentsSection.totalDocuments,
    },
  };
}

