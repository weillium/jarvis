export type FactKind = 'claim' | 'question' | 'meta';

export interface ClassifiedFact {
  kind: FactKind;
  rewrittenValue?: string;
  excludeFromPrompt?: boolean;
}

export const FACT_KIND_PRIORITY: FactKind[] = ['claim', 'question', 'meta'];

