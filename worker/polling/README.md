# Polling Module

Contains background pollers that keep the worker responsive to external triggers.

- Each `*-poller.ts` watches for a specific condition (session startup, regeneration, pause/resume, context refresh) and enqueues work into the core runtime.
- **base-poller.ts** provides shared scheduling and backoff logic for concrete pollers.

Extend this module when a new recurring check is needed or polling cadence must change.






