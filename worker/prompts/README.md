# Prompts Module

Centralizes prompt templates and builders used by the worker.

- Files are grouped by scenario: `blueprint.ts`, `context.ts`, `glossary.ts`, and `realtime.ts` each assemble text for their respective phases.
- **index.ts** exposes convenience exports so orchestrators can pull the right prompt without knowing the file layout.

Add or adjust prompts here when prompt wording or parameterization changes for any phase.


