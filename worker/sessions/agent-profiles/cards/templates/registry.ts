import type { CardTriggerContext } from '../../../../processing/cards-processor';
import type {
  CardTemplateDefinition,
  TemplateEligibility,
  TemplateEligibilityInput,
  TemplatePlan,
  TemplateSelection,
} from './types';

type TemplateDefinitionFactory = () => CardTemplateDefinition;

const definitionTemplate: TemplateDefinitionFactory = () => ({
  id: 'definition.v1',
  label: 'Definition Card',
  description: 'Explains a term, acronym, or concept in plain language.',
  slots: [
    {
      id: 'title',
      description: 'Audience-facing title for the card.',
      required: true,
      strategy: 'deterministic',
      maxLength: 80,
    },
    {
      id: 'definition',
      description: 'Plain-language definition or explanation (written as natural prose in the body).',
      required: true,
      strategy: 'hybrid',
      maxLength: 320,
    },
    {
      id: 'why_now',
      description: 'Context for why this matters now (used internally; not included in body text).',
      required: true,
      strategy: 'deterministic',
      maxLength: 160,
    },
    {
      id: 'visual_prompt',
      description: 'Optional prompt for a supporting visual (separate from body; goes in visual_request field).',
      required: false,
      strategy: 'llm',
      maxLength: 180,
    },
  ],
  evaluate: ({ triggerContext }: TemplateEligibilityInput): TemplateEligibility => {
    const { matchSource, conceptLabel, supportingContext } = triggerContext;
    const glossaryMatches = supportingContext?.glossaryEntries?.length ?? 0;
    const factsMatches = supportingContext?.facts?.length ?? 0;
    const conceptIsShort = conceptLabel.trim().split(/\s+/).length <= 5;

    if (matchSource === 'glossary' || glossaryMatches > 0) {
      return {
        eligible: true,
        priority: 100,
        reason: 'Glossary-backed concept',
      };
    }

    if (conceptIsShort && factsMatches > 0) {
      return {
        eligible: true,
        priority: 60,
        reason: 'Short concept with supporting facts',
      };
    }

    return {
      eligible: false,
      reason: 'Concept lacks glossary or fact support for definition template',
    };
  },
});

const summaryTemplate: TemplateDefinitionFactory = () => ({
  id: 'summary.v1',
  label: 'Summary Card',
  description: 'Provides high-level bullets and optional visual for topic recaps.',
  slots: [
    {
      id: 'title',
      description: 'Headline summarizing the topic.',
      required: true,
      strategy: 'deterministic',
      maxLength: 80,
    },
    {
      id: 'bullets',
      description: '1-3 key points capturing the core ideas (written as natural prose in the body, not labeled bullets).',
      required: true,
      strategy: 'hybrid',
      maxLength: 420,
    },
    {
      id: 'visual_prompt',
      description: 'Optional prompt for a supporting visual or diagram (separate from body; goes in visual_request field).',
      required: false,
      strategy: 'llm',
      maxLength: 180,
    },
  ],
  evaluate: ({ triggerContext }: TemplateEligibilityInput): TemplateEligibility => {
    const bulletCount = triggerContext.supportingContext?.contextBullets?.length ?? 0;
    const conceptHasRecentCards =
      (triggerContext.supportingContext?.recentCards?.length ?? 0) > 0;

    if (bulletCount >= 2) {
      return {
        eligible: true,
        priority: conceptHasRecentCards ? 40 : 30,
        reason: 'Sufficient context bullets available for summary',
      };
    }

    return {
      eligible: false,
      reason: 'Insufficient context bullets for summary template',
    };
  },
});

const DEFAULT_TEMPLATES: CardTemplateDefinition[] = [
  definitionTemplate(),
  summaryTemplate(),
];

export class CardTemplateRegistry {
  private readonly templates: CardTemplateDefinition[];

  constructor(templates: CardTemplateDefinition[] = DEFAULT_TEMPLATES) {
    this.templates = templates;
  }

  list(): CardTemplateDefinition[] {
    return this.templates.slice();
  }

  select(
    triggerContext: CardTriggerContext
  ): TemplateSelection | null {
    const results: TemplateSelection[] = [];

    for (const template of this.templates) {
      const eligibility = template.evaluate({ triggerContext });
      if (eligibility.eligible) {
        results.push({ template, eligibility });
      }
    }

    if (results.length === 0) {
      return null;
    }

    results.sort((a, b) => {
      const priorityA = a.eligibility.priority ?? 0;
      const priorityB = b.eligibility.priority ?? 0;
      return priorityB - priorityA;
    });

    return results[0];
  }

  toPlan(selection: TemplateSelection): TemplatePlan {
    const { template, eligibility } = selection;
    return {
      templateId: template.id,
      slotSpecs: template.slots,
      metadata: {
        label: template.label,
        description: template.description,
        eligibilityReason: eligibility.reason,
        priority: eligibility.priority,
      },
    };
  }

  filterByIds(templateIds: string[] | null | undefined): CardTemplateRegistry {
    if (!templateIds || templateIds.length === 0) {
      return new CardTemplateRegistry(this.templates);
    }

    const allowed = new Set(templateIds);
    const filtered = this.templates.filter((template) => allowed.has(template.id));
    return new CardTemplateRegistry(filtered);
  }
}

export const createDefaultTemplateRegistry = (): CardTemplateRegistry =>
  new CardTemplateRegistry();


