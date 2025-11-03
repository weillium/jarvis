---
type: command
version: 1
scope: repository
generated_by: Repo Architect Agent
description: >
  Core contextual commands for this repository. Each command maps plain-language user prompts to deterministic actions.
---

# Project Commands

> Use commands verbatim (e.g., "Command: Add Feature Module").  
> Cursor will expand each into stepwise edits following `.cursor/rules/project.md`.

## Command Schema

```yaml
fields:
  - name: name
    desc: short command title
  - name: intent
    desc: goal in one sentence
  - name: triggers
    desc: natural language prompts that activate this command
  - name: prechecks
    desc: files or configs to inspect before execution
  - name: steps
    desc: explicit edit sequence
  - name: validations
    desc: tests or checks to confirm correctness
  - name: rollback
    desc: how to revert safely
```

---

### Commands

```yaml
- name: Add Feature Module
  intent: Create a new feature folder with component, hooks, and types scaffolding.
  triggers:
    - "add new feature"
    - "create feature module"
    - "scaffold feature"
  prechecks:
    - "verify web/features directory exists"
    - "check tsconfig.json paths alias @/*"
  steps:
    - "create web/features/<name>/index.tsx (or .ts if no UI)"
    - "create web/features/<name>/hooks/use<Name>.ts if needed"
    - "create web/features/<name>/types.ts for domain types"
    - "add exports to web/features/<name>/index.ts"
    - "import and use in relevant page or component"
  validations:
    - "run pnpm lint in web/"
    - "verify TypeScript compiles (tsc --noEmit)"
    - "check no unused imports"
  rollback:
    - "delete web/features/<name>/ directory"
    - "remove imports from consuming files"
```

```yaml
- name: Add Migration
  intent: Create a new Supabase database migration with timestamp and SQL changes.
  triggers:
    - "add migration"
    - "create migration"
    - "database schema change"
  prechecks:
    - "verify supabase/migrations/ directory exists"
    - "check latest migration timestamp to ensure ordering"
    - "review existing migrations for patterns"
  steps:
    - "generate timestamp: YYYYMMDDHHMMSS"
    - "create supabase/migrations/<timestamp>_<descriptive_name>.sql"
    - "write CREATE/ALTER/DROP statements with proper rollback comments"
    - "add RLS policies if creating tables (grant/revoke)"
    - "add indexes for foreign keys and frequently queried columns"
  validations:
    - "run supabase db reset locally to test migration"
    - "verify no syntax errors (supabase migration list)"
    - "check RLS policies are correct for authenticated users"
  rollback:
    - "create reverse migration file with opposite operations"
    - "or manually revert changes if migration not applied to production"
```

```yaml
- name: Add Edge Function
  intent: Create a new Supabase Edge Function with Deno runtime and CORS setup.
  triggers:
    - "add edge function"
    - "create supabase function"
    - "add serverless endpoint"
  prechecks:
    - "verify supabase/functions/ directory exists"
    - "check supabase/config.toml for function configuration format"
    - "review orchestrator function as reference"
  steps:
    - "create supabase/functions/<name>/index.ts"
    - "create supabase/functions/<name>/deno.json with imports map"
    - "create supabase/functions/<name>/types.d.ts for Deno types"
    - "add function config to supabase/config.toml [functions.<name>]"
    - "implement CORS headers and OPTIONS handler"
    - "add JWT verification if needed (verify_jwt = true)"
  validations:
    - "run supabase start and test function via curl"
    - "verify CORS headers in response"
    - "check error handling returns JSON { ok: false, error: string }"
  rollback:
    - "delete supabase/functions/<name>/ directory"
    - "remove [functions.<name>] section from config.toml"
```

```yaml
- name: Add RPC Function
  intent: Create a PostgreSQL stored procedure/function for atomic operations or complex queries.
  triggers:
    - "add RPC function"
    - "create stored procedure"
    - "add database function"
  prechecks:
    - "verify supabase/migrations/ directory"
    - "check existing RPC functions (create_event_with_agent, match_context) for patterns"
    - "confirm function should be RPC vs. Edge Function vs. application code"
  steps:
    - "create migration file: supabase/migrations/<timestamp>_rpc_<name>.sql"
    - "write CREATE OR REPLACE FUNCTION <name>(...) RETURNS ... LANGUAGE plpgsql"
    - "add SECURITY DEFINER if needed (with caution)"
    - "add GRANT EXECUTE to authenticated and/or service_role"
    - "include comments describing parameters and return value"
  validations:
    - "test function via supabase.rpc() call in local environment"
    - "verify return type matches TypeScript expectations"
    - "check performance with EXPLAIN ANALYZE if query-heavy"
  rollback:
    - "create migration with DROP FUNCTION <name>"
    - "or comment out function in migration file"
```

```yaml
- name: Add Page Route
  intent: Create a new Next.js App Router page with proper layout and TypeScript types.
  triggers:
    - "add page"
    - "create route"
    - "new page component"
  prechecks:
    - "verify web/app/ directory structure"
    - "determine route group: (app) for authenticated, (marketing) for public"
    - "check if dynamic route needed ([param])"
  steps:
    - "create web/app/<path>/page.tsx"
    - "add default export function with proper Props type for params"
    - "add metadata export if SEO needed"
    - "create layout.tsx if route group needs custom layout"
    - "import shared components from web/shared/ui/ or web/features/"
  validations:
    - "run pnpm dev and navigate to route"
    - "verify TypeScript types for params are correct"
    - "check page renders without errors"
  rollback:
    - "delete page.tsx and layout.tsx files"
    - "remove route from navigation if added"
```

```yaml
- name: Add Server Action
  intent: Create a Next.js Server Action for form submissions or data mutations.
  triggers:
    - "add server action"
    - "create form handler"
    - "server-side mutation"
  prechecks:
    - "verify web/server/actions/ directory exists"
    - "check if action should be in route or separate file"
    - "review Supabase client setup in web/shared/lib/supabase.ts"
  steps:
    - "create web/server/actions/<name>.ts with 'use server' directive"
    - "import Supabase client (server-side, use service role if privileged)"
    - "add input validation (Zod schema if complex)"
    - "export async function with proper error handling"
    - "call from client component or form action"
  validations:
    - "test action from client component"
    - "verify error messages are user-friendly"
    - "check TypeScript types for parameters and return"
  rollback:
    - "delete action file"
    - "remove imports and calls from consuming components"
```

```yaml
- name: Add API Route
  intent: Create a new Next.js API route for server-side endpoints (ingestion, streaming, etc.).
  triggers:
    - "add API route"
    - "create endpoint"
    - "new API handler"
    - "add SSE endpoint"
  prechecks:
    - "verify web/app/api/ directory exists"
    - "check if Server Action would be more appropriate"
    - "review existing API routes (/api/ingest, /api/stream) for patterns"
    - "determine if SSE streaming needed (use ReadableStream pattern from /api/stream)"
  steps:
    - "create web/app/api/<name>/route.ts"
    - "export GET, POST, PUT, DELETE handlers as needed"
    - "for SSE: use ReadableStream pattern (see /api/stream/route.ts)"
    - "for JSON: use NextResponse.json() with proper status codes"
    - "add CORS headers if needed (see /api/ingest for example)"
    - "add error handling with try-catch"
    - "use SUPABASE_SERVICE_ROLE_KEY for privileged operations (server-side only)"
  validations:
    - "test endpoint via curl or browser"
    - "verify CORS headers if calling from browser"
    - "check error handling works correctly"
    - "if SSE: verify stream stays open and handles client disconnect"
  rollback:
    - "delete route.ts file"
    - "remove any client-side calls to the endpoint"
```

```yaml
- name: Add Vector Search Index
  intent: Create or optimize pgvector index for semantic search performance.
  triggers:
    - "add vector index"
    - "optimize embedding search"
    - "improve similarity search"
  prechecks:
    - "verify pgvector extension is enabled"
    - "check existing index on context_items.embedding"
    - "review index type (IVFFlat vs. HNSW) for data size"
  steps:
    - "create migration: supabase/migrations/<timestamp>_index_<table>_embedding.sql"
    - "write CREATE INDEX using ivfflat or hnsw with vector_cosine_ops"
    - "set lists parameter for IVFFlat (100 default, increase for large datasets)"
    - "include WHERE clause if filtering by event_id (partial index)"
  validations:
    - "test query performance with EXPLAIN ANALYZE"
    - "verify index is used in query plan"
    - "check index size doesn't exceed memory limits"
  rollback:
    - "DROP INDEX in new migration"
    - "or recreate with different parameters"
```

```yaml
- name: Add Enrichment Enricher
  intent: Add a new enricher to the context enrichment framework.
  triggers:
    - "add enricher"
    - "create enrichment source"
    - "add context enrichment"
  prechecks:
    - "verify worker/enrichment/ directory structure exists"
    - "review worker/enrichment/enrichers/base-enricher.ts for interface"
    - "check existing enrichers (web-search, document-extractor, wikipedia) for patterns"
    - "determine if new enricher needs API keys or external services"
  steps:
    - "create worker/enrichment/enrichers/<name>.ts"
    - "extend BaseEnricher class and implement enrich() method"
    - "override getChunkingStrategy() and getQualityScore() if needed"
    - "register enricher in worker/enrichment/index.ts (EnrichmentOrchestrator)"
    - "add environment variables for configuration (ENRICHMENT_<NAME>_ENABLED, etc.)"
    - "update getEnrichmentConfig() in worker/enrichment/index.ts if needed"
  validations:
    - "test enricher in isolation with sample input"
    - "verify chunks are generated with proper metadata"
    - "check quality scores are reasonable (0-1 range)"
    - "test with context builder integration"
  rollback:
    - "delete enricher file"
    - "remove from EnrichmentOrchestrator"
    - "remove environment variables"
```

```yaml
- name: Add Worker Task
  intent: Add a new background processing task to the orchestrator service.
  triggers:
    - "add worker task"
    - "background job"
    - "worker processing"
    - "add orchestrator task"
  prechecks:
    - "review worker/index.ts structure (tickPrep, tickRun polling loops for fallback)"
    - "review worker/orchestrator.ts structure (event-driven processing via Realtime)"
    - "verify worker has access to required env vars"
    - "determine if task should be event-driven (Realtime subscription) or polling-based (fallback)"
  steps:
    - "For event-driven: add handler in orchestrator.ts (e.g., handleTranscriptInsert, processCardsAgent)"
    - "For polling: add async function in worker/index.ts and integrate into tickPrep() or tickRun()"
    - "add error handling with logging and status updates"
    - "update EventRuntime interface if extending state (in orchestrator.ts)"
    - "if polling: add setInterval() call in main() if periodic task"
    - "if Realtime-driven: subscribe to appropriate Supabase Realtime channel in orchestrator.initialize()"
  validations:
    - "run worker locally with test data"
    - "verify logs show task execution"
    - "check database state changes are correct"
    - "if Realtime-driven: verify Supabase Realtime subscription works"
  rollback:
    - "remove function and subscription/interval call"
    - "revert database changes if made"
```

```yaml
- name: Add Realtime Subscription
  intent: Set up real-time data updates via SSE streaming or Supabase Realtime subscriptions.
  triggers:
    - "add realtime"
    - "live updates"
    - "subscribe to changes"
    - "add SSE stream"
  prechecks:
    - "determine if client-side (SSE via /api/stream) or server-side (Supabase Realtime in worker)"
    - "verify supabase/config.toml has [realtime] enabled"
    - "check table has Realtime enabled in Supabase Dashboard (or via SQL)"
    - "review web/shared/hooks/use-sse-stream.ts for client-side SSE pattern"
  steps:
    - "For client-side SSE: use existing useSSEStream hook or create new hook"
    - "For client-side Supabase Realtime: create hook: web/shared/hooks/use<Name>Realtime.ts"
    - "For server-side (worker): add subscription in orchestrator.ts initialize() method"
    - "import supabase client from appropriate location (web/shared/lib/supabase.ts or worker)"
    - "use useEffect to set up .from('<table>').on('*', callback) for client-side"
    - "return cleanup function to unsubscribe"
    - "use hook in page or component (e.g., live event page uses LiveCards/LiveFacts)"
  validations:
    - "test subscription/stream in browser DevTools"
    - "verify updates appear in UI when DB changes"
    - "check memory leak (unsubscribe on unmount)"
    - "if SSE: verify /api/stream route handles Realtime subscriptions correctly"
  rollback:
    - "remove hook file or subscription code"
    - "remove subscription code from component or orchestrator"
```

```yaml
- name: Add Type Definitions
  intent: Generate or manually add TypeScript types for Supabase tables and functions.
  triggers:
    - "add types"
    - "generate supabase types"
    - "type definitions"
  prechecks:
    - "verify supabase CLI is installed"
    - "check if types already exist in web/shared/types/"
    - "review database schema for table structures"
  steps:
    - "run: supabase gen types typescript --local > web/shared/types/database.ts"
    - "or manually create types based on schema in web/shared/types/"
    - "export Database type and helper types (Tables, Functions)"
    - "import in components and server actions for type safety"
    - "create domain-specific types in web/features/*/types.ts if needed"
  validations:
    - "verify types match actual schema (run supabase db diff)"
    - "check TypeScript compiles without errors"
    - "test autocomplete in IDE"
  rollback:
    - "delete or revert types file"
    - "remove type imports if breaking"
```

```yaml
- name: Add Environment Variable
  intent: Document and configure a new environment variable across services.
  triggers:
    - "add env variable"
    - "new configuration"
    - "environment setting"
  prechecks:
    - "check existing env vars in worker/index.ts and web/shared/lib/supabase.ts"
    - "determine if variable should be NEXT_PUBLIC_ (exposed to browser)"
    - "verify .env.example or documentation exists"
  steps:
    - "add variable to worker/.env.example (if worker-related)"
    - "add variable to web/.env.local.example (if web-related)"
    - "update .cursor/rules/project.md section 8 with new variable"
    - "add usage in code with need() helper or process.env"
    - "document purpose and default value in code comments"
  validations:
    - "test local setup with missing var (should error gracefully)"
    - "verify variable is used correctly in runtime"
    - "check no secrets are exposed to client (NEXT_PUBLIC_ prefix)"
  rollback:
    - "remove env var usage from code"
    - "remove from .env.example files"
    - "revert documentation"
```

```yaml
- name: Refactor Component
  intent: Restructure a React component to improve maintainability or extract reusable parts.
  triggers:
    - "refactor component"
    - "extract component"
    - "split component"
  prechecks:
    - "identify component location and dependencies"
    - "check if logic should move to server component or action"
    - "review component size and complexity"
  steps:
    - "extract sub-components to web/shared/ui/ or feature-specific directory"
    - "move hooks to web/shared/hooks/ or feature hooks/"
    - "split server and client components (remove 'use client' where possible)"
    - "extract types to shared types file"
    - "update imports in consuming components"
  validations:
    - "verify component still renders correctly"
    - "run pnpm lint and fix issues"
    - "check no prop drilling or unnecessary re-renders"
  rollback:
    - "revert component to previous structure"
    - "restore imports"
```

```yaml
- name: Harden Authentication
  intent: Add or improve authentication checks, RLS policies, and security measures.
  triggers:
    - "add auth check"
    - "secure endpoint"
    - "add RLS policy"
  prechecks:
    - "review existing auth patterns (if any)"
    - "check Supabase auth setup in web/shared/lib/supabase.ts"
    - "verify RLS policies in migrations"
  steps:
    - "create middleware.ts in web/ for route protection"
    - "add RLS policy migration: CREATE POLICY ... ON <table> FOR SELECT USING (owner_uid = auth.uid())"
    - "add auth check in Server Actions: const { data: { user } } = await supabase.auth.getUser()"
    - "add JWT verification in Edge Functions (verify_jwt = true in config.toml)"
    - "add error boundaries for auth failures"
  validations:
    - "test unauthorized access is blocked"
    - "verify users can only access their own data"
    - "check auth errors are handled gracefully"
  rollback:
    - "remove RLS policies (DROP POLICY)"
    - "revert middleware changes"
    - "remove auth checks from code"
```

```yaml
- name: Add Error Boundary
  intent: Implement error handling UI and recovery for React components.
  triggers:
    - "add error handling"
    - "error boundary"
    - "catch errors"
  prechecks:
    - "check if Next.js error.tsx exists in route"
    - "review error patterns in current codebase"
    - "identify error-prone components"
  steps:
    - "create web/app/<route>/error.tsx with 'use client' directive"
    - "export default function Error({ error, reset }) { ... }"
    - "add user-friendly error message and reset button"
    - "create global-error.tsx in web/app/ for root-level errors"
    - "add try-catch in Server Actions with proper error responses"
  validations:
    - "test error boundary by throwing error in component"
    - "verify reset() function works"
    - "check error messages are helpful (not exposing internals)"
  rollback:
    - "delete error.tsx files"
    - "remove error handling code"
```

```yaml
- name: Run Database Migration
  intent: Apply a new migration to local or remote Supabase database.
  triggers:
    - "run migration"
    - "apply schema change"
    - "push database"
  prechecks:
    - "verify migration file exists in supabase/migrations/"
    - "check supabase CLI is authenticated (supabase login)"
    - "review migration SQL for syntax errors"
  steps:
    - "Local: run supabase db reset (applies all migrations + seed)"
    - "Remote: run supabase db push (applies new migrations only)"
    - "Verify: run supabase migration list to see applied migrations"
    - "Test: query database to confirm changes"
  validations:
    - "check migration applied without errors"
    - "verify schema matches migration (describe table in Studio)"
    - "test queries on new tables/columns work"
  rollback:
    - "Create reverse migration and apply"
    - "Or use supabase db reset to revert to previous state (destructive)"
```

```yaml
- name: Deploy Edge Function
  intent: Deploy a Supabase Edge Function to production or staging.
  triggers:
    - "deploy function"
    - "publish edge function"
    - "release function"
  prechecks:
    - "verify supabase CLI is logged in (supabase login)"
    - "check function code is complete and tested locally"
    - "review function config in supabase/config.toml"
  steps:
    - "test locally: supabase functions serve <name>"
    - "deploy: supabase functions deploy <name>"
    - "verify: curl production function endpoint"
    - "check logs: supabase functions logs <name>"
  validations:
    - "test function endpoint returns expected response"
    - "verify CORS headers if calling from browser"
    - "check error handling works in production"
  rollback:
    - "redeploy previous version (if versioned)"
    - "or manually fix and redeploy"
```

```yaml
- name: Add Test Suite
  intent: Set up testing framework and add tests for a component or module.
  triggers:
    - "add tests"
    - "write test"
    - "test coverage"
  prechecks:
    - "check if test framework exists (Jest, Vitest, etc.)"
    - "review testing patterns in codebase (if any)"
    - "identify what to test (unit, integration, E2E)"
  steps:
    - "install test framework: pnpm add -D vitest @testing-library/react"
    - "create vitest.config.ts in web/ or worker/"
    - "create <module>.test.ts or <component>.test.tsx"
    - "add test script to package.json: 'test': 'vitest'"
    - "write test cases for happy path and error cases"
  validations:
    - "run pnpm test"
    - "verify tests pass"
    - "check coverage report (if configured)"
  rollback:
    - "remove test files"
    - "uninstall test dependencies"
    - "remove test script"
```

```yaml
- name: Generate Documentation
  intent: Create analysis, architecture, or explanatory documentation files for developer reference.
  triggers:
    - "generate documentation"
    - "create analysis"
    - "write architecture doc"
    - "document analysis"
  prechecks:
    - "verify dev_docs/ directory exists at repository root"
    - "determine if file is user-facing documentation (goes in dev_docs/) vs code docs (JSDoc/README)"
  steps:
    - "generate timestamp: date +%Y%m%d_%H%M%S"
    - "create file: dev_docs/<timestamp>_<descriptive_name>.md"
    - "write markdown content with proper headings and structure"
    - "ensure file serves descriptive/analytical purpose for users"
  validations:
    - "verify file is in dev_docs/ directory"
    - "verify filename has timestamp prefix (YYYYMMDD_HHMMSS format)"
    - "check markdown syntax is valid"
  rollback:
    - "delete dev_docs/<timestamp>_<descriptive_name>.md"
```

## Documentation Generation Rules

**All generated documentation files must follow these rules**:

1. **Location**: Place all user-facing generated documentation in `dev_docs/` directory at repository root
2. **Naming**: Use timestamp prefix format: `YYYYMMDD_HHMMSS_<descriptive_name>.md`
   - Generate timestamp: `date +%Y%m%d_%H%M%S`
   - Example: `20251031_141610_ARCHITECTURE_ANALYSIS.md`
3. **Purpose**: Only files that provide descriptions, analysis, or explanations to users belong in `dev_docs/`
   - Code documentation (JSDoc, inline comments) stays with source files
   - README files follow standard conventions (project root or feature directories)
   - Generated analysis, architecture reviews, and explanatory docs go in `dev_docs/`
4. **Content**: Files should be well-structured Markdown with clear headings and sections
5. **Scope**: Apply to all commands that generate documentation files, including but not limited to:
   - Architecture analysis
   - Performance analysis
   - Code review summaries
   - Dependency analysis
   - Security audits
   - Any explanatory documentation created by AI agents

