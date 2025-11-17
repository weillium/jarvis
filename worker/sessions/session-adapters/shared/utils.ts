import type { ResponseDoneEvent } from 'openai/resources/realtime/realtime';
import { isRecord } from './payload-utils';

export const extractAssistantText = (event: ResponseDoneEvent): string | null => {
  const items = event.response.output;
  if (!Array.isArray(items)) {
    return null;
  }

  for (const item of items) {
    if (
      isRecord(item) &&
      item.type === 'message' &&
      item.role === 'assistant' &&
      Array.isArray(item.content)
    ) {
      const textContent = item.content.find(
        (content) =>
          isRecord(content) &&
          typeof content.type === 'string' &&
          content.type === 'text' &&
          typeof content.text === 'string'
      );
      if (textContent && typeof textContent.text === 'string') {
        return textContent.text;
      }
    }
  }

  return null;
};
