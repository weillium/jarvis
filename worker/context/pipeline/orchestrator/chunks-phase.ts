import type { Blueprint } from '../blueprint/types';
import { buildContextChunks } from '../chunks-builder';
import { getPricingVersion } from '../pricing-config';
import type { GenerationContext, PhaseOptions } from './phase-context';
import type { StatusManager } from './status-manager';

export interface ChunksPhaseOptions extends PhaseOptions {
  embedModel: string;
  statusManager: StatusManager;
}

export const runChunksPhase = async (
  context: GenerationContext,
  blueprint: Blueprint,
  generationCycleId: string,
  options: ChunksPhaseOptions
) => {
  const { supabase, openai, embedModel, genModel, statusManager } = options;

  await statusManager.updateCycle(generationCycleId, { status: 'processing' });

  const result = await buildContextChunks(
    context.eventId,
    context.blueprintId,
    generationCycleId,
    blueprint,
    null,
    {
      supabase,
      openai,
      embedModel,
      genModel,
    }
  );

  const totalCost = result.costBreakdown.openai.total;

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

