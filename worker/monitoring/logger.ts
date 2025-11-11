import type { LogEntry, AgentType, LogContext } from '../types';

export class Logger {
  private logBuffers: Map<string, LogEntry[]> = new Map();

  log(
    eventId: string,
    agentType: AgentType,
    level: 'log' | 'warn' | 'error',
    message: string,
    context?: LogContext
  ): void {
    const key = this.getKey(eventId, agentType);
    if (!this.logBuffers.has(key)) {
      this.logBuffers.set(key, []);
    }

    const buffer = this.logBuffers.get(key)!;
    const baseContext: LogContext = {
      agent_type: agentType,
      event_id: eventId,
    };
    const mergedContext: LogContext = context ? { ...context, ...baseContext } : baseContext;
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

    this.print(level, agentType, message, entry.context);
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

  private print(
    level: 'log' | 'warn' | 'error',
    agentType: AgentType,
    message: string,
    context?: LogContext
  ): void {
    const formattedLabel = `[${agentType}] ${message}`;

    let payload: LogContext | undefined;
    if (context && Object.keys(context).length > 0) {
      payload = context;
    }

    if (level === 'error') {
      if (payload) {
        console.error(formattedLabel, payload);
      } else {
        console.error(formattedLabel);
      }
      return;
    }

    if (level === 'warn') {
      if (payload) {
        console.warn(formattedLabel, payload);
      } else {
        console.warn(formattedLabel);
      }
      return;
    }

    if (payload) {
      console.log(formattedLabel, payload);
    } else {
      console.log(formattedLabel);
    }
  }
}
