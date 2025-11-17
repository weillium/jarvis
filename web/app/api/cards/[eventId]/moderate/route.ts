'use server';

import { NextRequest, NextResponse } from 'next/server';
import { updateCardActiveStatus } from '@/server/actions/card-actions';

export async function POST(
  req: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const { eventId } = params;
    if (!eventId) {
      return NextResponse.json(
        { ok: false, error: 'Missing eventId parameter' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const cardId: string | undefined = body?.cardId;
    const isActive: boolean = body?.isActive !== false;
    const reason: string | undefined =
      typeof body?.reason === 'string' && body.reason.trim().length > 0 ? body.reason.trim() : undefined;

    if (!cardId || typeof cardId !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'cardId is required' },
        { status: 400 }
      );
    }

    const { ok, error } = await updateCardActiveStatus(eventId, cardId, isActive, { reason });
    if (!ok) {
      return NextResponse.json(
        { ok: false, error: error ?? 'Failed to update card status' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { ok: true },
      { status: 200 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}


