# Enrichment Module

This module provides pre-context data gathering before the pipeline runs.

- **enrichers/** offers pluggable data sources (web search, Wikipedia, document extraction) that normalize results into shared DTOs.
- **types.ts** defines enrichment contracts so the pipeline can consume results without coupling to specific sources.
- **index.ts** exposes the entry points used by context builders and pollers.

Extend this module when you want to add or adjust external knowledge sources feeding the context pipeline.



