---
trigger: always_on
---

# Project Rules

## scope

- Work within `/worker`, `/web`, `/supabase`, `/supabase/functions`, `/mobile`,
  `/packages`, and `/dev_docs` only.
- Preserve existing in-progress changes; do not revert without explicit
  approval.
- Confirm assumptions before aggressive refactors while we’re inside the active
  wave.
- This is a monorepo running primarily on pnpm + turbo.
- In every run, always ensure to resolve typescript and lint errors.

## worker

- DTO-first for all IO boundaries (Supabase / OpenAI / WebSocket).
- `any` forbidden in worker; use `unknown` with runtime guards instead.
- never inline `JSON.parse` directly → wrap with shared safe parse helpers.
- caught errors log as `String(err)` only → do not read `.message`, `.stack`,
  etc.
- normalization utilities → consolidate under `worker/lib/**`.
- maintain the separation between the **cards** realtime agent, the
  **transcripts** realtime agent, and the **facts** stateless agent.

## web

- React Query is the _only_ source of server state.
- prefer **query / mutation hooks** instead of custom fetch + useState.
- use absolute imports `@/*` in web code.
- **use Tamagui components from `@jarvis/ui-core`** for all UI work.
- import shared primitives: `Button`, `Input`, `Textarea`, `Card`, `Alert`,
  `YStack`, `XStack`, `Text`, `Sheet`, along with higher-level helpers like
  `ButtonGroup`, `FormField`, `ModalContent`, `EmptyStateCard`, and
  `LoadingState`.
- prefer shared utilities (e.g., `FileUpload`, `FileListItem`, shared icons from
  `@jarvis/ui-core/icons`) instead of inline SVGs or emoji.
- use Tamagui tokens (`$color`, `$gray11`, `$blue6`, etc.) and spacing (`$4`,
  `$6`, etc.) for styling.

## mobile

- Expo + React Native app; keep platform-specific code inside `/mobile`.
- **use Tamagui components from `@jarvis/ui-core`** for all UI work; same shared
  components as web.
- import shared primitives: `Button`, `Input`, `Textarea`, `Card`, `Alert`,
  `YStack`, `XStack`, `Text`, `Sheet` from `@jarvis/ui-core`.
- `TamaguiProvider` is already set up in `mobile/app/_layout.tsx`.

## packages

- `packages/ui-core` hosts shared Tamagui components and configuration consumed
  by both `/web` and `/mobile`.
- ensure exports remain platform-agnostic (Tamagui primitives, universal hooks,
  or pure logic).
- Tamagui config lives in `packages/ui-core/src/tamagui.config.ts`; theme tokens
  defined there.
- base components and structural helpers (`Button`, `Input`, `Textarea`, `Card`,
  `Alert`, `Modal`, `Badge`, `Select`, `DataTable`, `ButtonGroup`, `FormField`,
  `ModalContent`, `LoadingState`, etc.) live under
  `packages/ui-core/src/components/`.
- shared icons are exposed via `@jarvis/ui-core/icons`; use those instead of
  redefining SVGs in feature code.
- if platform-specific variants are required, gate them behind explicit
  sub-entries (e.g., `packages/ui-core/web` vs `packages/ui-core/native`).

## supabase

- every DB change is done via: `supabase migration new <name>`
- every DB change implementation is done via: `supabase migration up`
- pair every migration with required **indexes** and **RLS** policies.

## docs

- docs live under `/dev_docs/`
- filename pattern: `YYYYMMDD_HHMMSS_*`
