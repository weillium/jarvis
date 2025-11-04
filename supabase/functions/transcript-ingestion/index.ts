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

// Basic CORS (so transcription services can call from any origin)
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
        { ok: true, service: "transcript-ingestion", time: new Date().toISOString() },
        200,
        CORS_HEADERS,
      )
    }

    if (req.method !== "POST") {
      return json({ ok: false, error: "Method not allowed" }, 405, CORS_HEADERS)
    }

    const body = await req.json().catch(() => ({}))
    const { event_id, text, timestamp, batch } = body

    // Validate required fields
    if (!event_id) {
      return json(
        { ok: false, error: "event_id is required" },
        400,
        CORS_HEADERS,
      )
    }

    // Handle batch inserts (multiple transcripts at once)
    if (batch && Array.isArray(batch)) {
      // Validate batch array
      for (const item of batch) {
        if (!item.text) {
          return json(
            { ok: false, error: "Each batch item must have 'text' field" },
            400,
            CORS_HEADERS,
          )
        }
      }

      // Insert all transcripts in batch
      const transcripts = batch.map((item: any) => ({
        event_id,
        text: item.text,
        ts: item.timestamp || item.ts || new Date().toISOString(),
      }))

      const { data, error } = await supabase
        .from("transcripts")
        .insert(transcripts)
        .select("id,text,ts")

      if (error) {
        console.error("[batch] insert error:", error.message)
        return json(
          { ok: false, error: error.message },
          500,
          CORS_HEADERS,
        )
      }

      return json(
        { 
          ok: true, 
          inserted: data?.length || 0,
          transcripts: data 
        },
        200,
        CORS_HEADERS,
      )
    }

    // Handle single transcript insert
    if (!text) {
      return json(
        { ok: false, error: "text is required for single insert" },
        400,
        CORS_HEADERS,
      )
    }

    // Validate text length (prevent extremely long transcripts)
    if (text.length > 100000) {
      return json(
        { ok: false, error: "Text exceeds maximum length of 100,000 characters" },
        400,
        CORS_HEADERS,
      )
    }

    // Insert single transcript
    const { data, error } = await supabase
      .from("transcripts")
      .insert({
        event_id,
        text,
        ts: timestamp || new Date().toISOString(),
      })
      .select("id,text,ts")
      .single()

    if (error) {
      console.error("[single] insert error:", error.message)
      return json(
        { ok: false, error: error.message },
        500,
        CORS_HEADERS,
      )
    }

    return json(
      { ok: true, transcript: data },
      200,
      CORS_HEADERS,
    )
  } catch (err) {
    console.error("[fatal]", err)
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
  curl -i --location --request GET 'http://127.0.0.1:54421/functions/v1/transcript-ingestion' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

  Single transcript insert:
  curl -i --location --request POST 'http://127.0.0.1:54421/functions/v1/transcript-ingestion' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"event_id":"00000000-0000-0000-0000-000000000000","text":"This is a test transcript"}'

  Batch transcript insert:
  curl -i --location --request POST 'http://127.0.0.1:54421/functions/v1/transcript-ingestion' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"event_id":"00000000-0000-0000-0000-000000000000","batch":[{"text":"First transcript"},{"text":"Second transcript"}]}'

*/





