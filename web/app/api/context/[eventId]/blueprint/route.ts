import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getBlueprintForEvent } from "@/server/data/context";

/**
 * Blueprint API Routes
 *
 * GET /api/context/[eventId]/blueprint - Get blueprint for event
 * POST /api/context/[eventId]/blueprint - Approve blueprint
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

// GET - Fetch blueprint
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;

    // Validate eventId format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(eventId)) {
      return NextResponse.json(
        { ok: false, error: "Invalid event_id format (must be UUID)" },
        { status: 400 },
      );
    }

    const { data: blueprint, error, message } = await getBlueprintForEvent(
      eventId,
    );

    if (error) {
      return NextResponse.json(
        { ok: false, error },
        { status: 500 },
      );
    }

    if (message) {
      return NextResponse.json({
        ok: true,
        blueprint: null,
        message,
      });
    }

    return NextResponse.json({
      ok: true,
      blueprint,
    });
  } catch (error: any) {
    console.error("[api/context/blueprint] Unexpected error:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

// POST - Approve blueprint
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const { eventId } = await params;

    // Validate eventId format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(eventId)) {
      return NextResponse.json(
        { ok: false, error: "Invalid event_id format (must be UUID)" },
        { status: 400 },
      );
    }

    const supabase = getSupabaseClient();

    // Find agent for this event
    const { data: agents, error: agentError } = await (supabase
      .from("agents") as any)
      .select("id, status, stage")
      .eq("event_id", eventId)
      .limit(1);

    if (agentError) {
      console.error(
        "[api/context/blueprint] Error fetching agent:",
        agentError,
      );
      return NextResponse.json(
        { ok: false, error: `Failed to fetch agent: ${agentError.message}` },
        { status: 500 },
      );
    }

    if (!agents || agents.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No agent found for this event" },
        { status: 404 },
      );
    }

    const agentId = agents[0].id;

    // Verify agent is in correct state (idle with blueprint stage)
    if (agents[0].status !== "idle" || agents[0].stage !== "blueprint") {
      return NextResponse.json(
        {
          ok: false,
          error: `Cannot approve blueprint. Agent status is '${
            agents[0].status
          }' with stage '${
            agents[0].stage
          }'. Expected status 'idle' with stage 'blueprint'.`,
        },
        { status: 400 },
      );
    }

    // Find blueprint with status 'ready'
    const { data: blueprint, error: blueprintError } = await (supabase
      .from("context_blueprints") as any)
      .select("id, status")
      .eq("agent_id", agentId)
      .eq("status", "ready")
      .limit(1)
      .single();

    if (blueprintError || !blueprint) {
      console.error(
        "[api/context/blueprint] Error fetching blueprint:",
        blueprintError,
      );
      return NextResponse.json(
        { ok: false, error: "No ready blueprint found for this event" },
        { status: 404 },
      );
    }

    // Update blueprint status to 'approved'
    const { error: updateBlueprintError } = await (supabase
      .from("context_blueprints") as any)
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
      })
      .eq("id", blueprint.id);

    if (updateBlueprintError) {
      console.error(
        "[api/context/blueprint] Error updating blueprint:",
        updateBlueprintError,
      );
      return NextResponse.json(
        {
          ok: false,
          error: `Failed to approve blueprint: ${updateBlueprintError.message}`,
        },
        { status: 500 },
      );
    }

    // Agent remains in 'idle'/'blueprint' state after approval
    // The worker will pick up the approved blueprint and move to the next stage
    // No agent status update needed - the blueprint status change is sufficient

    return NextResponse.json({
      ok: true,
      blueprint_id: blueprint.id,
      agent_id: agentId,
      message: "Blueprint approved. Context generation will start shortly.",
    });
  } catch (error: any) {
    console.error("[api/context/blueprint] Unexpected error:", error);
    return NextResponse.json(
      { ok: false, error: error?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
