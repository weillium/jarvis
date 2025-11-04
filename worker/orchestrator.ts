/**
 * Orchestrator - Manages real-time event processing with OpenAI Realtime API
 * Handles dual-agent architecture (Cards + Facts) per event
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { RingBuffer, TranscriptChunk } from './ring-buffer';
import { FactsStore, Fact } from './facts-store';
import { RealtimeSession, AgentType } from './realtime-session';
import { buildTopicContext } from './context-builder';
import { getPolicy } from './policies';

export interface OrchestratorConfig {
  supabase: ReturnType<typeof createClient>;
  openai: OpenAI;
  embedModel: string;
  genModel: string;
  realtimeModel: string;
}

export interface EventRuntime {
  eventId: string;
  agentId: string;
  status: 'prepping' | 'ready' | 'running' | 'ended' | 'error';
  
  // In-memory state
  ringBuffer: RingBuffer;
  factsStore: FactsStore;
  
  // Realtime sessions
  cardsSession?: RealtimeSession;
  factsSession?: RealtimeSession;
  cardsSessionId?: string;
  factsSessionId?: string;
  
  // Checkpoints
  cardsLastSeq: number;
  factsLastSeq: number;
  
  // Debouncing for Facts agent
  factsUpdateTimer?: NodeJS.Timeout;
  factsLastUpdate: number;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export class Orchestrator {
  private config: OrchestratorConfig;
  private runtimes: Map<string, EventRuntime> = new Map();
  private supabaseRealtimeChannel?: any; // Supabase Realtime subscription

  constructor(config: OrchestratorConfig) {
    this.config = config;
  }

  /**
   * Initialize orchestrator - subscribe to transcript events
   */
  async initialize(): Promise<void> {
    console.log('[orchestrator] Initializing...');

    // Subscribe to Supabase Realtime for transcript inserts
    // This enables event-driven processing instead of polling
    const channel = this.config.supabase
      .channel('transcript_events')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'transcripts',
        },
        (payload: any) => {
          this.handleTranscriptInsert(payload.new);
        }
      )
      .subscribe();

    this.supabaseRealtimeChannel = channel;
    console.log('[orchestrator] Subscribed to transcript events');

    // Resume existing events (read checkpoints and rebuild state)
    await this.resumeExistingEvents();
  }

  /**
   * Handle new transcript insert from Supabase Realtime
   */
  private async handleTranscriptInsert(transcript: any): Promise<void> {
    const eventId = transcript.event_id;
    const runtime = this.runtimes.get(eventId);

    if (!runtime || runtime.status !== 'running') {
      // Event not active, skip
      return;
    }

    // Convert to TranscriptChunk
    const chunk: TranscriptChunk = {
      seq: transcript.seq || 0,
      at_ms: transcript.at_ms || Date.now(),
      speaker: transcript.speaker || undefined,
      text: transcript.text,
      final: transcript.final !== false, // Default to true if not specified
      transcript_id: transcript.id,
    };

    // Process the chunk
    await this.processTranscriptChunk(runtime, chunk);
  }

  /**
   * Process a single transcript chunk
   */
  private async processTranscriptChunk(
    runtime: EventRuntime,
    chunk: TranscriptChunk
  ): Promise<void> {
    // Add to ring buffer
    runtime.ringBuffer.add(chunk);

    // Only process finalized chunks
    if (!chunk.final) {
      return;
    }

    // Persist to database (already done via insert, but update seq if needed)
    if (!chunk.seq || chunk.seq === 0) {
      // Update sequence number if missing
      await this.config.supabase
        .from('transcripts')
        .update({ seq: runtime.cardsLastSeq + 1 })
        .eq('id', chunk.transcript_id);
      chunk.seq = runtime.cardsLastSeq + 1;
    }

    // Update checkpoints
    runtime.cardsLastSeq = Math.max(runtime.cardsLastSeq, chunk.seq);
    runtime.factsLastSeq = Math.max(runtime.factsLastSeq, chunk.seq);

    // Process with Cards Agent (immediate)
    await this.processCardsAgent(runtime, chunk);

    // Process with Facts Agent (debounced)
    this.scheduleFactsUpdate(runtime);
  }

  /**
   * Process transcript with Cards Agent
   */
  private async processCardsAgent(
    runtime: EventRuntime,
    chunk: TranscriptChunk
  ): Promise<void> {
    if (!runtime.cardsSession || !runtime.cardsSessionId) {
      console.warn(`[cards] No session for event ${runtime.eventId}`);
      return;
    }

    try {
      // Get context bullets from ring buffer
      const contextBullets = runtime.ringBuffer.getContextBullets(10);
      
      // Get relevant facts
      const factsContext = runtime.factsStore.getContextFormat();

      // Vector search for additional context
      const qEmb = await this.embedText(chunk.text);
      const vectorHits = await this.searchContext(runtime.eventId, qEmb, 5);
      const vectorContext = vectorHits.map((h) => h.chunk).join('\n');

      // Send to Realtime session
      await runtime.cardsSession.sendMessage(chunk.text, {
        bullets: contextBullets,
        facts: factsContext,
        vectorContext,
      });

      // Note: In real implementation, we'd receive the response via WebSocket
      // For now, we'll use a fallback to standard API
      await this.generateCardFallback(runtime, chunk, {
        bullets: contextBullets,
        facts: factsContext,
        vectorContext,
      });

      // Update checkpoint
      await this.persistCheckpoint(runtime.eventId, 'cards', runtime.cardsLastSeq);
    } catch (error: any) {
      console.error(`[cards] Error processing chunk: ${error.message}`);
    }
  }

  /**
   * Fallback: Generate card using standard API (until Realtime API is fully integrated)
   */
  private async generateCardFallback(
    runtime: EventRuntime,
    chunk: TranscriptChunk,
    context: any
  ): Promise<void> {
    const policy = getPolicy('cards', 1);

    const userPrompt = `Transcript:\n${chunk.text}\n\nRecent context:\n${context.bullets.join('\n')}\n\nRelevant facts:\n${JSON.stringify(context.facts, null, 2)}\n\nAdditional context:\n${context.vectorContext}\n\nDetermine the appropriate card_type (text, text_visual, or visual) and generate the card accordingly.`;

    try {
      const response = await this.config.openai.chat.completions.create({
        model: this.config.genModel,
        messages: [
          { role: 'system', content: policy },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      });

      const cardJson = response.choices[0]?.message?.content;
      if (!cardJson) return;

      const card = JSON.parse(cardJson);
      card.source_seq = chunk.seq;
      
      // Validate and normalize card_type
      if (!card.card_type || !['text', 'text_visual', 'visual'].includes(card.card_type)) {
        // Auto-determine type based on content
        card.card_type = this.determineCardType(card, chunk.text);
      }
      
      // Ensure required fields based on type
      if (card.card_type === 'visual') {
        if (!card.label) card.label = card.title || 'Image';
        if (!card.body) card.body = null; // Visual cards don't need body
      } else if (card.card_type === 'text_visual') {
        if (!card.body) card.body = card.title || 'Definition';
      } else {
        // text type
        if (!card.body) card.body = card.title || 'Definition';
        card.image_url = null; // Text cards don't have images
      }

      // Store in agent_outputs
      await this.config.supabase.from('agent_outputs').insert({
        event_id: runtime.eventId,
        agent_id: runtime.agentId,
        agent_type: 'cards',
        for_seq: chunk.seq,
        type: 'card',
        payload: card,
      });

      // Also store in legacy cards table for compatibility
      await this.config.supabase.from('cards').insert({
        event_id: runtime.eventId,
        kind: card.kind || 'Context',
        payload: card,
      });

      console.log(`[cards] Generated card for seq ${chunk.seq} (event: ${runtime.eventId}, type: ${card.card_type})`);
    } catch (error: any) {
      console.error(`[cards] Error generating card: ${error.message}`);
    }
  }

  /**
   * Determine card type based on content analysis
   */
  private determineCardType(card: any, transcriptText: string): 'text' | 'text_visual' | 'visual' {
    // Check if card has image_url
    if (card.image_url) {
      // If it has body/content, it's text_visual, otherwise visual
      return card.body ? 'text_visual' : 'visual';
    }

    // Analyze transcript for visual-worthy content
    const lowerText = transcriptText.toLowerCase();
    
    // Keywords that suggest visual content
    const visualKeywords = [
      'photo', 'image', 'picture', 'diagram', 'chart', 'graph', 'map',
      'illustration', 'visual', 'showing', 'depicts', 'looks like',
      'appearance', 'shape', 'structure', 'location', 'geography'
    ];
    
    const hasVisualKeyword = visualKeywords.some(keyword => lowerText.includes(keyword));
    
    // Check if it's a definition/explanation
    const definitionKeywords = [
      'is', 'are', 'means', 'refers to', 'definition', 'explain', 'describe',
      'what is', 'who is', 'where is', 'what are'
    ];
    
    const isDefinition = definitionKeywords.some(keyword => lowerText.includes(keyword));
    
    // Determine type
    if (isDefinition && hasVisualKeyword) {
      return 'text_visual';
    } else if (hasVisualKeyword && !card.body) {
      return 'visual';
    } else {
      return 'text';
    }
  }

  /**
   * Schedule Facts Agent update (debounced)
   */
  private scheduleFactsUpdate(runtime: EventRuntime): void {
    // Clear existing timer
    if (runtime.factsUpdateTimer) {
      clearTimeout(runtime.factsUpdateTimer);
    }

    // Schedule update (20-30 seconds debounce)
    const debounceMs = 25000; // 25 seconds
    runtime.factsUpdateTimer = setTimeout(() => {
      this.processFactsAgent(runtime);
    }, debounceMs);
  }

  /**
   * Process with Facts Agent
   */
  private async processFactsAgent(runtime: EventRuntime): Promise<void> {
    if (!runtime.factsSession || !runtime.factsSessionId) {
      console.warn(`[facts] No session for event ${runtime.eventId}`);
      return;
    }

    try {
      // Get condensed context
      const recentText = runtime.ringBuffer.getRecentText(20);
      const currentFacts = runtime.factsStore.getAll();

      // Send to Realtime session
      await runtime.factsSession.sendMessage(recentText, {
        recentText,
        facts: currentFacts.map((f) => ({
          key: f.key,
          value: f.value,
          confidence: f.confidence,
        })),
      });

      // Note: In real implementation, we'd receive the response via WebSocket
      // For now, we'll use a fallback to standard API
      await this.generateFactsFallback(runtime, recentText, currentFacts);

      // Update checkpoint
      await this.persistCheckpoint(runtime.eventId, 'facts', runtime.factsLastSeq);
      runtime.factsLastUpdate = Date.now();
    } catch (error: any) {
      console.error(`[facts] Error processing: ${error.message}`);
    }
  }

  /**
   * Fallback: Generate facts using standard API
   */
  private async generateFactsFallback(
    runtime: EventRuntime,
    recentText: string,
    currentFacts: Fact[]
  ): Promise<void> {
    const policy = `You are a facts extractor. Track stable keys (agenda, decisions, deadlines, metrics). Return JSON array of facts.`;

    const userPrompt = `Recent transcripts:\n${recentText}\n\nCurrent facts:\n${JSON.stringify(currentFacts, null, 2)}\n\nExtract or update stable facts. Return JSON array with keys: key, value, confidence.`;

    try {
      const response = await this.config.openai.chat.completions.create({
        model: this.config.genModel,
        messages: [
          { role: 'system', content: policy },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.5,
      });

      const factsJson = response.choices[0]?.message?.content;
      if (!factsJson) return;

      const parsed = JSON.parse(factsJson);
      const newFacts = parsed.facts || [];

      // Update facts store and database
      for (const fact of newFacts) {
        if (!fact.key || !fact.value) continue;

        const confidence = fact.confidence || 0.7;
        runtime.factsStore.upsert(
          fact.key,
          fact.value,
          confidence,
          runtime.factsLastSeq,
          undefined
        );

        // Upsert to database
        await this.config.supabase.from('facts').upsert(
          {
            event_id: runtime.eventId,
            fact_key: fact.key,
            fact_value: fact.value,
            confidence,
            last_seen_seq: runtime.factsLastSeq,
            sources: [], // TODO: Track source transcript IDs
          },
          {
            onConflict: 'event_id,fact_key',
          }
        );

        // Store in agent_outputs
        await this.config.supabase.from('agent_outputs').insert({
          event_id: runtime.eventId,
          agent_id: runtime.agentId,
          agent_type: 'facts',
          for_seq: runtime.factsLastSeq,
          type: 'fact_update',
          payload: fact,
        });
      }

      console.log(`[facts] Updated ${newFacts.length} facts (event: ${runtime.eventId})`);
    } catch (error: any) {
      console.error(`[facts] Error generating facts: ${error.message}`);
    }
  }

  /**
   * Start event processing (called when agent status -> running)
   */
  async startEvent(eventId: string, agentId: string): Promise<void> {
    console.log(`[orchestrator] Starting event ${eventId}`);

    // Get or create runtime
    let runtime = this.runtimes.get(eventId);
    if (!runtime) {
      runtime = await this.createRuntime(eventId, agentId);
    }

    if (runtime.status !== 'ready') {
      console.warn(`[orchestrator] Event ${eventId} not ready (status: ${runtime.status})`);
      return;
    }

    // Create Realtime sessions
    runtime.cardsSession = new RealtimeSession(this.config.openai, {
      eventId,
      agentType: 'cards',
      model: this.config.realtimeModel,
    });

    runtime.factsSession = new RealtimeSession(this.config.openai, {
      eventId,
      agentType: 'facts',
      model: this.config.realtimeModel,
    });

    // Connect sessions
    runtime.cardsSessionId = await runtime.cardsSession.connect();
    runtime.factsSessionId = await runtime.factsSession.connect();

    // Store session IDs in database
    await this.config.supabase.from('agent_sessions').insert([
      {
        event_id: eventId,
        agent_id: agentId,
        provider_session_id: runtime.cardsSessionId,
        agent_type: 'cards',
        status: 'active',
      },
      {
        event_id: eventId,
        agent_id: agentId,
        provider_session_id: runtime.factsSessionId,
        agent_type: 'facts',
        status: 'active',
      },
    ]);

    // Update status
    runtime.status = 'running';
    await this.config.supabase
      .from('agents')
      .update({ status: 'running' })
      .eq('id', agentId);

    console.log(`[orchestrator] Event ${eventId} started`);
  }

  /**
   * Create runtime for an event
   */
  private async createRuntime(
    eventId: string,
    agentId: string
  ): Promise<EventRuntime> {
    // Read checkpoints
    const { data: checkpoints } = await this.config.supabase
      .from('checkpoints')
      .select('agent_type, last_seq_processed')
      .eq('event_id', eventId);

    const cardsCheckpoint = checkpoints?.find((c) => c.agent_type === 'cards');
    const factsCheckpoint = checkpoints?.find((c) => c.agent_type === 'facts');

    const runtime: EventRuntime = {
      eventId,
      agentId,
      status: 'ready',
      ringBuffer: new RingBuffer(1000, 5 * 60 * 1000), // 5 minutes
      factsStore: new FactsStore(),
      cardsLastSeq: cardsCheckpoint?.last_seq_processed || 0,
      factsLastSeq: factsCheckpoint?.last_seq_processed || 0,
      factsLastUpdate: Date.now(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.runtimes.set(eventId, runtime);
    return runtime;
  }

  /**
   * Resume existing events (on startup)
   */
  private async resumeExistingEvents(): Promise<void> {
    // Find events with running agents
    const { data: agents } = await this.config.supabase
      .from('agents')
      .select('id, event_id, status')
      .eq('status', 'running')
      .limit(50);

    if (!agents || agents.length === 0) {
      console.log('[orchestrator] No running events to resume');
      return;
    }

    console.log(`[orchestrator] Resuming ${agents.length} events`);

    for (const agent of agents) {
      try {
        // Create runtime and rebuild state from checkpoints
        const runtime = await this.createRuntime(agent.event_id, agent.id);

        // Replay transcripts since last checkpoint
        await this.replayTranscripts(runtime);

        // Restart sessions
        await this.startEvent(agent.event_id, agent.id);
      } catch (error: any) {
        console.error(
          `[orchestrator] Error resuming event ${agent.event_id}: ${error.message}`
        );
      }
    }
  }

  /**
   * Replay transcripts to rebuild ring buffer and facts store
   */
  private async replayTranscripts(runtime: EventRuntime): Promise<void> {
    const { data: transcripts } = await this.config.supabase
      .from('transcripts')
      .select('id, seq, at_ms, speaker, text, final')
      .eq('event_id', runtime.eventId)
      .gt('seq', Math.max(runtime.cardsLastSeq, runtime.factsLastSeq))
      .order('seq', { ascending: true })
      .limit(1000);

    if (!transcripts || transcripts.length === 0) {
      return;
    }

    console.log(`[orchestrator] Replaying ${transcripts.length} transcripts for event ${runtime.eventId}`);

    for (const t of transcripts) {
      const chunk: TranscriptChunk = {
        seq: t.seq || 0,
        at_ms: t.at_ms || Date.now(),
        speaker: t.speaker || undefined,
        text: t.text,
        final: t.final !== false,
        transcript_id: t.id,
      };

      runtime.ringBuffer.add(chunk);
    }

    // Update checkpoints
    if (transcripts.length > 0) {
      const lastSeq = Math.max(...transcripts.map((t) => t.seq || 0));
      runtime.cardsLastSeq = Math.max(runtime.cardsLastSeq, lastSeq);
      runtime.factsLastSeq = Math.max(runtime.factsLastSeq, lastSeq);
    }
  }

  /**
   * Persist checkpoint to database
   */
  private async persistCheckpoint(
    eventId: string,
    agentType: AgentType,
    lastSeq: number
  ): Promise<void> {
    const runtime = this.runtimes.get(eventId);
    if (!runtime) return;

    await this.config.supabase.from('checkpoints').upsert(
      {
        event_id: eventId,
        agent_id: runtime.agentId,
        agent_type: agentType,
        last_seq_processed: lastSeq,
      },
      {
        onConflict: 'event_id,agent_type',
      }
    );
  }

  /**
   * Prepare event (build context)
   */
  async prepareEvent(eventId: string, agentId: string): Promise<void> {
    console.log(`[orchestrator] Preparing event ${eventId}`);

    // Check if context already exists - prevent duplicate creation
    const { data: existingContext, error: contextError } = await this.config.supabase
      .from('context_items')
      .select('id')
      .eq('event_id', eventId)
      .limit(1);

    if (contextError) {
      console.error(`[orchestrator] Error checking existing context: ${contextError.message}`);
      throw new Error(`Failed to check existing context: ${contextError.message}`);
    }

    if (existingContext && existingContext.length > 0) {
      console.log(`[orchestrator] Context already exists for event ${eventId}, skipping build`);
      // Mark agent as ready and create runtime
      await this.config.supabase
        .from('agents')
        .update({ status: 'ready' })
        .eq('id', agentId);
      await this.createRuntime(eventId, agentId);
      console.log(`[orchestrator] Event ${eventId} already prepared, marked as ready`);
      return;
    }

    // Get event details
    const { data: event } = await this.config.supabase
      .from('events')
      .select('id, title, topic')
      .eq('id', eventId)
      .single();

    if (!event) {
      throw new Error(`Event ${eventId} not found`);
    }

    // Mark agent as 'preparing' immediately to prevent duplicate picks (if status column supports it)
    // Note: This is a safety measure - the main protection is in tickPrep()
    
    // Build topic-specific context using standard LLM
    await buildTopicContext(
      eventId,
      event.title,
      event.topic,
      {
        supabase: this.config.supabase,
        openai: this.config.openai,
        embedModel: this.config.embedModel,
        genModel: this.config.genModel,
      }
    );

    // Mark agent as ready
    const { error: updateError } = await this.config.supabase
      .from('agents')
      .update({ status: 'ready' })
      .eq('id', agentId);

    if (updateError) {
      console.error(`[orchestrator] Error updating agent status: ${updateError.message}`);
      throw new Error(`Failed to update agent status: ${updateError.message}`);
    }

    // Create runtime
    await this.createRuntime(eventId, agentId);

    console.log(`[orchestrator] Event ${eventId} prepared`);
  }

  /**
   * Helper: Embed text
   */
  private async embedText(text: string): Promise<number[]> {
    const res = await this.config.openai.embeddings.create({
      model: this.config.embedModel,
      input: text,
    });
    return res.data[0].embedding;
  }

  /**
   * Helper: Search context
   */
  private async searchContext(
    eventId: string,
    query: number[],
    k: number = 5
  ): Promise<{ id: string; chunk: string; similarity: number }[]> {
    const { data, error } = await this.config.supabase.rpc('match_context', {
      p_event: eventId,
      p_query: query,
      p_limit: k,
    });

    if (error) {
      console.error(`[orchestrator] Context search error: ${error.message}`);
      return [];
    }

    return (data || []) as { id: string; chunk: string; similarity: number }[];
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.log('[orchestrator] Shutting down...');

    // Flush all checkpoints
    for (const [eventId, runtime] of this.runtimes.entries()) {
      await this.persistCheckpoint(eventId, 'cards', runtime.cardsLastSeq);
      await this.persistCheckpoint(eventId, 'facts', runtime.factsLastSeq);

      // Close sessions
      if (runtime.cardsSession) {
        await runtime.cardsSession.close();
      }
      if (runtime.factsSession) {
        await runtime.factsSession.close();
      }
    }

    // Unsubscribe from Realtime
    if (this.supabaseRealtimeChannel) {
      await this.config.supabase.removeChannel(this.supabaseRealtimeChannel);
    }

    console.log('[orchestrator] Shutdown complete');
  }
}

