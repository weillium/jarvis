import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Glossary API Route
 * 
 * Returns all glossary terms for an event.
 * 
 * GET /api/context/[eventId]/glossary
 * Query params:
 *   - category?: string - Filter by category
 *   - search?: string - Search term (searches term and definition)
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
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    const search = searchParams.get('search');

    // Validate eventId format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(eventId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid event_id format (must be UUID)' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // Fetch glossary terms, excluding those from superseded generation cycles
    // First, get all generation cycle IDs that are NOT superseded
    const { data: activeCycles, error: cycleError } = await (supabase
      .from('generation_cycles') as any)
      .select('id')
      .eq('event_id', eventId)
      .neq('status', 'superseded')
      .in('cycle_type', ['glossary']);

    if (cycleError) {
      console.warn('[api/context/glossary] Warning: Failed to fetch active cycles:', cycleError.message);
      // Continue with empty list - will only show legacy items
    }

    // Build list of active cycle IDs
    const activeCycleIds: string[] = [];
    if (activeCycles && activeCycles.length > 0) {
      activeCycleIds.push(...activeCycles.map((c: { id: string }) => c.id));
    }

    // Build query - fetch terms only from active cycles (or null/legacy items)
    // Handle null generation_cycle_id separately since .in() doesn't match NULL
    let query = (supabase
      .from('glossary_terms') as any)
      .select('id, term, definition, acronym_for, category, usage_examples, related_terms, confidence_score, source, source_url, created_at, generation_cycle_id, agent_utility')
      .eq('event_id', eventId);

    if (activeCycleIds.length > 0) {
      // Include items with null generation_cycle_id OR items from active cycles
      query = query.or(`generation_cycle_id.is.null,generation_cycle_id.in.(${activeCycleIds.join(',')})`);
    } else {
      // If no active cycles, only show legacy items (null generation_cycle_id)
      query = query.is('generation_cycle_id', null);
    }

    query = query.order('confidence_score', { ascending: false, nullsFirst: false })
      .order('term', { ascending: true });

    // Apply filters at database level
    if (category) {
      query = query.eq('category', category);
    }

    // Apply search filter at database level using ilike (case-insensitive pattern matching)
    if (search && search.length > 0) {
      // Use OR condition to search across term, definition, and acronym_for
      query = query.or(`term.ilike.%${search}%,definition.ilike.%${search}%,acronym_for.ilike.%${search}%`);
    }

    const { data: terms, error } = await query.limit(200); // Limit to 200 terms for performance

    if (error) {
      console.error('[api/context/glossary] Error fetching glossary:', error);
      return NextResponse.json(
        { ok: false, error: `Failed to fetch glossary: ${error.message}` },
        { status: 500 }
      );
    }

    // Terms are already filtered by database, no need for client-side filtering
    let filteredTerms = terms || [];

    // Group by category if requested (for frontend convenience)
    const groupedByCategory: Record<string, typeof filteredTerms> = {};
    filteredTerms = filteredTerms.map((term: any) => ({
      ...term,
      agent_utility: Array.isArray(term.agent_utility) ? term.agent_utility : [],
    }));

    filteredTerms.forEach((term: any) => {
      const cat = term.category || 'uncategorized';
      if (!groupedByCategory[cat]) {
        groupedByCategory[cat] = [];
      }
      groupedByCategory[cat].push(term);
    });

    return NextResponse.json({
      ok: true,
      terms: filteredTerms,
      count: filteredTerms.length,
      grouped_by_category: groupedByCategory,
    });
  } catch (error: any) {
    console.error('[api/context/glossary] Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
