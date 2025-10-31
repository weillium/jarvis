// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
/// <reference path="./types.d.ts" />
import { createClient } from "npm:@supabase/supabase-js@2"

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  })
}

// Basic CORS (so you can call from localhost:3000)
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS })
  }

  const url = Deno.env.get("SUPABASE_URL")
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!url || !serviceKey) {
    return json(
      { ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
      500,
      CORS_HEADERS,
    )
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false },
  })

  try {
    if (req.method === "GET") {
      // Simple health check
      return json(
        { ok: true, service: "orchestrator", time: new Date().toISOString() },
        200,
        CORS_HEADERS,
      )
    }

    if (req.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405, CORS_HEADERS)
    }

    const { action, payload } = await req.json().catch(() => ({}))

    if (action === "create_event_and_agent") {
      const { owner_uid, title, topic, start_time } = payload ?? {}

      if (!owner_uid || !title) {
        return json(
          { ok: false, error: "owner_uid and title are required" },
          400,
          CORS_HEADERS,
        )
      }

      // Use a Postgres function for atomic transaction
      // This ensures both event and agent are created together or not at all
      const { data, error } = await supabase.rpc("create_event_with_agent", {
        p_owner_uid: owner_uid,
        p_title: title,
        p_topic: topic || null,
        p_start_time: start_time || null,
      })

      if (error) {
        console.error("RPC error:", error)
        return json({ ok: false, error: error.message }, 400, CORS_HEADERS)
      }

      return json(
        { ok: true, ...(data as Record<string, unknown>) },
        200,
        CORS_HEADERS,
      )
    }

    return json({ ok: false, error: "Unknown action" }, 400, CORS_HEADERS)
  } catch (err) {
    console.error(err)
    return json(
      { ok: false, error: String(err?.message ?? err) },
      500,
      CORS_HEADERS,
    )
  }
})

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  Health check:
  curl -i --location --request GET 'http://127.0.0.1:54421/functions/v1/orchestrator' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

  Create event and agent:
  curl -i --location --request POST 'http://127.0.0.1:54421/functions/v1/orchestrator' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"action":"create_event_and_agent","payload":{"owner_uid":"00000000-0000-0000-0000-000000000000","title":"Test Event","topic":"Testing"}}'

  Note: This implementation requires a Postgres function 'create_event_with_agent' for atomic transactions.
  See the migration file for the function definition.

*/
