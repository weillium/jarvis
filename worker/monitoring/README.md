# Monitoring Module

Provides observability utilities for the worker runtime.

- **logger.ts** standardizes structured logging for pipeline phases and sessions.
- **metrics-collector.ts** emits performance metrics consumed by dashboards or alerts.
- **checkpoint-manager.ts** and **status-updater.ts** keep long-running pipelines resumable and surface progress to downstream systems.

Update this module when you need new telemetry hooks or to change how progress is reported.
