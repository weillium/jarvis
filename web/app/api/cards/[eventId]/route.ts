import { NextRequest } from 'next/server';
import { getCardsByEventId } from '@/server/actions/card-actions';

export async function GET(
  _req: NextRequest,
  { params }: { params: { eventId: string } }
) {
  const { eventId } = params;

  if (!eventId) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Missing eventId parameter',
      }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }

  const { data, error } = await getCardsByEventId(eventId);

  if (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error,
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      cards: data ?? [],
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}

