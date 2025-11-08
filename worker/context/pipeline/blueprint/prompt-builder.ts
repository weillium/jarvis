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
    ? `\n\nDocuments Available:\n${documentsText}\n\nConsider that documents are uploaded for this event. The blueprint should plan to extract and use content from these documents in the chunks construction phase.`
    : '\n\nNo documents have been uploaded for this event yet.';

  const userPrompt = createBlueprintUserPrompt(eventTitle, topic, documentsSection);

  return {
    systemPrompt,
    userPrompt,
  };
};

