import { NextRequest, NextResponse } from 'next/server';

const WORKER_URL = process.env.WORKER_URL || 'http://localhost:3001';

/**
 * Create agent sessions (generate without starting)
 * POST /api/agent-sessions/[eventId]/create
 * 
 * Delegates session creation to worker to ensure consistent model selection.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;

    const workerResponse = await fetch(`${WORKER_URL}/sessions/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: eventId }),
      signal: AbortSignal.timeout(15000), // Increase to 15 seconds for worker operations
    });

    let workerData: any = null;
    try {
      workerData = await workerResponse.json();
    } catch (_error) {
      // Ignore JSON parse errors here; handled below
    }

    if (!workerResponse.ok || !workerData?.ok) {
      const errorMessage =
        workerData?.error ||
        `Worker responded with status ${workerResponse.status}`;

      const status =
        workerResponse.status && workerResponse.status >= 400
          ? workerResponse.status
          : 502;

      return NextResponse.json(
        { ok: false, error: errorMessage },
        { status }
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Sessions generated successfully via worker.',
      eventId,
      agentId: workerData.agent_id,
      modelSet: workerData.model_set,
      sessions: workerData.sessions,
    });
  } catch (error: any) {
    console.error('[api/agent-sessions/create] Error:', error);

    if (error?.name === 'TimeoutError') {
      return NextResponse.json(
        { ok: false, error: 'Worker timed out while creating sessions' },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { ok: false, error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

