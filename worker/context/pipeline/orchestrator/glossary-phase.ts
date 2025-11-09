import type { Blueprint } from '../blueprint/types';
import { buildGlossary } from '../glossary-builder';
import { getPricingVersion } from '../pricing-config';
import type { GenerationContext, PhaseOptions } from './phase-context';
import type { StatusManager } from './status-manager';

export interface GlossaryPhaseOptions extends PhaseOptions {
  embedModel: string;
  glossaryModel: string;
  statusManager: StatusManager;
}

export const runGlossaryPhase = async (
  context: GenerationContext,
  blueprint: Blueprint,
  generationCycleId: string,
  options: GlossaryPhaseOptions
) => {
  const { supabase, openai, genModel, embedModel, glossaryModel, exaApiKey, statusManager } = options;

  await statusManager.updateCycle(generationCycleId, { status: 'processing' });

  const result = await buildGlossary(
    context.eventId,
    context.blueprintId,
    generationCycleId,
    blueprint,
    null,
    {
      supabase,
      openai,
      genModel,
      glossaryModel,
      embedModel,
      exaApiKey,
    }
  );

  const totalCost = result.costBreakdown.openai.total + result.costBreakdown.exa.total;

  const costMetadata = {
    cost: {
      total: totalCost,
      currency: 'USD',
      breakdown: result.costBreakdown,
      tracked_at: new Date().toISOString(),
      pricing_version: getPricingVersion(),
    },
  };

  await statusManager.updateCycle(generationCycleId, {
    status: 'completed',
    metadata: costMetadata,
  });

  return result;
};

