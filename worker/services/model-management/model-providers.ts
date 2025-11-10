type Stage = 'context_generation' | 'event_runtime';

export const MODEL_SETS = ['default', 'open_ai'] as const;
export type ModelSet = (typeof MODEL_SETS)[number];

export interface ModelBinding {
  envVar: string;
  /**
   * Whether this environment variable must be provided for the application to run.
   * Defaults to `false`, which means the system should fall back to another value.
   */
  required?: boolean;
  /**
    * Optional hard-coded fallback (ex: baked-in default).
    * Exists here for reference only; runtime code is still responsible for applying it.
    */
  fallbackValue?: string;
}

export interface ModelDescriptor {
  key: ModelKey;
  stage: Stage;
  description: string;
  bindings: Record<ModelSet, ModelBinding>;
  notes?: string;
}

export type ModelKey =
  | 'context.blueprint'
  | 'context.stub_research'
  | 'context.glossary'
  | 'context.chunking'
  | 'context.chunk_polish'
  | 'runtime.realtime'
  | 'runtime.stateless'
  | 'runtime.transcript_realtime'
  | 'runtime.cards_generation'
  | 'runtime.facts_generation';

const createDescriptor = (descriptor: ModelDescriptor): ModelDescriptor => descriptor;

export const MODEL_DESCRIPTORS: Record<ModelKey, ModelDescriptor> = {
  'context.blueprint': createDescriptor({
    key: 'context.blueprint',
    stage: 'context_generation',
    description: 'Generates the comprehensive context blueprint before the event.',
    bindings: {
      default: {
        envVar: 'DEFAULT_CONTEXT_BLUEPRINT_MODEL',
        fallbackValue: 'gpt-5',
      },
      open_ai: {
        envVar: 'CONTEXT_BLUEPRINT_MODEL',
        fallbackValue: 'gpt-5',
      },
    },
  }),
  'context.stub_research': createDescriptor({
    key: 'context.stub_research',
    stage: 'context_generation',
    description:
      'Backup model for research queries when Exa/Wikipedia calls fail; produces stub context chunks.',
    bindings: {
      default: {
        envVar: 'DEFAULT_CONTEXT_STUB_RESEARCH_MODEL',
        fallbackValue: 'gpt-4o-mini',
      },
      open_ai: {
        envVar: 'CONTEXT_STUB_RESEARCH_MODEL',
        fallbackValue: 'gpt-4o-mini',
      },
    },
  }),
  'context.glossary': createDescriptor({
    key: 'context.glossary',
    stage: 'context_generation',
    description: 'Cleans and formats glossary terms sourced from research results.',
    bindings: {
      default: {
        envVar: 'DEFAULT_CONTEXT_GLOSSARY_MODEL',
        fallbackValue: 'gpt-5',
      },
      open_ai: {
        envVar: 'CONTEXT_GLOSSARY_MODEL',
        fallbackValue: 'gpt-5',
      },
    },
    notes: 'Current implementation falls back to the blueprint model when unset.',
  }),
  'context.chunking': createDescriptor({
    key: 'context.chunking',
    stage: 'context_generation',
    description: 'Splits research into semantic context chunks and powers embeddings.',
    bindings: {
      default: {
        envVar: 'DEFAULT_CONTEXT_CHUNKS_MODEL',
        fallbackValue: 'text-embedding-3-small',
      },
      open_ai: {
        envVar: 'CONTEXT_CHUNKS_MODEL',
        fallbackValue: 'text-embedding-3-small',
      },
    },
    notes: 'Used both for embeddings and LLM chunk generation; ensure compatibility.',
  }),
  'context.chunk_polish': createDescriptor({
    key: 'context.chunk_polish',
    stage: 'context_generation',
    description: 'Polishes refined chunk text before storage.',
    bindings: {
      default: {
        envVar: 'DEFAULT_CONTEXT_CHUNKS_POLISHING_MODEL',
        fallbackValue: 'gpt-5-mini',
      },
      open_ai: {
        envVar: 'CONTEXT_CHUNKS_POLISHING_MODEL',
        fallbackValue: 'gpt-5-mini',
      },
    },
  }),
  'runtime.realtime': createDescriptor({
    key: 'runtime.realtime',
    stage: 'event_runtime',
    description: 'Default realtime model for agent sessions (cards/transcript/facts) unless overridden.',
    bindings: {
      default: {
        envVar: 'DEFAULT_REALTIME_MODEL',
        fallbackValue: 'gpt-realtime',
      },
      open_ai: {
        envVar: 'OPENAI_REALTIME_MODEL',
        fallbackValue: 'gpt-4o-realtime-preview-2024-10-01',
      },
    },
    notes:
      'SessionFactory currently relies on agent-specific overrides; integrate this default during refactor.',
  }),
  'runtime.stateless': createDescriptor({
    key: 'runtime.stateless',
    stage: 'event_runtime',
    description: 'Default stateless model for agent runs (cards/facts fallback) unless overridden.',
    bindings: {
      default: {
        envVar: 'DEFAULT_STATELESS_MODEL',
        fallbackValue: 'gpt-4o-mini',
      },
      open_ai: {
        envVar: 'OPENAI_STATELESS_MODEL',
        fallbackValue: 'gpt-4o-mini',
      },
    },
  }),
  'runtime.transcript_realtime': createDescriptor({
    key: 'runtime.transcript_realtime',
    stage: 'event_runtime',
    description: 'Realtime transcription model for transcript agent overriding the default realtime model.',
    bindings: {
      default: {
        envVar: 'DEFAULT_TRANSCRIPT_MODEL',
        fallbackValue: 'gpt-4o-realtime-preview-2024-10-01',
      },
      open_ai: {
        envVar: 'OPENAI_TRANSCRIPT_MODEL',
        fallbackValue: 'gpt-4o-realtime-preview-2024-10-01',
      },
    },
  }),
  'runtime.cards_generation': createDescriptor({
    key: 'runtime.cards_generation',
    stage: 'event_runtime',
    description: 'Cards agent model overriding the default stateless model.',
    bindings: {
      default: {
        envVar: 'DEFAULT_CARDS_MODEL',
        required: true,
      },
      open_ai: {
        envVar: 'OPENAI_CARDS_MODEL',
      },
    },
  }),
  'runtime.facts_generation': createDescriptor({
    key: 'runtime.facts_generation',
    stage: 'event_runtime',
    description: 'Facts agent model overriding the default stateless model.',
    bindings: {
      default: {
        envVar: 'DEFAULT_FACTS_MODEL',
        fallbackValue: 'gpt-4o-mini',
      },
      open_ai: {
        envVar: 'OPENAI_FACTS_MODEL',
        fallbackValue: 'gpt-4o-mini',
      },
    },
  }),
};

export const ALL_MODEL_ENV_VARS: string[] = Array.from(
  new Set(
    Object.values(MODEL_DESCRIPTORS).flatMap((descriptor) =>
      MODEL_SETS.map((set) => descriptor.bindings[set].envVar)
    )
  )
);


