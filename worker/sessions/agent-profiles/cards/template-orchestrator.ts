import type { CardTriggerContext } from '../../../processing/cards-processor';
import type { TemplatePlan, TemplateSelection } from './templates/types';
import { createDefaultTemplateRegistry } from './templates/registry';
import type { CardTemplateRegistry } from './templates/registry';

export interface TemplateOrchestratorOptions {
  registry?: CardTemplateRegistry;
}

export interface TemplateOrchestratorResult {
  plan: TemplatePlan;
  selection: TemplateSelection;
}

export class TemplateOrchestrator {
  private readonly registry: CardTemplateRegistry;

  constructor(options: TemplateOrchestratorOptions = {}) {
    this.registry = options.registry ?? createDefaultTemplateRegistry();
  }

  plan(triggerContext: CardTriggerContext): TemplateOrchestratorResult | null {
    const selection = this.registry.select(triggerContext);
    if (!selection) {
      return null;
    }

    const plan = this.registry.toPlan(selection);
    return { plan, selection };
  }
}


