import type {
  ResponseDoneEvent,
  ResponseFunctionCallArgumentsDoneEvent,
  ResponseTextDoneEvent,
} from 'openai/resources/realtime/realtime';
import type { RealtimeCardDTO, RealtimeToolCallDTO } from '../../../types';
import {
  mapCardPayload,
  mapToolCallArguments,
  safeJsonParse,
} from '../../session-adapters/payload-utils';
import { extractAssistantText } from '../../session-adapters/utils';

export interface CardsResponseTextInterpretation {
  cards: RealtimeCardDTO[];
}

export interface CardsResponseDoneInterpretation {
  cards: RealtimeCardDTO[];
  rawPayload?: unknown;
}

export type CardsToolCallInterpretation = RealtimeToolCallDTO | null;

export const interpretResponseText = (
  payload: ResponseTextDoneEvent
): CardsResponseTextInterpretation => {
  if (!payload.text) {
    return { cards: [] };
  }

  const card = mapCardPayload(payload.text);
  return card ? { cards: [card] } : { cards: [] };
};

export const interpretResponseDone = (
  payload: ResponseDoneEvent
): CardsResponseDoneInterpretation => {
  const assistantText = extractAssistantText(payload);
  if (!assistantText) {
    return { cards: [] };
  }

  const parsedPayload = safeJsonParse<unknown>(assistantText);
  if (parsedPayload === null) {
    return { cards: [] };
  }

  const card = mapCardPayload(parsedPayload);
  return {
    rawPayload: parsedPayload,
    cards: card ? [card] : [],
  };
};

export const interpretToolCall = (
  payload: ResponseFunctionCallArgumentsDoneEvent
): CardsToolCallInterpretation => {
  return mapToolCallArguments(payload.arguments, payload.call_id);
};

