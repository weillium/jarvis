import type { ModelSet } from './model-management/model-providers';
import { resolveModel, resolveModelOrThrow, resolveModelSet } from './model-management/model-resolver';

export interface ModelConfig {
  transcriptModel: string;
  cardsModel: string;
  factsModel: string;
  apiKey: string;
}

export class ModelSelectionService {
  private normalizeModelSet(rawModelSet: string): ModelSet {
    try {
      return resolveModelSet(rawModelSet);
    } catch {
      return 'default';
    }
  }

  private resolveApiKey(modelSet: ModelSet): string {
    const resolution = resolveModel({
      modelKey: 'runtime.api_key',
      modelSet,
      throwOnMissing: false,
    });
    return resolution.resolvedValue ?? '';
  }

  private buildModelConfig(modelSet: ModelSet): ModelConfig {
    return {
      transcriptModel: resolveModelOrThrow({
        modelKey: 'runtime.transcript_realtime',
        modelSet,
      }),
      cardsModel: resolveModelOrThrow({
        modelKey: 'runtime.cards_generation',
        modelSet,
      }),
      factsModel: resolveModelOrThrow({
        modelKey: 'runtime.facts_generation',
        modelSet,
      }),
      apiKey: this.resolveApiKey(modelSet),
    };
  }

  /**
   * Get model configuration based on model_set value
   * 
   * @param modelSet - The model_set value from the agent (e.g., 'open_ai')
   * @returns Model configuration with transcript, cards, facts models, and API key
   */
  getModelConfig(modelSet: string): ModelConfig {
    const normalizedModelSet = this.normalizeModelSet(modelSet);
    return this.buildModelConfig(normalizedModelSet);
  }

  /**
   * Get the appropriate model for an agent type
   * 
   * @param modelSet - The model_set value from the agent
   * @param agentType - The agent type ('transcript', 'cards', or 'facts')
   * @returns The model string to use for this agent type
   */
  getModelForAgentType(modelSet: string, agentType: 'transcript' | 'cards' | 'facts'): string {
    const normalizedModelSet = this.normalizeModelSet(modelSet);
    const config = this.buildModelConfig(normalizedModelSet);
    
    if (agentType === 'transcript') {
      return config.transcriptModel;
    }
    
    if (agentType === 'cards') {
      return config.cardsModel;
    }
    
    if (agentType === 'facts') {
      return config.factsModel;
    }
    
    // Fallback (should not happen)
    return resolveModelOrThrow({
      modelKey: 'runtime.realtime',
      modelSet: normalizedModelSet,
    });
  }

  /**
   * Get the API key for a model_set
   * 
   * @param modelSet - The model_set value from the agent
   * @returns The API key string
   */
  getApiKey(modelSet: string): string {
    const normalizedModelSet = this.normalizeModelSet(modelSet);
    return this.resolveApiKey(normalizedModelSet);
  }
}

