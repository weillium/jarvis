# Services Module

Hosts integrations that the worker uses to talk to external systems.

- **model-selection-service.ts**, **openai-service.ts**, and **sse-service.ts** encapsulate access to AI models and streaming endpoints.
- The `supabase/` submodule wraps all database interactions behind DTO-first repositories and gateways.

Update this module when changing third-party integration logic or introducing new external services.
