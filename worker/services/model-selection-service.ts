/**
 * Model Selection Service
 * 
 * Handles model and API key selection based on agent model_set value.
 * Supports multiple model providers (open_ai, etc.) with fallback defaults.
 */

export interface ModelConfig {
  transcriptModel: string;
  cardsModel: string;
  factsModel: string;
  apiKey: string;
}

export class ModelSelectionService {
  /**
   * Get model configuration based on model_set value
   * 
   * @param modelSet - The model_set value from the agent (e.g., 'open_ai')
   * @returns Model configuration with transcript, cards, facts models, and API key
   */
  getModelConfig(modelSet: string): ModelConfig {
    if (modelSet === 'open_ai') {
      return {
        transcriptModel: process.env.OPENAI_TRANSCRIPT_MODEL || process.env.DEFAULT_TRANSCRIPT_MODEL || 'gpt-4o-realtime-preview-2024-10-01',
        cardsModel: process.env.OPENAI_CARDS_MODEL || process.env.DEFAULT_CARDS_MODEL || 'gpt-4o-realtime-preview-2024-10-01',
        factsModel: process.env.OPENAI_FACTS_MODEL || process.env.DEFAULT_FACTS_MODEL || 'gpt-4o-mini',
        apiKey: process.env.OPENAI_API_KEY || process.env.DEFAULT_API_KEY || '',
      };
    }

    // Default fallback for unknown model_set values
    return {
      transcriptModel: process.env.DEFAULT_TRANSCRIPT_MODEL || 'gpt-4o-realtime-preview-2024-10-01',
      cardsModel: process.env.DEFAULT_CARDS_MODEL || 'gpt-4o-realtime-preview-2024-10-01',
      factsModel: process.env.DEFAULT_FACTS_MODEL || 'gpt-4o-mini',
      apiKey: process.env.DEFAULT_API_KEY || '',
    };
  }

  /**
   * Get the appropriate model for an agent type
   * 
   * @param modelSet - The model_set value from the agent
   * @param agentType - The agent type ('transcript', 'cards', or 'facts')
   * @returns The model string to use for this agent type
   */
  getModelForAgentType(modelSet: string, agentType: 'transcript' | 'cards' | 'facts'): string {
    const config = this.getModelConfig(modelSet);
    
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
    return config.transcriptModel;
  }

  /**
   * Get the API key for a model_set
   * 
   * @param modelSet - The model_set value from the agent
   * @returns The API key string
   */
  getApiKey(modelSet: string): string {
    const config = this.getModelConfig(modelSet);
    return config.apiKey;
  }
}

