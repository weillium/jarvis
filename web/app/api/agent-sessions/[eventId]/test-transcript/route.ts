import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Send test transcript to agent sessions
 * POST /api/agent-sessions/[eventId]/test-transcript
 * 
 * Body: { text: string, speaker?: string }
 * 
 * Inserts a test transcript into the transcripts table which will be
 * processed by the worker via Realtime subscription.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const body = await req.json();
    const { text, speaker } = body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Transcript text is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Verify event exists and agent is in testing status
    const { data: agents, error: agentError } = await supabase
      .from('agents')
      .select('id, status')
      .eq('event_id', eventId)
      .eq('status', 'testing')
      .limit(1);

    if (agentError) {
      return NextResponse.json(
        { ok: false, error: `Failed to fetch agent: ${agentError.message}` },
        { status: 500 }
      );
    }

    if (!agents || agents.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'No agent found with testing status for this event',
        },
        { status: 404 }
      );
    }

    // Get the highest sequence number for this event to increment
    const { data: lastTranscript, error: seqError } = await supabase
      .from('transcripts')
      .select('seq')
      .eq('event_id', eventId)
      .order('seq', { ascending: false })
      .limit(1)
      .single();

    const nextSeq = lastTranscript?.seq ? lastTranscript.seq + 1 : 1;
    const now = new Date();

    // Insert test transcript
    const { data: transcript, error: insertError } = await supabase
      .from('transcripts')
      .insert({
        event_id: eventId,
        seq: nextSeq,
        at_ms: Date.now(),
        speaker: speaker || 'Test User',
        text: text.trim(),
        final: true,
        ts: now.toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { ok: false, error: `Failed to insert transcript: ${insertError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Test transcript sent successfully. Worker will process it via Realtime subscription.',
      eventId,
      transcript: {
        id: transcript.id,
        seq: transcript.seq,
        text: transcript.text,
        speaker: transcript.speaker,
      },
    });
  } catch (error: any) {
    console.error('Error sending test transcript:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

