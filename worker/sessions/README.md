# Sessions Module

Coordinates user sessions end-to-end, including realtime streaming.

- **session-factory.ts** and **session-manager.ts** manage creation and lifecycle of session instances and select the appropriate implementation per agent.
- **agent-profiles.ts** defines transport-aware agent profiles used by the factory, making it easy to flip agents between realtime and stateless adapters.
- **agent-profiles/cards/** hosts cards-specific transport metadata, tooling, and shared generation helpers.
- **session-adapters/** contains the realtime controllers, handlers, and utilities shared by agent-specific sessions.
- **session-adapters/transcript-realtime-session.ts** manages the audio-first transcript WebSocket flow.
- **session-adapters/cards-realtime-session.ts** manages the cards agent WebSocket flow and tool orchestration.
- **session-adapters.ts** exposes `StatelessAgentSession` (and `FactsStatelessSession`), the lightweight implementations that track status without realtime sockets.

Work in this module whenever session lifecycle rules or realtime wiring need to change.

