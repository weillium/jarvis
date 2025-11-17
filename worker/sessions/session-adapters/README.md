# Realtime Session Module

This directory implements the realtime session controller that streams updates to clients.

- **runtime-controller.ts**, **connection-manager.ts**, and **shared/status-tracker.ts** maintain WebSocket connectivity and session state.
- **handlers/** contains per-agent event handlers that transform pipeline outputs into payloads.
- **shared/** hosts transport-agnostic helpers (message queue, payload utilities, status snapshots, token accounting, generic utils).
- **realtime/transport-utils.ts** provides realtime-specific helpers for socket state inspection.
- **types.ts** defines the payload and transport contracts used throughout the realtime stack.

Modify this module when you need to adjust websocket behavior, payload formats, or agent event routing.

