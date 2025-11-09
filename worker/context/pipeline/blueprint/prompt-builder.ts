import {
  BLUEPRINT_GENERATION_SYSTEM_PROMPT,
  createBlueprintUserPrompt,
} from '../../../prompts/blueprint';

export interface PromptContext {
  eventTitle: string;
  topic: string;
  documentsText: string;
  hasDocuments: boolean;
}

export const buildBlueprintPrompts = (context: PromptContext) => {
  const { eventTitle, topic, documentsText, hasDocuments } = context;

  const systemPrompt = BLUEPRINT_GENERATION_SYSTEM_PROMPT;
  const documentsSection = hasDocuments
    ? `\n\nDocuments:\n${documentsText}\nIncorporate uploaded material into chunk sources and research plans.`
    : '\n\nDocuments: none provided. Plan around external research.';

  const userPrompt = createBlueprintUserPrompt(eventTitle, topic, documentsSection);

  return {
    systemPrompt,
    userPrompt,
  };
};

