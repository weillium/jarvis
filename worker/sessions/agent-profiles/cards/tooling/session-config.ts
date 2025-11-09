import type { RealtimeClientEvent } from 'openai/resources/realtime/realtime';

type JsonSchemaProperty =
  | {
      type: 'string';
      description: string;
      enum?: string[];
    }
  | {
      type: 'number';
      description: string;
      default?: number;
      minimum?: number;
      maximum?: number;
    };

interface FunctionToolSchema {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
}

interface FunctionToolDefinition {
  type: 'function';
  name: string;
  description: string;
  parameters: FunctionToolSchema;
}

export interface CardsRealtimeTooling {
  tools: FunctionToolDefinition[];
  sessionUpdateEvent: RealtimeClientEvent;
}

const retrieveTool: FunctionToolDefinition = {
  type: 'function',
  name: 'retrieve',
  description:
    'Retrieve relevant knowledge chunks from the vector database. Use this when you need domain-specific context, definitions, or background information that is not in the current transcript context.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'The search query to find relevant context chunks. Should be a concise description of what information you need.',
      },
      top_k: {
        type: 'number',
        description: 'Number of top chunks to retrieve (default: 5, max: 10)',
        default: 5,
        minimum: 1,
        maximum: 10,
      },
    },
    required: ['query'],
  },
};

const produceCardTool: FunctionToolDefinition = {
  type: 'function',
  name: 'produce_card',
  description:
    'Generate a context card when content is novel and user-useful. This is the ONLY way to emit cards - you MUST use this tool instead of returning JSON directly.',
  parameters: {
    type: 'object',
    properties: {
      kind: {
        type: 'string',
        enum: ['Decision', 'Metric', 'Deadline', 'Topic', 'Entity', 'Action', 'Context', 'Definition'],
        description: 'The type/category of the card',
      },
      card_type: {
        type: 'string',
        enum: ['text', 'text_visual', 'visual'],
        description:
          'The card display type: "text" for text-only, "text_visual" for text with image, "visual" for image-only',
      },
      title: {
        type: 'string',
        description: 'Brief title for the card (aim for <= 60 characters)',
      },
      body: {
        type: 'string',
        description:
          '1-3 bullet points with key information (required for text/text_visual types, null for visual type)',
      },
      label: {
        type: 'string',
        description:
          'Short label for image (required for visual type; aim for <= 40 characters; null for text/text_visual types)',
      },
      image_url: {
        type: 'string',
        description:
          'URL to supporting image (required for text_visual/visual types, null for text type)',
      },
      source_seq: {
        type: 'number',
        description: 'The sequence number of the source transcript that triggered this card',
      },
    },
    required: ['kind', 'card_type', 'title', 'source_seq'],
  },
};

const cardsTools: FunctionToolDefinition[] = [retrieveTool, produceCardTool];

export const getCardsRealtimeTooling = (policy: string): CardsRealtimeTooling => {
  const sessionUpdatePayload = {
    type: 'realtime' as const,
    instructions: policy,
    output_modalities: ['text'],
    max_output_tokens: 4096,
    tools: cardsTools,
  };

  const sessionUpdateEvent = {
    type: 'session.update',
    session: sessionUpdatePayload,
  } as unknown as RealtimeClientEvent;

  return {
    tools: cardsTools,
    sessionUpdateEvent,
  };
};

export const CARDS_FUNCTION_TOOLS = cardsTools;

