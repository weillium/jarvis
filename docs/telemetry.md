# Telemetry & Alerts

Metrics:
- `jarvis_latency_end_ms`
- `jarvis_latency_llm_ms`
- `jarvis_latency_sql_ms`
- `jarvis_latency_vec_ms`
- `jarvis_latency_web_ms`
- `jarvis_cards_emitted_total`
- `jarvis_cards_suppressed_total`
- `jarvis_json_invalid_total`
- `jarvis_retrieval_mix`

Grafana dashboards live in `dev/grafana`.

Alerts:
- `P95>5s`: `histogram_quantile(0.95, sum(rate(jarvis_latency_end_ms_bucket[5m])) by (le)) > 5000` (for 5m)
- `JSONInvalid>1%`: `rate(jarvis_json_invalid_total[5m]) / rate(jarvis_cards_emitted_total[5m]) > 0.01` (for 5m)
- `WebRAG>30%`: `rate(jarvis_retrieval_mix{source="web"}[10m]) / rate(jarvis_cards_emitted_total[10m]) > 0.3` (for 10m)
