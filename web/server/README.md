# Server Utilities

This folder contains server-side code for data operations in the Next.js application.

## Structure

### `actions/` - Next.js Server Actions
Server Actions are async functions marked with `"use server"` that run on the server. They can be called directly from Client Components.

**Example:**
```typescript
// server/actions/event-actions.ts
"use server"

import { createServerClient } from '@/shared/lib/supabase/server';

export async function createEvent(data: EventData) {
  const supabase = await createServerClient();
  // ... create event logic
}
```

### `mappers/` - Data Transformation
Pure functions that transform data between different formats (e.g., DB rows → app types).

**Example:**
```typescript
// server/mappers/event-mapper.ts
export function mapDbEventToEvent(dbRow: DbEvent): Event {
  return {
    id: dbRow.id,
    title: dbRow.title,
    // ... transformations
  };
}
```

### `rpcs/` - Supabase RPC Wrappers
Type-safe wrappers around Supabase RPC (Remote Procedure Call) functions.

**Example:**
```typescript
// server/rpcs/match-context.ts
import { createServerClient } from '@/shared/lib/supabase/server';

export async function matchContext(eventId: string, embedding: number[]) {
  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc('match_context', {
    event_id: eventId,
    query_embedding: embedding,
    limit: 5
  });
  return { data, error };
}
```

## Notes

- These are **not React components** - they're utility functions
- They run on the server only (no client-side code)
- Use `createServerClient()` from `@/shared/lib/supabase/server` for database access
- Prefer Server Actions over API routes when possible

