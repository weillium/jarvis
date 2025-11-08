# Core Module

The core module hosts the runtime control loop that steers the worker during live sessions.

- **orchestrator.ts** connects external events to the runtime pipeline.
- **event-processor.ts**, **runtime-manager.ts**, and **runtime-service.ts** manage the execution graph and resource scheduling.
- **session-lifecycle.ts** and the subfolder `orchestrator/` coordinate status tracking and transcript routing across agents.

Touch this module when you need to adjust how the worker schedules phases, responds to events, or coordinates multiple agents.

