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

    // Build query
    let query = (supabase
      .from('glossary_terms') as any)
      .select('*')
      .eq('event_id', eventId)
      .order('confidence_score', { ascending: false, nullsFirst: false })
      .order('term', { ascending: true });

    // Apply filters
    if (category) {
      query = query.eq('category', category);
    }

    // Note: Supabase doesn't have full-text search built-in without extensions
    // For MVP, we'll filter client-side. In production, consider using pg_trgm or similar
    const { data: terms, error } = await query;

    if (error) {
      console.error('[api/context/glossary] Error fetching glossary:', error);
      return NextResponse.json(
        { ok: false, error: `Failed to fetch glossary: ${error.message}` },
        { status: 500 }
      );
    }

    // Apply client-side search if provided
    let filteredTerms = terms || [];
    if (search && search.length > 0) {
      const searchLower = search.toLowerCase();
      filteredTerms = filteredTerms.filter((term: any) => {
        return (
          term.term.toLowerCase().includes(searchLower) ||
          term.definition.toLowerCase().includes(searchLower) ||
          (term.acronym_for && term.acronym_for.toLowerCase().includes(searchLower))
        );
      });
    }

    // Group by category if requested (for frontend convenience)
    const groupedByCategory: Record<string, typeof filteredTerms> = {};
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
