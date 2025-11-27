import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getResearchForEvent } from "@/server/data/context";

/**
 * Research Results API Route
 *
 * Returns all active research results for an event.
 *
 * GET /api/context/[eventId]/research
 */

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase configuration");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || undefined;
    const apiFilter = searchParams.get("api") || undefined;

    // Validate eventId format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(eventId)) {
      return NextResponse.json(
        { ok: false, error: "Invalid event_id format (must be UUID)" },
        { status: 400 },
      );
    }

    const { data, error } = await getResearchForEvent(eventId, {
      search,
      apiFilter,
    });

    if (error) {
      return NextResponse.json(
        { ok: false, error },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      ...data,
    });
  } catch (error: any) {
    console.error("[api/context/research] Unexpected error:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
