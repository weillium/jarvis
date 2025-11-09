# Sessions Module

Coordinates user sessions end-to-end, including realtime streaming.

- **session-factory.ts** and **session-manager.ts** manage creation and lifecycle of session instances and select the appropriate implementation per agent.
- **agent-profiles.ts** defines transport-aware agent profiles used by the factory, making it easy to flip agents between realtime and stateless adapters.
- **agent-profiles/cards/** hosts cards-specific transport metadata, tooling, and shared generation helpers.
- **agent-profiles/transcript/** mirrors the cards helpers, encapsulating transcript realtime session configuration and event wiring.
- **session-adapters/** contains the realtime controllers, handlers, and utilities shared by agent-specific sessions.
- **session-adapters/realtime-profile.ts** describes the hooks a realtime agent provides so transports can stay generic.
- **session-adapters/realtime-session.ts** implements the shared realtime adapter that wires a profile into OpenAI Realtime.
- **session-adapters.ts** exposes `StatelessAgentSession` (and `FactsStatelessSession`), the lightweight implementations that track status without realtime sockets.

Work in this module whenever session lifecycle rules or realtime wiring need to change.

