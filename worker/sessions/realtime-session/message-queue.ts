import type {
  ConversationItemCreateEvent,
  RealtimeClientEvent,
} from 'openai/resources/realtime/realtime';
import {
  createRealtimeCardsUserPrompt,
  createRealtimeFactsUserPrompt,
} from '../../prompts';
import type { RealtimeMessageContext, RealtimeSessionConfig } from './types';
import { extractErrorMessage } from './payload-utils';

interface MessageQueueDeps {
  config: RealtimeSessionConfig;
  getSession: () => { send: (event: RealtimeClientEvent) => void } | undefined;
  isActive: () => boolean;
  onLog?: (
    level: 'log' | 'warn' | 'error',
    message: string,
    context?: { seq?: number }
  ) => void;
}

interface QueuedMessage {
  message: string;
  context?: RealtimeMessageContext;
}

export class MessageQueueManager {
  private readonly config: RealtimeSessionConfig;
  private readonly getSession: MessageQueueDeps['getSession'];
  private readonly isActive: MessageQueueDeps['isActive'];
  private readonly onLog?: MessageQueueDeps['onLog'];
  private queue: QueuedMessage[] = [];
  private currentMessage: QueuedMessage | null = null;
  private pendingResponse = false;
  private pendingAudioBytes = 0;

  constructor(deps: MessageQueueDeps) {
    this.config = deps.config;
    this.getSession = deps.getSession;
    this.isActive = deps.isActive;
    this.onLog = deps.onLog;
  }

  enqueue(message: string, context?: RealtimeMessageContext): void {
    this.queue.push({ message, context });

    if (this.queue.length > 1 || this.pendingResponse) {
      console.warn(`[realtime] [${this.config.agentType}] Sending message with queue backlog`, {
        queueLength: this.queue.length,
        eventId: this.config.eventId,
      });
      this.onLog?.('warn', `Message queue backlog: ${this.queue.length} items`);
    }
  }

  async processQueue(): Promise<void> {
    await Promise.resolve();

    if (!this.isActive()) {
      return;
    }

    const session = this.getSession();
    if (!session) {
      throw new Error('Session not connected');
    }

    if (this.pendingResponse) {
      return;
    }

    if (this.queue.length === 0) {
      return;
    }

    const next = this.queue.shift();
    if (!next) {
      return;
    }

    this.currentMessage = next;
    const formattedMessage = this.formatMessage(next.message, next.context);

    try {
      this.pendingResponse = true;

      session.send(formattedMessage as RealtimeClientEvent);
      session.send({ type: 'response.create' } as RealtimeClientEvent);

      console.log(`[realtime] Message sent (${this.config.agentType})`);
    } catch (error: unknown) {
      this.pendingResponse = false;
      this.queue.unshift(next);
      this.currentMessage = null;
      console.error(`[realtime] Error sending message: ${extractErrorMessage(error)}`);
      throw error;
    }
  }

  markResponseComplete(): void {
    this.pendingResponse = false;
    this.currentMessage = null;
  }

  restoreCurrentMessage(): void {
    if (this.currentMessage) {
      this.queue.unshift(this.currentMessage);
      this.currentMessage = null;
    }
    this.pendingResponse = false;
    this.pendingAudioBytes = 0;
  }

  reset(): void {
    this.queue = [];
    this.currentMessage = null;
    this.pendingResponse = false;
    this.pendingAudioBytes = 0;
  }

  clear(): void {
    this.reset();
  }

  incrementPendingAudio(byteCount: number): void {
    this.pendingAudioBytes += byteCount;
  }

  resetPendingAudio(): void {
    this.pendingAudioBytes = 0;
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  private formatMessage(
    message: string,
    context?: RealtimeMessageContext
  ): ConversationItemCreateEvent {
    if (this.config.agentType === 'cards') {
      return {
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: createRealtimeCardsUserPrompt(
                message,
                (context?.bullets ?? []).join('\n'),
                context?.glossaryContext ?? ''
              ),
            },
          ],
        },
      } satisfies ConversationItemCreateEvent;
    }

    if (this.config.agentType === 'transcript') {
      return {
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: message,
            },
          ],
        },
      } satisfies ConversationItemCreateEvent;
    }

    const factsPrompt = createRealtimeFactsUserPrompt(
      message,
      context?.recentText ?? '',
      Array.isArray(context?.facts)
        ? context?.facts
            .map((fact) =>
              fact && typeof fact === 'object'
                ? JSON.stringify(fact)
                : typeof fact === 'string'
                ? fact
                : ''
            )
            .filter((value) => value)
            .join('\n')
        : typeof context?.facts === 'object' && context?.facts !== null
        ? JSON.stringify(context.facts)
        : ''
    );

    return {
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: factsPrompt,
          },
        ],
      },
    } satisfies ConversationItemCreateEvent;
  }
}
