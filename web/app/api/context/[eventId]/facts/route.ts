import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/shared/lib/supabase/server';
import { requireAuth, requireEventOwnership } from '@/shared/lib/auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const { eventId } = await params;

  if (!UUID_REGEX.test(eventId)) {
    return NextResponse.json(
      { ok: false, error: 'Invalid event_id format (must be UUID)' },
      { status: 400 }
    );
  }

  try {
    const supabaseAuth = await createServerClient();
    const user = await requireAuth(supabaseAuth);
    await requireEventOwnership(supabaseAuth, user.id, eventId);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Not authenticated',
      },
      { status: 401 }
    );
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('facts')
    .select('*')
    .eq('event_id', eventId)
    .eq('is_active', true)
    .order('last_seen_seq', { ascending: false });

  if (error) {
    return NextResponse.json(
      { ok: false, error: `Failed to load facts: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    facts: data ?? [],
  });
}

