'use server';

import { NextRequest, NextResponse } from 'next/server';
import { getCardAuditLog } from '@/server/actions/card-actions';

export async function GET(
  req: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const { eventId } = params;
    if (!eventId) {
      return NextResponse.json({ ok: false, error: 'Missing eventId parameter' }, { status: 400 });
    }

    const cardId = req.nextUrl.searchParams.get('cardId');
    if (!cardId) {
      return NextResponse.json({ ok: false, error: 'cardId query parameter is required' }, { status: 400 });
    }

    const { data, error } = await getCardAuditLog(eventId, cardId);
    if (error) {
      return NextResponse.json({ ok: false, error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, entries: data ?? [] }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}




