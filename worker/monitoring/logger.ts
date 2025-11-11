import type { LogEntry, AgentType, LogContext } from '../types';
import { isRecord } from '../lib/context-normalization';

export class Logger {
  private readonly logBuffers = new Map<string, LogEntry[]>();

  log(
    eventId: string,
    agentType: AgentType,
    level: 'log' | 'warn' | 'error',
    message: string,
    context?: unknown
  ): void {
    const key = this.getKey(eventId, agentType);
    const buffer = this.ensureBuffer(key);
    const mergedContext = this.buildLogContext(agentType, eventId, context);
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: mergedContext,
    };

    buffer.push(entry);
    if (buffer.length > 100) {
      buffer.shift();
    }

    const consolePayload = this.buildConsolePayload(entry.context);
    this.print(level, agentType, message, consolePayload);
  }

  getLogs(eventId: string, agentType: AgentType): LogEntry[] {
    const key = this.getKey(eventId, agentType);
    return this.logBuffers.get(key) || [];
  }

  clearLogs(eventId: string, agentType: AgentType): void {
    const key = this.getKey(eventId, agentType);
    this.logBuffers.delete(key);
  }

  private getKey(eventId: string, agentType: AgentType): string {
    return `${eventId}:${agentType}`;
  }

  private ensureBuffer(key: string): LogEntry[] {
    let buffer = this.logBuffers.get(key);
    if (!buffer) {
      buffer = [];
      this.logBuffers.set(key, buffer);
    }
    return buffer;
  }

  private buildLogContext(
    agentType: AgentType,
    eventId: string,
    rawContext: unknown
  ): LogContext {
    const context: LogContext = [
      { key: 'agent_type', value: agentType },
      { key: 'event_id', value: eventId },
    ];

    if (!isRecord(rawContext)) {
      return context;
    }

    for (const [key, value] of Object.entries(rawContext)) {
      if (key === 'agent_type' || key === 'event_id') {
        continue;
      }

      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        context.push({ key, value });
        continue;
      }

      if (value === null) {
        context.push({ key, value: null });
      }
    }

    return context;
  }

  private buildConsolePayload(
    context: LogContext | undefined
  ): Record<string, unknown> | undefined {
    if (!context) {
      return undefined;
    }

    if (context.length === 0) {
      return undefined;
    }

    const payload: Record<string, unknown> = {};
    for (const { key, value } of context) {
      if (value !== undefined) {
        payload[key] = value;
      }
    }

    return Object.keys(payload).length > 0 ? payload : undefined;
  }

  private print(
    level: 'log' | 'warn' | 'error',
    agentType: AgentType,
    message: string,
    payload?: Record<string, unknown>
  ): void {
    const formattedLabel = `[${agentType}] ${message}`;

    switch (level) {
      case 'error': {
        if (payload) {
          console.error(formattedLabel, payload);
        } else {
          console.error(formattedLabel);
        }
        return;
      }
      case 'warn': {
        if (payload) {
          console.warn(formattedLabel, payload);
        } else {
          console.warn(formattedLabel);
        }
        return;
      }
      default: {
        if (payload) {
          console.log(formattedLabel, payload);
        } else {
          console.log(formattedLabel);
        }
      }
    }
  }
}
