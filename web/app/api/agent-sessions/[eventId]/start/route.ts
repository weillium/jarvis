import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const agentTypes = ['transcript', 'cards', 'facts'] as const;
type AgentTypeSelection = (typeof agentTypes)[number];

/**
 * Start or resume agent sessions for an event
 * POST /api/agent-sessions/[eventId]/start
 * 
 * Unified endpoint that handles both starting new sessions and resuming paused sessions.
 * Updates sessions to 'active' status and the worker will pick them up and establish WebSocket connections.
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

    const defaultSelection: Record<AgentTypeSelection, boolean> = {
      transcript: true,
      cards: true,
      facts: true,
    };
    const parseSelection = (value: unknown): Record<AgentTypeSelection, boolean> | null => {
      if (!value || typeof value !== 'object') {
        return null;
      }
      const record = value as Record<string, unknown>;
      const transcript = typeof record.transcript === 'boolean' ? record.transcript : null;
      const cards = typeof record.cards === 'boolean' ? record.cards : null;
      const facts = typeof record.facts === 'boolean' ? record.facts : null;
      if (transcript === null && cards === null && facts === null) {
        return null;
      }
      return {
        transcript: transcript ?? true,
        cards: cards ?? true,
        facts: facts ?? true,
      };
    };

    let selectionPayload: Record<AgentTypeSelection, boolean> | null = null;
    try {
      const body = await req.json();
      selectionPayload = parseSelection((body as Record<string, unknown>)?.agents);
    } catch {
      selectionPayload = null;
    }

    const agentsSelection = selectionPayload ?? defaultSelection;
    if (!agentsSelection.transcript && !agentsSelection.cards && !agentsSelection.facts) {
      return NextResponse.json(
        { ok: false, error: 'Select at least one agent to start.' },
        { status: 400 }
      );
    }

    // Get the agent for this event - accept multiple states
    // Try active + (testing | running) first, then idle + context_complete
    let { data: agents, error: agentError } = await supabase
      .from('agents')
      .select('id, status, stage')
      .eq('event_id', eventId)
      .eq('status', 'active')
      .in('stage', ['testing', 'running'])
      .limit(1);
    
    if (!agents || agents.length === 0) {
      const { data: agents2, error: error2 } = await supabase
        .from('agents')
        .select('id, status, stage')
        .eq('event_id', eventId)
        .eq('status', 'idle')
        .eq('stage', 'context_complete')
        .limit(1);
      
      if (error2) {
        agentError = error2;
      } else {
        agents = agents2;
      }
    }

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
          error: 'No agent found for this event. Create sessions first.',
        },
        { status: 404 }
      );
    }

    const agent = agents[0];
    const agentId = agent.id;

    const { data: allSessions, error: sessionsError } = await supabase
      .from('agent_sessions')
      .select('id, agent_type, status')
      .eq('event_id', eventId)
      .eq('agent_id', agentId);

    if (sessionsError) {
      return NextResponse.json(
        { ok: false, error: `Failed to fetch sessions: ${sessionsError.message}` },
        { status: 500 }
      );
    }

    if (!allSessions || allSessions.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'No sessions found for this agent. Create sessions first.',
        },
        { status: 404 }
      );
    }

    const targetTypes = new Set<AgentTypeSelection>();
    agentTypes.forEach((type) => {
      if (agentsSelection[type]) {
        targetTypes.add(type);
      }
    });

    const selectedSessions = allSessions.filter((s) =>
      targetTypes.has(s.agent_type as AgentTypeSelection)
    );
    if (selectedSessions.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'No sessions available for the selected agents. Create sessions first.' },
        { status: 404 }
      );
    }

    const sessionsToStart = selectedSessions.filter((s) =>
      s.status === 'closed' || s.status === 'paused'
    );
    const pausedCount = sessionsToStart.filter((s) => s.status === 'paused').length;
    const closedCount = sessionsToStart.filter((s) => s.status === 'closed').length;
    const alreadyActiveCount = selectedSessions.filter((s) => s.status === 'active').length;

    // Update agent status to active with running stage if needed (for paused sessions or context_complete)
    if (pausedCount > 0 || agent.stage === 'context_complete') {
      const { error: agentUpdateError } = await supabase
        .from('agents')
        .update({ status: 'active', stage: 'running' })
        .eq('id', agentId);

      if (agentUpdateError) {
        console.warn(`Failed to update agent status: ${agentUpdateError.message}`);
      }
    }

    if (sessionsToStart.length > 0) {
      const { error: updateError } = await supabase
        .from('agent_sessions')
        .update({ status: 'active' })
        .eq('event_id', eventId)
        .eq('agent_id', agentId)
        .in('id', sessionsToStart.map((s) => s.id));

      if (updateError) {
        return NextResponse.json(
          { ok: false, error: `Failed to update sessions: ${updateError.message}` },
          { status: 500 }
        );
      }
    }

    const disabledTypes = agentTypes.filter((type) => !targetTypes.has(type));
    if (disabledTypes.length > 0) {
      const { error: disableError } = await supabase
        .from('agent_sessions')
        .update({ status: 'closed' })
        .eq('event_id', eventId)
        .eq('agent_id', agentId)
        .in('agent_type', disabledTypes)
        .neq('status', 'closed');

      if (disableError) {
        console.warn(`Failed to close disabled sessions: ${disableError.message}`);
      }
    }

    if (sessionsToStart.length === 0 && alreadyActiveCount === selectedSessions.length) {
      return NextResponse.json({
        ok: true,
        message: 'Selected agent sessions are already active.',
        eventId,
        agentId,
        agents: agentsSelection,
        sessionsUpdated: 0,
        pausedCount: 0,
        closedCount: 0,
      });
    }

    if (sessionsToStart.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'No closed or paused sessions found for the selected agents. Create sessions first.',
        },
        { status: 404 }
      );
    }

    // Note: Worker will pick up sessions with 'active' status and connect them
    // The worker's startEvent will handle both new sessions and paused sessions

    return NextResponse.json({
      ok: true,
      message: pausedCount > 0
        ? `Sessions will be started by worker. ${pausedCount} paused session(s) and ${closedCount} closed session(s) updated to active.`
        : `Sessions will be started by worker. ${closedCount} closed session(s) updated to active.`,
      eventId,
      agentId,
      sessionsUpdated: sessionsToStart.length,
      pausedCount,
      closedCount,
      agents: agentsSelection,
    });
  } catch (error: any) {
    console.error('Error starting agent sessions:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

