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
  private cleanupInterval: NodeJS.Timeout;

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

    console.log(`[connection-manager] Registered connection for event ${eventId} (total: ${eventConnections.controllers.size})`);
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
      console.log(`[connection-manager] No active connections for event ${eventId}`);
      return;
    }

    const encoder = new TextEncoder();
    // Use new enrichment message type
    const message = `data: ${JSON.stringify({
      type: 'agent_session_enrichment',
      event_id: eventId,
      timestamp: new Date().toISOString(),
      payload: enrichment,
    })}\n\n`;

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
  }
}

// Export singleton instance
export const connectionManager = new ConnectionManager();

