import { NextRequest, NextResponse } from 'next/server';

const WORKER_URL = process.env.WORKER_URL || 'http://localhost:3001';

type WorkerPromptPreviewResponse = {
  ok: boolean;
  prompt?: {
    system: string;
    user: string;
  };
  event?: {
    title: string;
    topic: string;
    hasDocuments: boolean;
    documentCount: number;
  };
  error?: unknown;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(eventId)) {
      return NextResponse.json(
        { ok: false, error: 'Invalid event_id format (must be UUID)' },
        { status: 400 }
      );
    }

    const workerUrl = new URL('/blueprint/prompt', WORKER_URL);
    workerUrl.searchParams.set('event_id', eventId);

    let workerPayload: WorkerPromptPreviewResponse | null = null;
    let workerResponse: Response;

    try {
      workerResponse = await fetch(workerUrl.toString(), {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err: unknown) {
      console.error('[api/context/prompt-preview] Failed to reach worker:', err);
      return NextResponse.json(
        { ok: false, error: 'Unable to reach worker for prompt preview' },
        { status: 502 }
      );
    }

    try {
      workerPayload = (await workerResponse.json()) as WorkerPromptPreviewResponse;
    } catch (err: unknown) {
      console.error('[api/context/prompt-preview] Worker returned non-JSON response:', err);
    }

    if (!workerResponse.ok || !workerPayload) {
      const errorMessage =
        (workerPayload && workerPayload.error ? String(workerPayload.error) : null) ||
        'Failed to fetch prompt preview';
      return NextResponse.json(
        { ok: false, error: errorMessage },
        { status: workerResponse.status }
      );
    }

    if (!workerPayload.ok || !workerPayload.prompt || !workerPayload.event) {
      const errorMessage =
        workerPayload.error ? String(workerPayload.error) : 'Worker returned incomplete prompt preview';
      return NextResponse.json({ ok: false, error: errorMessage }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      prompt: workerPayload.prompt,
      event: workerPayload.event,
    });
  } catch (error: unknown) {
    console.error('[api/context/prompt-preview] Unexpected error:', error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
