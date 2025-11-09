# Sessions Module

Coordinates user sessions end-to-end, including realtime streaming.

## Directory Map

- **session-factory.ts** – central entry point. Pulls transport metadata from `agent-profiles/registry.ts`, resolves transports/models, and instantiates either the realtime or stateless driver.
- **session-manager.ts** – orchestrates factory usage and lifecycle transitions.

- **agent-profiles/** – one folder per agent.
  - `<agent>/realtime/profile.ts` – realtime profile hooks (connection intent, session configuration, handler wiring).
  - `<agent>/stateless/profile.ts` – stateless profile hooks (sendMessage logic, optional lifecycle hooks).
  - `registry.ts` – aggregated transport map (`defaultTransport`, transport-specific profiles).

- **session-adapters/**
  - `realtime/driver.ts` – reusable realtime session wrapper.
  - `realtime/profile-types.ts` – interface consumed by realtime profiles.
  - `stateless/driver.ts` – reusable stateless session wrapper.
  - `stateless/profile-types.ts` – interface consumed by stateless profiles.
  - `shared/` – utilities (message queue, heartbeat, runtime controller, etc.).
  - `stateless-base/` – legacy `StatelessAgentSession`; reused by the stateless driver.

- **agent-profiles.ts** – exports `defaultAgentProfiles`, mapping agent types to a transport-aware `createSession` function (uses the drivers and registry data).

## Transport Profile Flow

1. **Factory Input**: caller chooses an agent + optional transport/model override.
2. **Registry Lookup**: `agent-profiles/registry.ts` provides the agent’s default transport and transport-specific profiles.
3. **Model Resolution**: transport profile can supply `resolveModel` / `defaultModel`. Factory calls these helpers before creating the driver.
4. **Driver Instantiation**:
   - Realtime → `session-adapters/realtime/driver.ts`
   - Stateless → `session-adapters/stateless/driver.ts`
5. **Profile Hooks**: driver invokes the profile’s hooks (send message handling, event wiring, etc.).

## Adding or Modifying an Agent

1. Create `agent-profiles/<agent>/realtime/profile.ts` and/or `stateless/profile.ts` implementing the respective profile interfaces.
2. Export profile metadata through `agent-profiles/<agent>.ts` (mirroring cards/transcript/facts).
3. Register the agent in `agent-profiles/registry.ts` with default transport and available transports.
4. (Optional) Add generator/tooling helpers under the agent folder.
5. No changes to `session-factory.ts` required beyond new default model env vars if applicable.

## Environment Hooks

| Variable                 | Purpose                                 | Default            |
|-------------------------|------------------------------------------|--------------------|
| `CARDS_STATELESS_MODEL` | Default model for cards stateless runs   | `gpt-4o-mini`      |
| `CARDS_REALTIME_MODEL`  | Default model for cards realtime sessions| `gpt-realtime`     |

## Testing & Verification

Run from repo root:

```bash
pnpm --dir worker exec tsc --noEmit
pnpm --dir worker lint
```

Integration tests for cards/transcript/facts should still pass; stateless driver hooks now support lifecycle callbacks and internal storage snapshots.


