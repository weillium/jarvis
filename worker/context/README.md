# Context Module

This module drives the multi-phase context pipeline that prepares knowledge for agent runs.

- **context-builder.ts**: entry point that assembles the pipeline run and wires orchestration dependencies.
- **pipeline/**: phase-specific logic for blueprint generation, glossary expansion, chunking, and orchestration utilities.
  - `orchestrator/` coordinates phase execution and status updates.
  - `blueprint/`, `glossary/`, and `chunks/` host the per-phase runners, persistence helpers, and DTOs.
- **glossary-manager.ts** and **vector-search.ts**: supporting services that expose glossary maintenance and semantic retrieval APIs to the phases.

Use this module when you need to evolve how the worker researches, chunks, or prepares context for downstream processors.

