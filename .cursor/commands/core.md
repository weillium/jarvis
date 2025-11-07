---
type: command
version: 3
scope: repository
---

# Repository Commands

> each command → 1 job, 1 scope.  
> commands should NOT cascade / chain automatically.

---

### split_module
When a file is too large to reason about, split it into smaller modules without changing behavior.

### harden_types
Replace implicit any / loose typing with explicit DTOs, type guards, or narrow unknown shapes.

### add_dto_boundaries
At an IO boundary (Supabase / OpenAI / WebSocket), add a DTO and mapping function so only validated DTOs cross layers.

### normalize_utils
Move duplicated helper logic into `worker/lib/**` and update call sites to import the shared utility.

### new_migration
Create a new Supabase migration for a schema change (never modify schema directly).

### apply_indexes
Add appropriate indexes and RLS policies to support a new access pattern identified in worker/web.

### create_query_hook
In web: create a React Query hook to read/write server state → replace bespoke local server state solutions.

### replace_fetch
Remove custom fetch calls in web code and replace with React Query queries/mutations that respect cache + invalidation.
