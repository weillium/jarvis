# Realtime Session Module

This directory implements the realtime session controller that streams updates to clients.

- **runtime-controller.ts**, **connection-manager.ts**, and **status-tracker.ts** maintain WebSocket connectivity and session state.
- **handlers/** contains per-agent event handlers that transform pipeline outputs into payloads.
- **payload-utils.ts**, **transport-utils.ts**, and **tokens.ts** provide shared helpers for batching, throttling, and token accounting.
- **types.ts** defines the payload and transport contracts used throughout the realtime stack.

Modify this module when you need to adjust websocket behavior, payload formats, or agent event routing.
