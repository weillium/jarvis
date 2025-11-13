import {
  PromptCardGenerator,
  type CardGenerator,
  type CardGenerationInput,
  type CardGenerationResult,
  type CardGeneratorDeps,
} from '../../shared/prompt-card-generator';

export type {
  CardGenerationInput as StatelessCardGenerationInput,
  CardGenerationResult as StatelessCardGenerationResult,
  CardGeneratorDeps as StatelessCardGeneratorDeps,
};

export type StatelessCardGenerator = CardGenerator;

export const createStatelessCardGenerator = (
  deps: CardGeneratorDeps
): StatelessCardGenerator => new PromptCardGenerator(deps);


