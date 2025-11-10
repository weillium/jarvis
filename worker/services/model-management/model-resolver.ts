import {
  MODEL_DESCRIPTORS,
  MODEL_SETS,
  type ModelDescriptor,
  type ModelKey,
  type ModelSet,
} from './model-providers';

type ResolutionSource =
  | 'provider_env'
  | 'default_env'
  | 'provider_fallback'
  | 'default_fallback';

const OPEN_AI_DEFAULT_SET =
  MODEL_SETS.find((set) => set === 'open_ai') ?? MODEL_SETS[0];
const DEFAULT_SET: ModelSet = MODEL_SETS[0];

export interface ResolveModelOptions {
  /**
   * Logical model key defined in the registry.
   */
  modelKey: ModelKey;
  /**
   * Active provider/model set (e.g. 'open_ai'). Defaults to 'default'.
   */
  modelSet?: ModelSet;
  /**
   * When true (default), missing required bindings throw immediately.
   * Set to false if the caller wants to handle missing results manually.
   */
  throwOnMissing?: boolean;
}

export interface ModelResolution {
  descriptor: ModelDescriptor;
  resolvedValue?: string;
  /**
   * Which binding supplied the final value (or attempted lookup).
   */
  source?: ResolutionSource;
  /**
   * Environment variable that provided the value, if any.
   */
  envVar?: string;
  /**
   * Which model set the value ultimately came from.
   */
  resolvedFromSet?: ModelSet;
  /**
   * Indicates that resolution failed (e.g. required env var missing and no fallback).
   */
  missing?: {
    required: boolean;
    checkedEnvVars: string[];
  };
}

export const isModelSet = (value: string): value is ModelSet => {
  return MODEL_SETS.some((set) => set === value);
};

export const resolveModelSet = (value?: string | null): ModelSet => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return OPEN_AI_DEFAULT_SET;
  }
  if (isModelSet(trimmed)) {
    return trimmed;
  }
  throw new Error(`Unsupported model set "${trimmed}". Allowed sets: ${MODEL_SETS.join(', ')}`);
};

export const resolveModelSetFromEnv = (): ModelSet => {
  return resolveModelSet(process.env.MODEL_SET);
};

const readEnv = (envVar: string | undefined): string | undefined => {
  if (!envVar) return undefined;
  const value = process.env[envVar];
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }
  return value.trim();
};

const resolveFromBinding = (
  descriptor: ModelDescriptor,
  set: ModelSet
): {
  value?: string;
  envVar?: string;
  source?: ResolutionSource;
  required?: boolean;
  fallbackValue?: string;
} => {
  const binding = descriptor.bindings[set];
  if (!binding) {
    return {};
  }

  const envValue = readEnv(binding.envVar);
  if (envValue) {
    const source: ResolutionSource = set === DEFAULT_SET ? 'default_env' : 'provider_env';
    return { value: envValue, envVar: binding.envVar, source };
  }

  if (binding.fallbackValue !== undefined) {
    const source: ResolutionSource = set === DEFAULT_SET ? 'default_fallback' : 'provider_fallback';
    return {
      value: binding.fallbackValue,
      envVar: binding.envVar,
      source,
    };
  }

  return {
    envVar: binding.envVar,
    required: Boolean(binding.required),
  };
};

const buildMissingResult = (
  descriptor: ModelDescriptor,
  modelSet: ModelSet,
  providerMiss: ReturnType<typeof resolveFromBinding>,
  defaultMiss: ReturnType<typeof resolveFromBinding>
): ModelResolution => {
  const checkedEnvVars = [
    providerMiss.envVar,
    defaultMiss.envVar,
  ].filter((value): value is string => Boolean(value));

  const required =
    Boolean(providerMiss.required) ||
    (modelSet !== DEFAULT_SET && Boolean(defaultMiss.required));

  return {
    descriptor,
    missing: {
      required,
      checkedEnvVars,
    },
  };
};

export const resolveModel = (options: ResolveModelOptions): ModelResolution => {
  const { modelKey, modelSet = DEFAULT_SET, throwOnMissing = true } = options;
  const descriptor = MODEL_DESCRIPTORS[modelKey];

  if (!descriptor) {
    throw new Error(`No model descriptor registered for key "${modelKey}"`);
  }

  const providerBindingResult = resolveFromBinding(descriptor, modelSet);
  if (providerBindingResult.value) {
    return {
      descriptor,
      resolvedValue: providerBindingResult.value,
      envVar: providerBindingResult.envVar,
      source: providerBindingResult.source,
      resolvedFromSet: modelSet,
    };
  }

  const defaultBindingResult = modelSet === DEFAULT_SET
    ? providerBindingResult
    : resolveFromBinding(descriptor, DEFAULT_SET);

  if (defaultBindingResult.value) {
    return {
      descriptor,
      resolvedValue: defaultBindingResult.value,
      envVar: defaultBindingResult.envVar ?? providerBindingResult.envVar,
      source: defaultBindingResult.source,
      resolvedFromSet: DEFAULT_SET,
    };
  }

  const missingResult = buildMissingResult(
    descriptor,
    modelSet,
    providerBindingResult,
    defaultBindingResult
  );

  if (missingResult.missing?.required && throwOnMissing) {
    const envVars = missingResult.missing.checkedEnvVars.length
      ? missingResult.missing.checkedEnvVars.join(', ')
      : 'none';
    throw new Error(
      `Model resolution failed for "${modelKey}" (${modelSet}) - required env var(s) missing. Checked: ${envVars}`
    );
  }

  return missingResult;
};

export const resolveModelOrThrow = (options: ResolveModelOptions & { throwOnMissing?: true }): string => {
  const resolution = resolveModel({ ...options, throwOnMissing: true });
  if (!resolution.resolvedValue) {
    throw new Error(`Model resolution returned empty value for "${options.modelKey}"`);
  }
  return resolution.resolvedValue;
};

