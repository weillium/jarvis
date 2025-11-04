import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Version History API Route
 * 
 * Returns generation cycles (version history) for an event.
 * 
 * GET /api/context/[eventId]/versions
 */

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase configuration');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;

    // Validate eventId format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(eventId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid event_id format (must be UUID)' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // Fetch all generation cycles (including completed and failed)
    const { data: cycles, error } = await (supabase
      .from('generation_cycles') as any)
      .select('*')
      .eq('event_id', eventId)
      .order('started_at', { ascending: false });

    if (error) {
      console.error('[api/context/versions] Error fetching generation cycles:', error);
      return NextResponse.json(
        { ok: false, error: `Failed to fetch version history: ${error.message}` },
        { status: 500 }
      );
    }

    // Parse cost data from metadata
    const cyclesWithCost = (cycles || []).map((cycle: any) => {
      const cost = cycle.metadata?.cost?.total || null;
      const costBreakdown = cycle.metadata?.cost || null;
      
      return {
        ...cycle,
        cost: cost ? parseFloat(cost) : null,
        cost_breakdown: costBreakdown || null,
      };
    });

    return NextResponse.json({
      ok: true,
      cycles: cyclesWithCost,
      count: cyclesWithCost.length,
    });
  } catch (error: any) {
    console.error('[api/context/versions] Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

