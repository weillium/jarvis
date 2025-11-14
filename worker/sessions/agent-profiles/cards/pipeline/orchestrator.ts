import type { CardTriggerContext } from '../../../../processing/cards-processor';
import type { TemplatePlan, TemplateSelection } from '../templates/types';
import { createDefaultTemplateRegistry } from '../templates/registry';
import type { CardTemplateRegistry } from '../templates/registry';

export interface TemplateOrchestratorOptions {
  registry?: CardTemplateRegistry;
}

export interface TemplateOrchestratorResult {
  plan: TemplatePlan;
  selection: TemplateSelection;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isCardTriggerContext = (value: unknown): value is CardTriggerContext => {
  if (!isRecord(value)) {
    return false;
  }

  const recordValue: Record<string, unknown> = value;
  const conceptId = recordValue.conceptId;
  const conceptLabel = recordValue.conceptLabel;
  const matchSource = recordValue.matchSource;
  const supportingContext = recordValue.supportingContext;

  if (typeof conceptId !== 'string' || conceptId.trim().length === 0) {
    return false;
  }

  if (typeof conceptLabel !== 'string' || conceptLabel.trim().length === 0) {
    return false;
  }

  if (matchSource !== 'glossary' && matchSource !== 'fact' && matchSource !== 'transcript') {
    return false;
  }

  if (!isRecord(supportingContext)) {
    return false;
  }

  const supportingRecord: Record<string, unknown> = supportingContext;
  if (
    !Array.isArray(supportingRecord.facts) ||
    !Array.isArray(supportingRecord.recentCards) ||
    !Array.isArray(supportingRecord.glossaryEntries)
  ) {
    return false;
  }

  if (
    !Array.isArray(supportingRecord.contextBullets) ||
    !Array.isArray(supportingRecord.contextChunks)
  ) {
    return false;
  }

  return true;
};

export class TemplateOrchestrator {
  private readonly registry: CardTemplateRegistry;

  constructor(options: TemplateOrchestratorOptions = {}) {
    this.registry = options.registry ?? createDefaultTemplateRegistry();
  }

  getRegistry(): CardTemplateRegistry {
    return this.registry;
  }

  plan(triggerContext: unknown): TemplateOrchestratorResult | null {
    if (!isCardTriggerContext(triggerContext)) {
      return null;
    }

    const normalizedTriggerContext: CardTriggerContext = {
      ...triggerContext,
      supportingContext: {
        ...triggerContext.supportingContext,
      },
    };

    const selection = this.registry.select(normalizedTriggerContext);
    if (!selection) {
      return null;
    }

    const plan = this.registry.toPlan(selection);
    return { plan, selection };
  }
}


