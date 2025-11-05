import { NextRequest, NextResponse } from 'next/server';
import { getEventById, updateEvent } from '@/server/actions/event-actions';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;

    const { data, error } = await getEventById(eventId);

    if (error) {
      return NextResponse.json({ ok: false, error }, { status: 404 });
    }

    if (!data) {
      return NextResponse.json({ ok: false, error: 'Event not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, event: data });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const body = await req.json();

    const { data, error } = await updateEvent(eventId, body);

    if (error) {
      return NextResponse.json({ ok: false, error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

