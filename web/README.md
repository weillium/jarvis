## Web App Architecture

This package hosts the operator dashboard and moderation tools that sit on top of the cards/facts workers. It is a Next.js 14 App Router project that uses:

- **Supabase** for auth + data access (via RLS protected tables).
- **React Query** as the single source of truth for server state.
- **Server Actions + API routes** to wrap Supabase operations behind DTO-friendly helpers.
- **Server-Sent Events (SSE)** for live cards/facts updates.

---

## Key Directories

- `app/api/` – HTTP surface area. Each feature gets its own folder and re-exports handlers that call the server actions.
- `server/actions/` – Supabase-aware functions that enforce auth/ownership and encapsulate queries.
- `features/*/components/` – UI building blocks. The cards feature now includes moderation controls and audit history.
- `shared/hooks/` – React Query hooks and mutation helpers. `use-sse-stream` centralises SSE handling.
- `shared/types/` – DTOs shared across app, API, and service layers.

---

## Cards Pipeline (Web)

### Initial data
- `useCardsQuery(eventId)` → `GET /api/cards/[eventId]` → `getCardsByEventId`.
- Returns canonical rows from `cards` table (the state mirror populated by the worker).

### Moderation
- `CardModerationPanel` (rendered inside `LiveCards`) lets moderators supply an optional reason and deactivate a card.
- `useUpdateCardActiveStatusMutation` posts to `POST /api/cards/[eventId]/moderate`.
- Server action `updateCardActiveStatus` validates ownership, flips `cards.is_active`, and writes an entry into `cards_audit_log`.
- Audit history surfaced via `useCardAuditLog` → `GET /api/cards/[eventId]/audit`.

### Live updates
- `web/app/api/stream/route.ts` subscribes to Supabase realtime on the `cards` table.
- Emits dedicated event types:
  - `card_created` – new snapshot
  - `card_updated` – in-place changes
  - `card_deactivated` – removed from the active list
  - `card_deleted` – hard delete safeguard
- `useSSEStream` pipes messages into `LiveCards`, which merges them into the React Query cache (`upsertCard`/`removeCard`).

---

## Card Audit Log Table

Created in migration `20251111172830_cards_audit_log.sql`.

| Column          | Purpose                                      |
|-----------------|----------------------------------------------|
| `event_id`      | Partition by event                           |
| `card_id`       | The card being moderated                     |
| `action`        | `deactivated`, `reactivated`, or `updated`   |
| `actor_id`      | User performing the action                   |
| `reason`        | Optional moderator reason                    |
| `payload_before`/`payload_after` | Snapshots for future diffs  |

RLS policies allow the event owner to read/insert, while the worker (service role) bypasses RLS.

---

## SSE Message Shapes

Defined in `shared/types/card.ts`:

- `SSECardCreatedMessage` `{ type: 'card_created', card: CardSnapshot, timestamp }`
- `SSECardUpdatedMessage` `{ type: 'card_updated', card: CardSnapshot, timestamp }`
- `SSECardDeactivatedMessage` `{ type: 'card_deactivated', card_id, timestamp }`
- `SSECardDeletedMessage` `{ type: 'card_deleted', card_id, timestamp }`
- Existing facts/heartbeat messages unchanged.

`CardSnapshot` captures payload, kind, sequence, and activation state so consumers can merge without re-fetching.

---

## Maintaining & Extending

- Add new moderation actions: extend `card-actions.ts` and append a new `action` enum literal + RLS policy if required.
- SSE changes only touch `app/api/stream/route.ts` and the message union in `shared/types/card.ts`.
- Prefer creating a hook under `shared/hooks/` (React Query) and a matching API route for any new server interaction.
- When touching Supabase schema, pair the migration with indexes and RLS (see existing migrations for patterns).

---

## Development

```bash
pnpm install
pnpm dev      # starts Next.js
pnpm lint     # runs eslint (uses minimal config aligned with project conventions)
```

The worker service uses Supabase service-role keys; the web client relies on anon keys with RLS enforced.
