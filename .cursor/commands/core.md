---
type: command
version: 2
scope: repository
generated_by: System Architecture Update
description: >
  Contextual commands for Jarvis project. Commands follow 2025 Cursor AI best practices:
  explicit steps, clear validation, proper error handling, React Query patterns.
---

# Jarvis Project Commands

> **Usage**: Reference commands by name (e.g., "Command: Add React Query Hook")
> Commands follow project rules in `.cursor/rules/project.mdc`

## Command Schema

Each command includes:
- **name**: Short, action-oriented title
- **intent**: Clear goal statement
- **triggers**: Natural language phrases that activate
- **context**: What to understand before executing
- **steps**: Explicit, ordered sequence
- **validation**: Checks to confirm success
- **rollback**: How to safely revert

---

## Frontend Commands

### Add React Query Hook

**Intent**: Create a new `useQuery` or `useMutation` hook following project patterns.

**Triggers**: "add query hook", "create mutation hook", "add react query hook"

**Context**:
- Check existing hooks in `web/shared/hooks/use-*-query.ts` and `use-mutations.ts`
- Determine if query (data fetching) or mutation (data modification)
- Identify API endpoint to call
- Determine query keys and cache invalidation strategy

**Steps**:
1. Create file: `web/shared/hooks/use-<name>-query.ts` (for queries) or add to `use-mutations.ts` (for mutations)
2. Import: `useQuery`/`useMutation` and `useQueryClient` from `@tanstack/react-query`
3. For queries:
   - Define `queryKey`: `['resource', identifier]` (e.g., `['agent', eventId]`)
   - Define `queryFn`: async function calling API endpoint
   - Add `enabled` option if conditional
   - Add `refetchInterval` if polling needed
   - Add `staleTime` if appropriate
4. For mutations:
   - Define `mutationFn`: async function calling API endpoint
   - Add `onSuccess`: `queryClient.invalidateQueries({ queryKey: [...] })`
   - Handle errors with user-friendly messages
5. Export hook function
6. Use in component (replace any manual `fetch` + `useState` patterns)

**Validation**:
- ✅ Hook compiles (`tsc --noEmit`)
- ✅ Hook used in component and works
- ✅ Mutations invalidate related queries
- ✅ No manual `fetch` patterns remain
- ✅ ESLint passes

**Rollback**:
- Delete hook file or remove from `use-mutations.ts`
- Restore previous manual fetch patterns if needed

---

### Add Feature Module

**Intent**: Create a new feature module with components, hooks, and types.

**Triggers**: "add feature", "create feature module", "new feature"

**Context**:
- Check `web/features/` directory structure
- Determine feature domain (agents, cards, events, context, facts, etc.)
- Identify if UI components needed or just logic/hooks

**Steps**:
1. Create directory: `web/features/<domain>/`
2. Create component file: `web/features/<domain>/components/<name>.tsx`
3. Add `'use client'` directive if client component
4. Create types: `web/features/<domain>/types.ts` if domain-specific types needed
5. Create hooks: `web/features/<domain>/hooks/use<Name>.ts` if feature-specific hooks
6. Use React Query hooks from `web/shared/hooks/` for server state
7. Export from `web/features/<domain>/index.ts` if barrel export needed
8. Import and use in page or parent component

**Validation**:
- ✅ Component renders without errors
- ✅ TypeScript compiles
- ✅ No unused imports
- ✅ ESLint passes
- ✅ React Query hooks used correctly

**Rollback**:
- Delete `web/features/<domain>/` directory
- Remove imports from consuming files

---

### Add Page Route

**Intent**: Create a new Next.js App Router page.

**Triggers**: "add page", "create route", "new page"

**Context**:
- Check `web/app/` directory structure
- Determine route group: `(app)` for authenticated, `(marketing)` for public
- Check if dynamic route needed (`[param]`)
- Identify if server or client component

**Steps**:
1. Create `web/app/<path>/page.tsx`
2. For dynamic routes: `web/app/<path>/[param]/page.tsx`
3. Add proper Props type: `{ params: Promise<{ param: string }> }` for dynamic routes
4. Use `await params` in Next.js 16
5. Import React Query hooks for server state
6. Add metadata export if SEO needed
7. Create `layout.tsx` if route group needs custom layout
8. Use shared components from `web/shared/ui/` or `web/features/`

**Validation**:
- ✅ Page renders at route
- ✅ TypeScript types correct
- ✅ React Query hooks work
- ✅ No console errors

**Rollback**:
- Delete `page.tsx` and `layout.tsx` if created
- Remove route from navigation

---

### Add API Route

**Intent**: Create a Next.js API route for server-side endpoints.

**Triggers**: "add API route", "create endpoint", "add SSE endpoint"

**Context**:
- Check if Server Action would be more appropriate
- Review existing routes (`/api/ingest`, `/api/stream`) for patterns
- Determine if SSE streaming needed (use ReadableStream pattern)
- Check if service role key needed

**Steps**:
1. Create `web/app/api/<name>/route.ts`
2. Export handlers: `GET`, `POST`, `PUT`, `DELETE` as needed
3. For SSE: Use ReadableStream pattern (see `/api/stream/route.ts`)
   - Create `ReadableStream` with `start` controller
   - Subscribe to Supabase Realtime channels
   - Handle client disconnect with `req.signal.addEventListener('abort')`
   - Return Response with `text/event-stream` headers
4. For JSON: Use `NextResponse.json()` with proper status codes
5. Add CORS headers if needed
6. Use `SUPABASE_SERVICE_ROLE_KEY` for privileged operations (server-only)
7. Add error handling with try-catch

**Validation**:
- ✅ Endpoint works via curl or browser
- ✅ CORS headers correct if needed
- ✅ Error handling works
- ✅ SSE stream stays open and handles disconnect

**Rollback**:
- Delete `route.ts` file
- Remove client-side calls

---

### Refactor to React Query

**Intent**: Replace manual `fetch` + `useState` patterns with React Query hooks.

**Triggers**: "refactor to react query", "use react query", "replace fetch"

**Context**:
- Find all manual `fetch` calls in component
- Identify if query (GET) or mutation (POST/PUT/DELETE)
- Determine query keys and cache invalidation needs

**Steps**:
1. Create or use existing React Query hook (`use-*-query.ts` or `use-mutations.ts`)
2. Replace `useState` for data with `useQuery` result
3. Replace `useState` for loading with `isLoading` from `useQuery`
4. Replace `useState` for error with `error` from `useQuery`
5. Replace manual `fetch` handlers with `useMutation` hooks
6. Add `queryClient.invalidateQueries()` in mutation `onSuccess`
7. Remove manual `useEffect` for data fetching
8. Update component to use hook results

**Validation**:
- ✅ No manual `fetch` patterns remain
- ✅ All server state via React Query
- ✅ Mutations invalidate queries
- ✅ Component works correctly
- ✅ ESLint passes

**Rollback**:
- Restore previous `useState` + `fetch` patterns
- Remove React Query hook if created

---

## Backend Commands

### Add Migration

**Intent**: Create a new Supabase database migration.

**Triggers**: "add migration", "create migration", "database schema change"

**Context**:
- Check latest migration timestamp in `supabase/migrations/`
- Review existing migrations for patterns
- Determine if RLS policies needed

**Steps**:
1. **CRITICAL**: Use Supabase CLI: `supabase migration new <descriptive_name>`
   - Generates correct timestamp: `YYYYMMDDHHMMSS_<name>.sql`
   - NEVER manually create with hardcoded dates
2. Write SQL: CREATE/ALTER/DROP statements
3. Add comments for rollback
4. Add RLS policies if creating tables: `CREATE POLICY ... FOR SELECT USING (owner_uid = auth.uid())`
5. Add indexes for foreign keys and frequently queried columns
6. Add GRANT statements if needed

**Validation**:
- ✅ Migration applies: `supabase db reset`
- ✅ No syntax errors: `supabase migration list`
- ✅ RLS policies correct
- ✅ Indexes created

**Rollback**:
- Create reverse migration with opposite operations
- Or manually revert if not applied to production

---

### Add RPC Function

**Intent**: Create a PostgreSQL stored procedure/function.

**Triggers**: "add RPC function", "create stored procedure", "add database function"

**Context**:
- Check existing RPC functions (`create_event_with_agent`, `match_context`) for patterns
- Determine if RPC vs. Edge Function vs. application code
- Review if SECURITY DEFINER needed (use with caution)

**Steps**:
1. Create migration: `supabase migration new rpc_<name>`
2. Write function: `CREATE OR REPLACE FUNCTION <name>(...) RETURNS ... LANGUAGE plpgsql`
3. Add `SECURITY DEFINER` if needed (with caution)
4. Add `GRANT EXECUTE` to `authenticated` and/or `service_role`
5. Add comments describing parameters and return value
6. Test function locally

**Validation**:
- ✅ Function works via `supabase.rpc()` call
- ✅ Return type matches TypeScript expectations
- ✅ Performance acceptable (EXPLAIN ANALYZE if query-heavy)

**Rollback**:
- Create migration with `DROP FUNCTION <name>`
- Or comment out in migration file

---

### Add Edge Function

**Intent**: Create a Supabase Edge Function (Deno runtime).

**Triggers**: "add edge function", "create supabase function", "add serverless endpoint"

**Context**:
- Check `supabase/functions/` directory
- Review `orchestrator` function as reference
- Determine if JWT verification needed

**Steps**:
1. Create `supabase/functions/<name>/index.ts`
2. Create `supabase/functions/<name>/deno.json` with imports map
3. Add function config to `supabase/config.toml`: `[functions.<name>]`
4. Implement CORS headers and OPTIONS handler
5. Add JWT verification if needed: `verify_jwt = true` in config
6. Return JSON: `{ ok: boolean, error?: string, ...data }`
7. Add error handling

**Validation**:
- ✅ Function works: `supabase functions serve <name>`
- ✅ CORS headers correct
- ✅ Error handling returns proper JSON
- ✅ JWT verification works if enabled

**Rollback**:
- Delete `supabase/functions/<name>/` directory
- Remove `[functions.<name>]` from `config.toml`

---

## Worker Commands

### Add Worker Task

**Intent**: Add a new background processing task to the orchestrator.

**Triggers**: "add worker task", "background job", "add orchestrator task"

**Context**:
- Review `worker/core/orchestrator.ts` for event-driven patterns
- Review `worker/index.ts` for polling patterns
- Determine if event-driven (Realtime) or polling-based (fallback)
- Check worker has required env vars

**Steps**:
1. **For event-driven**:
   - Add handler in `worker/core/orchestrator.ts` (e.g., `handleTranscriptInsert`)
   - Subscribe to Supabase Realtime in `orchestrator.initialize()`
   - Use `supabaseService.subscribeToTranscripts()` pattern
2. **For polling** (fallback):
   - Create poller class in `worker/polling/`
   - Add to `worker/index.ts` with `setInterval()`
   - Use `processingAgents` Set to prevent duplicates
3. Add error handling with logging
4. Update `EventRuntime` interface if extending state
5. Add status updates to database if needed

**Validation**:
- ✅ Task executes correctly
- ✅ Logs show execution
- ✅ Database state changes correct
- ✅ Realtime subscription works (if event-driven)

**Rollback**:
- Remove handler/subscription code
- Remove poller and interval
- Revert database changes

---

### Add Enrichment Enricher

**Intent**: Add a new enricher to the context enrichment framework.

**Triggers**: "add enricher", "create enrichment source", "add context enrichment"

**Context**:
- Review `worker/enrichment/enrichers/base-enricher.ts` for interface
- Check existing enrichers for patterns
- Determine if API keys or external services needed

**Steps**:
1. Create `worker/enrichment/enrichers/<name>.ts`
2. Extend `BaseEnricher` class
3. Implement `enrich()` method
4. Override `getChunkingStrategy()` and `getQualityScore()` if needed
5. Register in `worker/enrichment/index.ts` (EnrichmentOrchestrator)
6. Add env vars: `ENRICHMENT_<NAME>_ENABLED`, etc.
7. Update `getEnrichmentConfig()` if needed

**Validation**:
- ✅ Enricher works in isolation
- ✅ Chunks generated with proper metadata
- ✅ Quality scores reasonable (0-1 range)
- ✅ Integration with context builder works

**Rollback**:
- Delete enricher file
- Remove from EnrichmentOrchestrator
- Remove env vars

---

## General Commands

### Add Type Definitions

**Intent**: Generate or manually add TypeScript types for Supabase.

**Triggers**: "add types", "generate supabase types", "type definitions"

**Context**:
- Check if types exist in `web/shared/types/`
- Review database schema
- Determine if generated or manual

**Steps**:
1. Generate: `supabase gen types typescript --local > web/shared/types/database.ts`
2. Or manually create based on schema
3. Export `Database` type and helpers (`Tables`, `Functions`)
4. Import in components and server actions
5. Create domain-specific types in `web/features/*/types.ts` if needed

**Validation**:
- ✅ Types match schema (`supabase db diff`)
- ✅ TypeScript compiles
- ✅ Autocomplete works

**Rollback**:
- Delete or revert types file
- Remove type imports

---

### Add Environment Variable

**Intent**: Document and configure a new environment variable.

**Triggers**: "add env variable", "new configuration", "environment setting"

**Context**:
- Check existing env vars in `worker/index.ts` and codebase
- Determine if `NEXT_PUBLIC_` prefix needed (exposed to browser)
- Check if worker or web app variable

**Steps**:
1. Add to `worker/.env.example` (if worker-related)
2. Add to `web/.env.local.example` (if web-related)
3. Update `.cursor/rules/project.mdc` section 8
4. Add usage in code with `need()` helper or `process.env`
5. Document purpose and default in comments

**Validation**:
- ✅ Missing var errors gracefully
- ✅ Variable used correctly
- ✅ No secrets exposed to client

**Rollback**:
- Remove env var usage
- Remove from `.env.example` files
- Revert documentation

---

### Generate Documentation

**Intent**: Create analysis or architecture documentation.

**Triggers**: "generate documentation", "create analysis", "write architecture doc"

**Context**:
- Verify `dev_docs/` directory exists
- Determine if user-facing (goes in `dev_docs/`) vs. code docs (JSDoc)

**Steps**:
1. Generate timestamp: `date +%Y%m%d_%H%M%S`
2. Create file: `dev_docs/<timestamp>_<descriptive_name>.md`
3. Write markdown with clear headings
4. Ensure descriptive/analytical purpose

**Validation**:
- ✅ File in `dev_docs/` directory
- ✅ Filename has timestamp prefix (`YYYYMMDD_HHMMSS`)
- ✅ Markdown syntax valid

**Rollback**:
- Delete `dev_docs/<timestamp>_<descriptive_name>.md`

---

## Command Best Practices

1. **Always use React Query** for server state (never manual `fetch` + `useState`)
2. **Always use Supabase CLI** for migrations (never manual timestamp files)
3. **Always invalidate queries** in mutations (`queryClient.invalidateQueries()`)
4. **Always handle errors** with user-friendly messages
5. **Always validate** before marking complete
6. **Always check context** before executing steps

---

**Last Updated:** 2025-11-05
