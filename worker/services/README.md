# Services Module

Hosts integrations that the worker uses to talk to external systems.

- **model-selection-service.ts**, **openai-service.ts**, and **sse-service.ts** encapsulate access to AI models and streaming endpoints.
- The `supabase/` submodule wraps all database interactions behind DTO-first repositories and gateways.
- The `observability/` submodule consolidates logging, metrics, checkpointing, and status updates used across runtime flows.

Update this module when changing third-party integration logic or introducing new external services.


