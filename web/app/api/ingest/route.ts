import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Transcript Ingestion API Route
 * 
 * Accepts transcript chunks and inserts them into the database.
 * The orchestrator automatically processes these via Supabase Realtime subscriptions.
 * 
 * POST /api/ingest
 * Body: {
 *   event_id: string (UUID)
 *   seq?: number (sequence number)
 *   at_ms?: number (timestamp in milliseconds)
 *   speaker?: string (speaker identifier)
 *   text: string (transcript text)
 *   final?: boolean (whether this is a finalized transcript, default: true)
 * }
 */

// Create Supabase client with service role for privileged operations
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

// Validate transcript input
function validateTranscript(body: any): { valid: boolean; error?: string; data?: any } {
  if (!body.event_id) {
    return { valid: false, error: 'Missing required field: event_id' };
  }

  if (!body.text || typeof body.text !== 'string') {
    return { valid: false, error: 'Missing or invalid field: text' };
  }

  if (body.text.length > 100000) {
    return { valid: false, error: 'Text exceeds maximum length of 100,000 characters' };
  }

  // Validate UUID format (basic check)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(body.event_id)) {
    return { valid: false, error: 'Invalid event_id format (must be UUID)' };
  }

  // Prepare data with defaults
  const data = {
    event_id: body.event_id,
    text: body.text.trim(),
    seq: body.seq ?? null,
    at_ms: body.at_ms ?? Date.now(),
    speaker: body.speaker ?? null,
    final: body.final !== false, // Default to true
  };

  return { valid: true, data };
}

export async function POST(req: NextRequest) {
  try {
    // Parse request body
    const body = await req.json().catch(() => ({}));

    // Validate input
    const validation = validateTranscript(body);
    if (!validation.valid) {
      return NextResponse.json(
        { ok: false, error: validation.error },
        { status: 400 }
      );
    }

    const supabase = getSupabaseClient();

    // Insert transcript into database
    // The orchestrator will automatically process this via Supabase Realtime subscription
    const { data: transcript, error } = await supabase
      .from('transcripts')
      .insert(validation.data!)
      .select('id, seq, text, ts')
      .single();

    if (error) {
      console.error('[api/ingest] Database error:', error.message);
      return NextResponse.json(
        { ok: false, error: `Failed to insert transcript: ${error.message}` },
        { status: 500 }
      );
    }

    // Return success response
    return NextResponse.json({
      ok: true,
      transcript_id: transcript.id,
      seq: transcript.seq,
      timestamp: transcript.ts,
    });
  } catch (error: any) {
    console.error('[api/ingest] Error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// Handle OPTIONS for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

