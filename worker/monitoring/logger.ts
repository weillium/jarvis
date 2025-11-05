import { LogEntry, AgentType } from '../types';

export class Logger {
  private logBuffers: Map<string, LogEntry[]> = new Map();

  log(
    eventId: string,
    agentType: AgentType,
    level: 'log' | 'warn' | 'error',
    message: string,
    context?: { seq?: number; event_id?: string }
  ): void {
    const key = this.getKey(eventId, agentType);
    if (!this.logBuffers.has(key)) {
      this.logBuffers.set(key, []);
    }

    const buffer = this.logBuffers.get(key)!;
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: {
        ...context,
        agent_type: agentType,
        event_id: eventId,
      },
    };

    buffer.push(entry);
    if (buffer.length > 100) {
      buffer.shift();
    }

    if (level === 'error') {
      console.error(`[${agentType}] ${message}`);
    } else if (level === 'warn') {
      console.warn(`[${agentType}] ${message}`);
    } else {
      console.log(`[${agentType}] ${message}`);
    }
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
}
