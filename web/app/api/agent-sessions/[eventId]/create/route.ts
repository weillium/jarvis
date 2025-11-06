import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Create agent sessions (generate without starting)
 * POST /api/agent-sessions/[eventId]/create
 * 
 * Creates sessions with 'closed' status but does not start them.
 * Updates agent status to 'testing' after successful creation.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await params;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Get the agent for this event (must be context_complete stage)
    const { data: agents, error: agentError } = await supabase
      .from('agents')
      .select('id, status, stage, model_set')
      .eq('event_id', eventId)
      .eq('status', 'idle')
      .eq('stage', 'context_complete')
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
        error: 'No agent with context_complete stage found for this event',
      },
        { status: 404 }
      );
    }

    const agentId = agents[0].id;

    // Check if sessions already exist
    const { data: existingSessions, error: sessionsCheckError } = await supabase
      .from('agent_sessions')
      .select('id, agent_type, status')
      .eq('event_id', eventId)
      .eq('agent_id', agentId);

    if (sessionsCheckError) {
      return NextResponse.json(
        { ok: false, error: `Failed to check existing sessions: ${sessionsCheckError.message}` },
        { status: 500 }
      );
    }

    // If sessions exist, delete them first (fresh generation)
    if (existingSessions && existingSessions.length > 0) {
      const { error: deleteError } = await supabase
        .from('agent_sessions')
        .delete()
        .eq('event_id', eventId)
        .eq('agent_id', agentId);

      if (deleteError) {
        return NextResponse.json(
          { ok: false, error: `Failed to delete existing sessions: ${deleteError.message}` },
          { status: 500 }
        );
      }
    }

    // Get agent's model_set to determine which models to use
    const modelSet = agents[0].model_set || 'Open AI';
    
    // Determine models based on model_set
    let transcriptModel: string;
    let cardsModel: string;
    let factsModel: string;
    
    if (modelSet === 'Open AI') {
      transcriptModel = process.env.OPENAI_TRANSCRIPT_MODEL || process.env.DEFAULT_TRANSCRIPT_MODEL || 'gpt-4o-realtime-preview-2024-10-01';
      cardsModel = process.env.OPENAI_CARDS_MODEL || process.env.DEFAULT_CARDS_MODEL || 'gpt-4o-realtime-preview-2024-10-01';
      factsModel = process.env.OPENAI_FACTS_MODEL || process.env.DEFAULT_FACTS_MODEL || 'gpt-4o-mini';
    } else {
      // Default fallback for unknown model_set values
      transcriptModel = process.env.DEFAULT_TRANSCRIPT_MODEL || 'gpt-4o-realtime-preview-2024-10-01';
      cardsModel = process.env.DEFAULT_CARDS_MODEL || 'gpt-4o-realtime-preview-2024-10-01';
      factsModel = process.env.DEFAULT_FACTS_MODEL || 'gpt-4o-mini';
    }
    
    console.log(`[api/agent-sessions/create] Using models for event ${eventId} (model_set: ${modelSet}):`);
    console.log(`  - Transcript: ${transcriptModel}`);
    console.log(`  - Cards: ${cardsModel}`);
    console.log(`  - Facts: ${factsModel}`);

    // Create new sessions with 'closed' status (will be updated to 'active' when started)
    const { data: newSessions, error: createError } = await supabase
      .from('agent_sessions')
      .insert([
        {
          event_id: eventId,
          agent_id: agentId,
          provider_session_id: 'pending', // Will be set when actually started
          agent_type: 'transcript',
          status: 'closed', // Will be updated to 'active' when started
          model: transcriptModel,
        },
        {
          event_id: eventId,
          agent_id: agentId,
          provider_session_id: 'pending', // Will be set when actually started
          agent_type: 'cards',
          status: 'closed', // Will be updated to 'active' when started
          model: cardsModel,
        },
        {
          event_id: eventId,
          agent_id: agentId,
          provider_session_id: 'pending',
          agent_type: 'facts',
          status: 'closed', // Will be updated to 'active' when started
          model: factsModel,
        },
      ])
      .select();

    if (createError) {
      return NextResponse.json(
        { ok: false, error: `Failed to create sessions: ${createError.message}` },
        { status: 500 }
      );
    }

    // Update agent status to 'active' with 'testing' stage
    const { error: updateError } = await supabase
      .from('agents')
      .update({ status: 'active', stage: 'testing' })
      .eq('id', agentId);

    if (updateError) {
      // Log error but don't fail - sessions were created successfully
      console.error(`Failed to update agent status to testing: ${updateError.message}`);
    }

    return NextResponse.json({
      ok: true,
      message: 'Sessions generated successfully. Agent status set to testing.',
      eventId,
      agentId,
      sessions: newSessions,
    });
  } catch (error: any) {
    console.error('Error creating agent sessions:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

