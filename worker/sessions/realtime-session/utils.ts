import type { ResponseDoneEvent } from 'openai/resources/realtime/realtime';
import { isRecord, safeJsonParse } from './payload-utils';
import type { AgentHandlerOptions } from './types';

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

export const logHandlerEvent = (
  options: AgentHandlerOptions,
  level: 'log' | 'warn' | 'error',
  message: string,
  meta?: Record<string, unknown>
): void => {
  options.onLog?.(level, message, meta);
}

