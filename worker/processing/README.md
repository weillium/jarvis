# Processing Module

Post-pipeline processors that turn enriched context into agent-specific outputs.

- **cards-processor.ts**, **facts-processor.ts**, and **transcript-processor.ts** translate context artifacts into the payloads consumed by realtime handlers and storage layers.

Modify this module when adjusting output shaping rules or adding new agent processors.
