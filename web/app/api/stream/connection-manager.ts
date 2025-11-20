/**
 * SSE Connection Manager
 * Maintains a map of active SSE connections per event for worker-to-SSE push
 */

interface SSEController {
  enqueue: (data: Uint8Array) => void;
  close: () => void;
}

interface EventConnections {
  controllers: Set<SSEController>;
  lastActivity: number;
}

class ConnectionManager {
  private connections: Map<string, EventConnections> = new Map();
  private cleanupInterval: ReturnType<typeof setInterval>;
  private noConnectionLogged: Set<string> = new Set();
  private lastStatuses: Map<string, Map<string, { payload: any; storedAt: number }>> = new Map();

  constructor() {
    // Clean up stale connections every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleConnections();
    }, 5 * 60 * 1000);
  }

  /**
   * Register a new SSE connection for an event
   */
  register(eventId: string, controller: SSEController): void {
    if (!this.connections.has(eventId)) {
      this.connections.set(eventId, {
        controllers: new Set(),
        lastActivity: Date.now(),
      });
    }

    const eventConnections = this.connections.get(eventId)!;
    eventConnections.controllers.add(controller);
    eventConnections.lastActivity = Date.now();

    if (this.noConnectionLogged.has(eventId)) {
      this.noConnectionLogged.delete(eventId);
    }

    console.log(`[connection-manager] Registered connection for event ${eventId} (total: ${eventConnections.controllers.size})`);

    // Replay the most recent statuses so freshly connected clients don't have to wait
    const lastStatusesForEvent = this.lastStatuses.get(eventId);
    if (lastStatusesForEvent && lastStatusesForEvent.size > 0) {
      const encoder = new TextEncoder();
      for (const { payload } of lastStatusesForEvent.values()) {
        const replayMessage = this.buildMessage(eventId, payload);
        try {
          controller.enqueue(encoder.encode(replayMessage));
        } catch (error) {
          console.warn('[connection-manager] Failed to replay status for event', eventId, error);
        }
      }
    }
  }

  /**
   * Unregister an SSE connection
   */
  unregister(eventId: string, controller: SSEController): void {
    const eventConnections = this.connections.get(eventId);
    if (!eventConnections) return;

    eventConnections.controllers.delete(controller);
    eventConnections.lastActivity = Date.now();

    console.log(`[connection-manager] Unregistered connection for event ${eventId} (remaining: ${eventConnections.controllers.size})`);

    // Clean up empty event connections
    if (eventConnections.controllers.size === 0) {
      this.connections.delete(eventId);
      this.noConnectionLogged.delete(eventId);
      // Retain last statuses so the next connection can hydrate immediately
    }
  }

  /**
   * Push enrichment update to all connections for an event
   * Only sends enrichment data (websocket_state, ping_pong, logs, metrics)
   * Database state (status, metadata) comes from React Query
   */
  pushStatus(eventId: string, enrichment: any): void {
    const eventConnections = this.connections.get(eventId);
    if (!eventConnections || eventConnections.controllers.size === 0) {
      if (!this.noConnectionLogged.has(eventId)) {
        console.log(`[connection-manager] No active connections for event ${eventId}`);
        this.noConnectionLogged.add(eventId);
      }
      this.storeLastStatus(eventId, enrichment);
      return;
    }

    const encoder = new TextEncoder();
    this.storeLastStatus(eventId, enrichment);
    const message = this.buildMessage(eventId, enrichment);

    const data = encoder.encode(message);
    let pushedCount = 0;
    const deadControllers: SSEController[] = [];

    for (const controller of eventConnections.controllers) {
      try {
        controller.enqueue(data);
        pushedCount++;
      } catch (error) {
        // Connection is dead, mark for removal
        deadControllers.push(controller);
      }
    }

    // Remove dead controllers
    for (const controller of deadControllers) {
      eventConnections.controllers.delete(controller);
    }

    eventConnections.lastActivity = Date.now();

    if (pushedCount > 0) {
      console.log(`[connection-manager] Pushed enrichment to ${pushedCount} connection(s) for event ${eventId}`);
      if (this.noConnectionLogged.has(eventId)) {
        this.noConnectionLogged.delete(eventId);
      }
    }
  }

  /**
   * Clean up stale connections (older than 30 minutes)
   */
  private cleanupStaleConnections(): void {
    const now = Date.now();
    const staleThreshold = 30 * 60 * 1000; // 30 minutes

    for (const [eventId, eventConnections] of this.connections.entries()) {
      if (now - eventConnections.lastActivity > staleThreshold) {
        console.log(`[connection-manager] Cleaning up stale connections for event ${eventId}`);
        for (const controller of eventConnections.controllers) {
          try {
            controller.close();
          } catch (error) {
            // Ignore errors during cleanup
          }
        }
        this.connections.delete(eventId);
        this.noConnectionLogged.delete(eventId);
        this.lastStatuses.delete(eventId);
      }
    }
  }

  /**
   * Get connection count for an event
   */
  getConnectionCount(eventId: string): number {
    return this.connections.get(eventId)?.controllers.size || 0;
  }

  /**
   * Shutdown and cleanup
   */
  shutdown(): void {
    clearInterval(this.cleanupInterval);
    for (const [eventId, eventConnections] of this.connections.entries()) {
      for (const controller of eventConnections.controllers) {
        try {
          controller.close();
        } catch (error) {
          // Ignore errors
        }
      }
    }
    this.connections.clear();
    this.noConnectionLogged.clear();
    this.lastStatuses.clear();
  }

  private storeLastStatus(eventId: string, enrichment: any): void {
    if (!enrichment || typeof enrichment !== 'object') {
      return;
    }

    const agentType = typeof enrichment.agent_type === 'string' ? enrichment.agent_type : '__global__';
    if (!this.lastStatuses.has(eventId)) {
      this.lastStatuses.set(eventId, new Map());
    }

    const eventStatusMap = this.lastStatuses.get(eventId)!;
    eventStatusMap.set(agentType, {
      payload: enrichment,
      storedAt: Date.now(),
    });
  }

  private buildMessage(eventId: string, enrichment: any): string {
    return `data: ${JSON.stringify({
      type: 'agent_session_enrichment',
      event_id: eventId,
      timestamp: new Date().toISOString(),
      payload: enrichment,
    })}\n\n`;
  }
}

// Export singleton instance
export const connectionManager = new ConnectionManager();

