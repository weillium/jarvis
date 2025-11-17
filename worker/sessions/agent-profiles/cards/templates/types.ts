import type { CardTriggerContext } from '../../../../processing/cards-processor';

declare const templateIdentifierBrand: unique symbol;

export type TemplateIdentifier =
  | 'definition.v1'
  | 'summary.v1'
  | (string & { readonly [templateIdentifierBrand]: never });

export type SlotFillStrategy = 'deterministic' | 'llm' | 'hybrid';

export interface TemplateSlotSpec {
  id: string;
  description: string;
  required: boolean;
  strategy: SlotFillStrategy;
  maxLength?: number;
  allowMarkdown?: boolean;
}

export interface TemplateEligibilityInput {
  triggerContext: CardTriggerContext;
}

export interface TemplateEligibility {
  eligible: boolean;
  reason?: string;
  priority?: number;
}

export type TemplateEligibilityFn = (
  input: TemplateEligibilityInput
) => TemplateEligibility;

export interface CardTemplateDefinition {
  id: TemplateIdentifier;
  label: string;
  description: string;
  slots: TemplateSlotSpec[];
  evaluate: TemplateEligibilityFn;
}

export interface TemplateSelection {
  template: CardTemplateDefinition;
  eligibility: TemplateEligibility;
}

export interface TemplatePlan {
  templateId: TemplateIdentifier;
  slotSpecs: TemplateSlotSpec[];
  metadata: {
    description: string;
    label: string;
    eligibilityReason?: string;
    priority?: number;
  };
}


