import { NextRequest, NextResponse } from 'next/server';

const WORKER_URL = process.env.WORKER_URL || 'http://localhost:3001';

/**
 * Append audio chunk to transcript agent
 * POST /api/agent-sessions/[eventId]/transcript-audio
 * 
 * Proxies audio chunks to worker's transcript audio endpoint.
 * Expected payload matches TranscriptAudioChunk interface:
 * {
 *   audio_base64: string;
 *   seq?: number;
 *   is_final?: boolean;
 *   sample_rate?: number;
 *   bytes_per_sample?: number;
 *   encoding?: string;
 *   duration_ms?: number;
 *   speaker?: string;
 * }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const body = await req.json();

    // Validate required fields
    if (!body.audio_base64 && !body.audioBase64) {
      console.error(`[api/agent-sessions/transcript-audio] Missing audio_base64 for event ${eventId}`);
      return NextResponse.json(
        { ok: false, error: 'audio_base64 is required' },
        { status: 400 }
      );
    }

    // Normalize payload to match worker's expected format
    const payload = {
      event_id: eventId,
      audio_base64: body.audio_base64 || body.audioBase64,
      seq: body.seq,
      is_final: body.is_final ?? body.isFinal,
      sample_rate: body.sample_rate ?? body.sampleRate,
      bytes_per_sample: body.bytes_per_sample ?? body.bytesPerSample,
      encoding: body.encoding,
      duration_ms: body.duration_ms ?? body.durationMs,
      speaker: body.speaker,
    };

    console.log(`[api/agent-sessions/transcript-audio] Sending audio chunk to worker for event ${eventId}, seq: ${payload.seq ?? 'N/A'}, size: ${payload.audio_base64.length} bytes`);

    const workerResponse = await fetch(`${WORKER_URL}/sessions/transcript/audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });

    let workerData: unknown = null;
    try {
      workerData = await workerResponse.json();
    } catch (_error) {
      // Ignore JSON parse errors; handled below
    }

    if (!workerResponse.ok) {
      const errorMessage =
        (typeof workerData === 'object' && workerData !== null && 'error' in workerData
          ? String((workerData as { error: unknown }).error)
          : null) ||
        `Worker responded with status ${workerResponse.status}`;

      console.error(`[api/agent-sessions/transcript-audio] Worker error for event ${eventId}, seq: ${payload.seq ?? 'N/A'}:`, errorMessage);

      const status =
        workerResponse.status && workerResponse.status >= 400
          ? workerResponse.status
          : 502;

      return NextResponse.json(
        { ok: false, error: errorMessage },
        { status }
      );
    }

    console.log(`[api/agent-sessions/transcript-audio] Successfully sent audio chunk for event ${eventId}, seq: ${payload.seq ?? 'N/A'}`);

    return NextResponse.json({
      ok: true,
      message: 'Audio chunk appended successfully',
    });
  } catch (error: unknown) {
    console.error('[api/agent-sessions/transcript-audio] Error:', error);

    if (error instanceof Error && error.name === 'TimeoutError') {
      return NextResponse.json(
        { ok: false, error: 'Worker timed out while processing audio chunk' },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

