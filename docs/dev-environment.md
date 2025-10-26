# Jarvis Development Environment Guide

## Prerequisites
- Node.js 20.x (includes Corepack)
- Enable pnpm via Corepack: `corepack enable` and `corepack prepare pnpm@9.0.0 --activate`
- Ensure the `TOGETHER_API_KEY` environment variable is set (stub value is acceptable for local development).

## Initial Setup
1. Install dependencies:
   ```bash
   pnpm install
   ```
2. Copy `.env.example` to `.env` and adjust values as needed:
   ```bash
   cp .env.example .env
   ```
3. (Optional) Build native dependencies if prompted (e.g., `better-sqlite3`).

## Running Services
### Backend API + WebSockets
```bash
pnpm dev:backend
```
- Serves REST API on `http://localhost:8080`
- Provides WebSocket namespaces `/ws/transcript` and `/ws/cards`

### Web Client
In a new terminal:
```bash
pnpm dev:web
```
Access the client at `http://localhost:3000`.

### Mobile Client (Expo)
In another terminal:
```bash
pnpm dev:mobile
```
Follow Expo CLI instructions to open the app in a simulator or Expo Go.

## Developer Replay Harness
With the backend running, you can stream the sample transcript:
```bash
pnpm dlx ts-node dev/replay.ts
```
This sends frames to `/ws/transcript`; observe cards in the web or mobile client.

## Running Tests
Execute the repository-wide test suite:
```bash
pnpm -r test -- --run
```

## Troubleshooting
- If `pnpm install` complains about the package manager version, ensure Corepack activated pnpm 9.0.0.
- For WebSocket connection issues, verify the backend is running and accessible on port 8080.
- Metrics are exposed at `http://localhost:8080/metrics` when the backend is in development mode.
