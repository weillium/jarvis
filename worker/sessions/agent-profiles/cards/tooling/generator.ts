import {
  PromptCardGenerator,
  type CardGenerator,
  type CardGenerationInput,
  type CardGenerationResult,
  type CardGeneratorDeps,
} from '../shared/prompt-card-generator';

export { PromptCardGenerator };
export type {
  CardGenerator,
  CardGenerationInput,
  CardGenerationResult,
  CardGeneratorDeps,
};

export type CardGeneratorFactory = (
  deps: CardGeneratorDeps
) => CardGenerator;

