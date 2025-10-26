# Mobile & Web Integration Notes

- Deep link format: `jarvis://event/{id}`
- QR code payload: `jarvis://event/{id}`
- WebSocket reconnect: Expo backoff (initial 500ms, max 10000ms)
- Client queue: max 50 items, drop policy `drop_oldest_low_priority`
- Accessibility: dynamic type support, screen reader labels, minimum contrast ratio 4.5
