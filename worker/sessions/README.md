# Sessions Module

Coordinates user sessions end-to-end, including realtime streaming.

- **session-factory.ts** and **session-manager.ts** manage creation and lifecycle of session instances.
- **realtime-session/** holds the realtime controller, handlers, and utilities responsible for WebSocket updates.
- **realtime-session.ts** bridges the session factory with the realtime stack so processors can publish events.

Work in this module whenever session lifecycle rules or realtime wiring need to change.
