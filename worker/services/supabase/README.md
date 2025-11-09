# Supabase Services

This module wraps Supabase access for the worker.

- **client.ts** manages the shared Supabase client configuration.
- Repository files (`*-repository.ts`) expose CRUD methods scoped to agents, sessions, checkpoints, transcripts, and facts.
- **dto-mappers.ts** and **types.ts** translate between Supabase rows and worker DTOs, enforcing the DTO-first contract.
- **vector-search-gateway.ts** provides the interface to Supabase vector search for context retrieval.

Use this module when you need to evolve database interactions or add new persistence surfaces for the worker.


