/**
 * Orchestrator - Manages real-time event processing with OpenAI Realtime API
 * Handles dual-agent architecture (Cards + Facts) per event
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { RingBuffer, TranscriptChunk } from './ring-buffer';
import { FactsStore, Fact } from './facts-store';
import { RealtimeSession, AgentType } from './realtime-session';
import { getPolicy } from './policies';
import {
  createCardGenerationUserPrompt,
  FACTS_EXTRACTION_SYSTEM_PROMPT,
  createFactsExtractionUserPrompt,
} from './prompts';

export interface OrchestratorConfig {
  supabase: ReturnType<typeof createClient>;
  openai: OpenAI;
  embedModel: string;
  genModel: string;
  realtimeModel: string;
  sseEndpoint?: string; // Base URL for SSE push endpoint (e.g., 'http://localhost:3000')
}

export interface GlossaryEntry {
  term: string;
  definition: string;
  acronym_for?: string;
  category?: string;
  usage_examples?: string[];
  related_terms?: string[];
  confidence_score?: number;
}

export interface LogEntry {
  level: 'log' | 'warn' | 'error';
  message: string;
  timestamp: string;
  context?: {
    seq?: number;
    agent_type?: 'cards' | 'facts';
    event_id?: string;
  };
}

export interface AgentSessionStatus {
  agent_type: 'cards' | 'facts';
  session_id: string;
  status: 'starting' | 'active' | 'closed' | 'error';
  runtime: {
    event_id: string;
    agent_id: string;
    runtime_status: string;
    cards_last_seq: number;
    facts_last_seq: number;
    facts_last_update: string;
    ring_buffer_stats: any;
    facts_store_stats: any;
  };
  token_metrics: {
    total_tokens: number;
    request_count: number;
    max_tokens: number;
    avg_tokens: number;
    warnings: number;
    criticals: number;
    last_request?: {
      tokens: number;
      percentage: number;
      breakdown: Record<string, number>;
      timestamp: string;
    };
  };
  recent_logs: LogEntry[];
  metadata: {
    created_at: string;
    updated_at: string;
    closed_at: string | null;
    model: string;
  };
}

export interface EventRuntime {
  eventId: string;
  agentId: string;
  status: 'prepping' | 'context_complete' | 'running' | 'ended' | 'error';
  
  // In-memory state
  ringBuffer: RingBuffer;
  factsStore: FactsStore;
  glossaryCache?: Map<string, GlossaryEntry>; // Glossary terms cache
  
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
  
  // Context metrics tracking
  contextMetrics?: {
    cards: {
      total: number;
      count: number;
      max: number;
      warnings: number;
      criticals: number;
    };
    facts: {
      total: number;
      count: number;
      max: number;
      warnings: number;
      criticals: number;
    };
  };
  
  // Log buffers for each agent
  logBuffers?: {
    cards: LogEntry[];
    facts: LogEntry[];
  };
  
  // Periodic summary timer
  summaryTimer?: NodeJS.Timeout;
  
  // Status update timer
  statusUpdateTimer?: NodeJS.Timeout;
  
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
   * Capture log entry for an agent session
   */
  private captureLog(
    runtime: EventRuntime,
    agentType: 'cards' | 'facts',
    level: 'log' | 'warn' | 'error',
    message: string,
    context?: { seq?: number; event_id?: string }
  ): void {
    if (!runtime.logBuffers) {
      runtime.logBuffers = {
        cards: [],
        facts: [],
      };
    }

    const buffer = runtime.logBuffers[agentType];
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: {
        ...context,
        agent_type: agentType,
        event_id: runtime.eventId,
      },
    };

    buffer.push(entry);
    
    // Keep last 100 entries per agent
    if (buffer.length > 100) {
      buffer.shift();
    }

    // Also output to console for immediate visibility
    if (level === 'error') {
      console.error(`[${agentType}] ${message}`);
    } else if (level === 'warn') {
      console.warn(`[${agentType}] ${message}`);
    } else {
      console.log(`[${agentType}] ${message}`);
    }
  }

  /**
   * Get comprehensive session status data for an agent
   */
  private getSessionStatusData(
    runtime: EventRuntime,
    agentType: 'cards' | 'facts'
  ): AgentSessionStatus {
    const session = agentType === 'cards' 
      ? runtime.cardsSession 
      : runtime.factsSession;
    const sessionId = agentType === 'cards'
      ? runtime.cardsSessionId
      : runtime.factsSessionId;
    
    const metrics = runtime.contextMetrics?.[agentType] || {
      total: 0,
      count: 0,
      max: 0,
      warnings: 0,
      criticals: 0,
    };

    // Get session status from session state
    let status: 'starting' | 'active' | 'closed' | 'error' = 'starting';
    if (session) {
      const sessionStatus = session.getStatus();
      if (sessionStatus.isActive) {
        status = 'active';
      } else if (sessionId) {
        // Session exists but not active - could be closed or error
        // We'll check database in updateSessionStatus for accurate status
        status = 'closed';
      }
    }

    // Extract last request info from most recent log entry
    const logs = runtime.logBuffers?.[agentType] || [];
    const lastRequestLog = logs
      .filter(log => log.message.includes('tokens'))
      .slice(-1)[0];
    
    let lastRequest: {
      tokens: number;
      percentage: number;
      breakdown: Record<string, number>;
      timestamp: string;
    } | undefined;

    if (lastRequestLog) {
      // Try to extract token info from log message
      // Format: "[context] Cards Agent (seq X): Y/2048 tokens (Z%) - breakdown"
      const tokenMatch = lastRequestLog.message.match(/(\d+)\/2048 tokens \((\d+(?:\.\d+)?)%\)/);
      if (tokenMatch) {
        const tokens = parseInt(tokenMatch[1], 10);
        const percentage = parseFloat(tokenMatch[2]);
        
        // Extract breakdown if available
        const breakdown: Record<string, number> = {};
        const breakdownMatch = lastRequestLog.message.match(/breakdown:\s*(.+)/);
        if (breakdownMatch) {
          // Simple parsing - could be enhanced
          breakdownMatch[1].split(',').forEach(part => {
            const kv = part.trim().split(':');
            if (kv.length === 2) {
              breakdown[kv[0].trim()] = parseFloat(kv[1].trim());
            }
          });
        }

        lastRequest = {
          tokens,
          percentage,
          breakdown,
          timestamp: lastRequestLog.timestamp,
        };
      }
    }

    return {
      agent_type: agentType,
      session_id: sessionId || 'pending',
      status,
      runtime: {
        event_id: runtime.eventId,
        agent_id: runtime.agentId,
        runtime_status: runtime.status,
        cards_last_seq: runtime.cardsLastSeq,
        facts_last_seq: runtime.factsLastSeq,
        facts_last_update: new Date(runtime.factsLastUpdate).toISOString(),
        ring_buffer_stats: runtime.ringBuffer.getStats(),
        facts_store_stats: runtime.factsStore.getStats(),
      },
      token_metrics: {
        total_tokens: metrics.total,
        request_count: metrics.count,
        max_tokens: metrics.max,
        avg_tokens: metrics.count > 0 ? Math.round(metrics.total / metrics.count) : 0,
        warnings: metrics.warnings,
        criticals: metrics.criticals,
        last_request: lastRequest,
      },
      recent_logs: logs.slice(-50), // Last 50 entries
      metadata: {
        created_at: runtime.createdAt.toISOString(),
        updated_at: runtime.updatedAt.toISOString(),
        closed_at: null, // Will be populated from agent_sessions
        model: this.config.realtimeModel,
      },
    };
  }

  /**
   * Update session status in database and prepare for SSE streaming
   */
  private async updateSessionStatus(runtime: EventRuntime): Promise<void> {
    // Get current session records from database
    const { data: sessions } = await this.config.supabase
      .from('agent_sessions')
      .select('*')
      .eq('event_id', runtime.eventId);

    if (!sessions || sessions.length === 0) {
      return;
    }

    // Aggregate status for each agent
    const cardsStatus = this.getSessionStatusData(runtime, 'cards');
    const factsStatus = this.getSessionStatusData(runtime, 'facts');

    // Merge with database session info
    const cardsSession = sessions.find(s => s.agent_type === 'cards');
    const factsSession = sessions.find(s => s.agent_type === 'facts');

    if (cardsSession) {
      cardsStatus.status = cardsSession.status;
      cardsStatus.session_id = cardsSession.provider_session_id;
      cardsStatus.metadata.created_at = cardsSession.created_at;
      cardsStatus.metadata.updated_at = cardsSession.updated_at;
      cardsStatus.metadata.closed_at = cardsSession.closed_at;
    }

    if (factsSession) {
      factsStatus.status = factsSession.status;
      factsStatus.session_id = factsSession.provider_session_id;
      factsStatus.metadata.created_at = factsSession.created_at;
      factsStatus.metadata.updated_at = factsSession.updated_at;
      factsStatus.metadata.closed_at = factsSession.closed_at;
    }

    // Update runtime metadata
    runtime.updatedAt = new Date();

    // Push comprehensive status updates to SSE stream (Step 7)
    await this.pushSessionStatus(runtime, cardsStatus, factsStatus);
  }

  /**
   * Push session status updates to SSE stream
   */
  private async pushSessionStatus(
    runtime: EventRuntime,
    cardsStatus: AgentSessionStatus,
    factsStatus: AgentSessionStatus
  ): Promise<void> {
    // Only push if SSE endpoint is configured
    if (!this.config.sseEndpoint) {
      return;
    }

    try {
      const baseUrl = this.config.sseEndpoint.replace(/\/$/, ''); // Remove trailing slash

      // Push cards status
      const cardsResponse = await fetch(`${baseUrl}/api/agent-sessions/${runtime.eventId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cardsStatus),
      });

      if (!cardsResponse.ok) {
        const error = await cardsResponse.json().catch(() => ({ error: 'Unknown error' }));
        console.warn(`[orchestrator] Failed to push cards status: ${error.error || cardsResponse.statusText}`);
      }

      // Push facts status
      const factsResponse = await fetch(`${baseUrl}/api/agent-sessions/${runtime.eventId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(factsStatus),
      });

      if (!factsResponse.ok) {
        const error = await factsResponse.json().catch(() => ({ error: 'Unknown error' }));
        console.warn(`[orchestrator] Failed to push facts status: ${error.error || factsResponse.statusText}`);
      }
    } catch (error: any) {
      // Don't throw - status push failure shouldn't break processing
      console.error(`[orchestrator] Error pushing session status: ${error.message}`);
    }
  }

  /**
   * Get current session status for an event (for external access)
   */
  getSessionStatus(eventId: string): {
    cards: AgentSessionStatus | null;
    facts: AgentSessionStatus | null;
  } {
    const runtime = this.runtimes.get(eventId);
    if (!runtime) {
      return { cards: null, facts: null };
    }

    return {
      cards: this.getSessionStatusData(runtime, 'cards'),
      facts: this.getSessionStatusData(runtime, 'facts'),
    };
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
      this.captureLog(runtime, 'cards', 'warn', `No session for event ${runtime.eventId}`);
      return;
    }

    try {
      // Get context bullets from ring buffer (capped at 2048 tokens)
      const contextBullets = runtime.ringBuffer.getContextBullets(10, 2048);
      
      // Get relevant facts
      const factsContext = runtime.factsStore.getContextFormat();

      // Note: Vector search removed - agent will use retrieve() tool when needed
      // Vector DB is available but not automatically loaded into context

      // Glossary extraction
      const combinedText = `${chunk.text} ${contextBullets.join(' ')}`;
      const glossaryTerms = this.extractGlossaryTerms(
        combinedText,
        runtime.glossaryCache || new Map()
      );
      const glossaryContext = this.formatGlossaryContext(glossaryTerms);

      // Log token usage for monitoring with budget warnings
      const { getTokenBreakdown, checkBudgetStatus, formatTokenBreakdown } = await import('./utils/token-counter');
      const tokenBreakdown = getTokenBreakdown({
        currentChunk: chunk.text,
        ringBuffer: contextBullets.join('\n'),
        facts: JSON.stringify(factsContext),
        glossaryContext,
      });
      
      const budgetStatus = checkBudgetStatus(tokenBreakdown.total, 2048);
      const breakdownStr = formatTokenBreakdown(tokenBreakdown.breakdown);
      
      let logLevel: 'log' | 'warn' | 'error' = 'log';
      let logPrefix = `[context]`;
      
      if (budgetStatus.critical) {
        logLevel = 'error';
        logPrefix = `[context] ⚠️ CRITICAL`;
      } else if (budgetStatus.warning) {
        logLevel = 'warn';
        logPrefix = `[context] ⚠️ WARNING`;
      }
      
      const logMessage = `${logPrefix} Cards Agent (seq ${chunk.seq}): ${tokenBreakdown.total}/2048 tokens (${budgetStatus.percentage}%) - ${breakdownStr}`;
      
      this.captureLog(runtime, 'cards', logLevel, logMessage, { seq: chunk.seq });
      
      // Track metrics for periodic summary
      if (!runtime.contextMetrics) {
        runtime.contextMetrics = {
          cards: { total: 0, count: 0, max: 0, warnings: 0, criticals: 0 },
          facts: { total: 0, count: 0, max: 0, warnings: 0, criticals: 0 },
        };
      }
      
      runtime.contextMetrics.cards.total += tokenBreakdown.total;
      runtime.contextMetrics.cards.count++;
      runtime.contextMetrics.cards.max = Math.max(runtime.contextMetrics.cards.max, tokenBreakdown.total);
      if (budgetStatus.warning) runtime.contextMetrics.cards.warnings++;
      if (budgetStatus.critical) runtime.contextMetrics.cards.criticals++;

      // Send to Realtime session
      await runtime.cardsSession.sendMessage(chunk.text, {
        bullets: contextBullets,
        facts: factsContext,
        glossaryContext,
      });

      // Note: In real implementation, we'd receive the response via WebSocket
      // For now, we'll use a fallback to standard API
      await this.generateCardFallback(runtime, chunk, {
        bullets: contextBullets,
        facts: factsContext,
        glossaryContext,
      });

      // Update checkpoint
      await this.persistCheckpoint(runtime.eventId, 'cards', runtime.cardsLastSeq);
    } catch (error: any) {
      this.captureLog(runtime, 'cards', 'error', `Error processing chunk: ${error.message}`, { seq: chunk.seq });
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

    const userPrompt = createCardGenerationUserPrompt(
      chunk.text,
      context.bullets,
      JSON.stringify(context.facts, null, 2),
      context.glossaryContext
    );

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

      this.captureLog(runtime, 'cards', 'log', `Generated card for seq ${chunk.seq} (event: ${runtime.eventId}, type: ${card.card_type})`, { seq: chunk.seq });
    } catch (error: any) {
      this.captureLog(runtime, 'cards', 'error', `Error generating card: ${error.message}`, { seq: chunk.seq });
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
      this.captureLog(runtime, 'facts', 'warn', `No session for event ${runtime.eventId}`);
      return;
    }

    try {
      // Get condensed context (capped at 2048 tokens)
      const recentText = runtime.ringBuffer.getRecentText(20, 2048);
      const currentFacts = runtime.factsStore.getAll();

      // Note: Vector search removed - agent will use retrieve() tool when needed
      // Vector DB is available but not automatically loaded into context

      // Glossary extraction
      const glossaryTerms = this.extractGlossaryTerms(
        recentText,
        runtime.glossaryCache || new Map()
      );
      const glossaryContext = this.formatGlossaryContext(glossaryTerms);

      // Log token usage for monitoring with budget warnings
      const { getTokenBreakdown, checkBudgetStatus, formatTokenBreakdown } = await import('./utils/token-counter');
      const tokenBreakdown = getTokenBreakdown({
        recentText,
        facts: JSON.stringify(currentFacts.map((f) => ({
          key: f.key,
          value: f.value,
          confidence: f.confidence,
        }))),
        glossaryContext,
      });
      
      const budgetStatus = checkBudgetStatus(tokenBreakdown.total, 2048);
      const breakdownStr = formatTokenBreakdown(tokenBreakdown.breakdown);
      
      let logLevel: 'log' | 'warn' | 'error' = 'log';
      let logPrefix = `[context]`;
      
      if (budgetStatus.critical) {
        logLevel = 'error';
        logPrefix = `[context] ⚠️ CRITICAL`;
      } else if (budgetStatus.warning) {
        logLevel = 'warn';
        logPrefix = `[context] ⚠️ WARNING`;
      }
      
      const logMessage = `${logPrefix} Facts Agent (seq ${runtime.factsLastSeq}): ${tokenBreakdown.total}/2048 tokens (${budgetStatus.percentage}%) - ${breakdownStr}`;
      
      this.captureLog(runtime, 'facts', logLevel, logMessage, { seq: runtime.factsLastSeq });
      
      // Track metrics for periodic summary
      if (!runtime.contextMetrics) {
        runtime.contextMetrics = {
          cards: { total: 0, count: 0, max: 0, warnings: 0, criticals: 0 },
          facts: { total: 0, count: 0, max: 0, warnings: 0, criticals: 0 },
        };
      }
      
      runtime.contextMetrics.facts.total += tokenBreakdown.total;
      runtime.contextMetrics.facts.count++;
      runtime.contextMetrics.facts.max = Math.max(runtime.contextMetrics.facts.max, tokenBreakdown.total);
      if (budgetStatus.warning) runtime.contextMetrics.facts.warnings++;
      if (budgetStatus.critical) runtime.contextMetrics.facts.criticals++;

      // Send to Realtime session
      await runtime.factsSession.sendMessage(recentText, {
        recentText,
        facts: currentFacts.map((f) => ({
          key: f.key,
          value: f.value,
          confidence: f.confidence,
        })),
        glossaryContext,
      });

      // Note: In real implementation, we'd receive the response via WebSocket
      // For now, we'll use a fallback to standard API
      await this.generateFactsFallback(runtime, recentText, currentFacts, undefined, glossaryContext);

      // Update checkpoint
      await this.persistCheckpoint(runtime.eventId, 'facts', runtime.factsLastSeq);
      runtime.factsLastUpdate = Date.now();
    } catch (error: any) {
      this.captureLog(runtime, 'facts', 'error', `Error processing: ${error.message}`, { seq: runtime.factsLastSeq });
    }
  }

  /**
   * Fallback: Generate facts using standard API
   */
  private async generateFactsFallback(
    runtime: EventRuntime,
    recentText: string,
    currentFacts: Fact[],
    vectorContext?: string,
    glossaryContext?: string
  ): Promise<void> {
    const policy = FACTS_EXTRACTION_SYSTEM_PROMPT;

    const userPrompt = createFactsExtractionUserPrompt(
      recentText,
      JSON.stringify(currentFacts, null, 2),
      glossaryContext
    );

    try {
      // Some models (like o1, o1-preview, o1-mini) don't support temperature parameter
      const supportsTemperature = !this.config.genModel.startsWith('o1');
      
      // Build request options - conditionally include temperature
      const requestOptions: any = {
        model: this.config.genModel,
        messages: [
          { role: 'system', content: policy },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      };
      
      // Only add temperature if model supports it
      if (supportsTemperature) {
        requestOptions.temperature = 0.5;
      }
      
      const response = await this.config.openai.chat.completions.create(requestOptions);

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

      this.captureLog(runtime, 'facts', 'log', `Updated ${newFacts.length} facts (event: ${runtime.eventId})`, { seq: runtime.factsLastSeq });
    } catch (error: any) {
      this.captureLog(runtime, 'facts', 'error', `Error generating facts: ${error.message}`, { seq: runtime.factsLastSeq });
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

    // If already running, check if sessions exist and are active
    if (runtime.status === 'running') {
      if (runtime.cardsSession && runtime.factsSession) {
        console.log(`[orchestrator] Event ${eventId} already running with active sessions`);
        return;
      }
      // If status is running but sessions don't exist, reset status and continue
      console.log(`[orchestrator] Event ${eventId} marked as running but sessions missing, recreating...`);
      runtime.status = 'context_complete';
    }

    if (runtime.status !== 'context_complete') {
      console.warn(`[orchestrator] Event ${eventId} not ready (status: ${runtime.status})`);
      return;
    }

    // Check if sessions already exist in database
    const { data: existingSessions } = await this.config.supabase
      .from('agent_sessions')
      .select('id, agent_type, status')
      .eq('event_id', eventId)
      .eq('agent_id', agentId)
      .in('status', ['starting', 'active']);

    if (existingSessions && existingSessions.length > 0) {
      console.log(`[orchestrator] Event ${eventId} already has ${existingSessions.length} active session(s), skipping creation`);
      // Update runtime status to running if sessions exist
      runtime.status = 'running';
      await this.config.supabase
        .from('agents')
        .update({ status: 'running' })
        .eq('id', agentId);
      return;
    }

    // Create Realtime sessions with status callbacks and tool handlers
    runtime.cardsSession = new RealtimeSession(this.config.openai, {
      eventId,
      agentType: 'cards',
      model: this.config.realtimeModel,
      onStatusChange: async (status, sessionId) => {
        await this.handleSessionStatusChange(eventId, agentId, 'cards', status, sessionId);
      },
      onLog: (level, message, context) => {
        this.captureLog(runtime, 'cards', level, message, context);
      },
      supabase: this.config.supabase,
      onRetrieve: async (query: string, topK: number) => {
        return await this.handleRetrieveQuery(runtime, query, topK);
      },
      embedText: async (text: string) => {
        return await this.embedText(text);
      },
    });

    runtime.factsSession = new RealtimeSession(this.config.openai, {
      eventId,
      agentType: 'facts',
      model: this.config.realtimeModel,
      onStatusChange: async (status, sessionId) => {
        await this.handleSessionStatusChange(eventId, agentId, 'facts', status, sessionId);
      },
      onLog: (level, message, context) => {
        this.captureLog(runtime, 'facts', level, message, context);
      },
      supabase: this.config.supabase,
      onRetrieve: async (query: string, topK: number) => {
        return await this.handleRetrieveQuery(runtime, query, topK);
      },
      embedText: async (text: string) => {
        return await this.embedText(text);
      },
    });

    // Insert sessions with 'starting' status (not 'active')
    // Use upsert to handle case where sessions might already exist
    const { error: sessionsError } = await this.config.supabase.from('agent_sessions').upsert([
      {
        event_id: eventId,
        agent_id: agentId,
        provider_session_id: 'pending',
        agent_type: 'cards',
        status: 'starting',
      },
      {
        event_id: eventId,
        agent_id: agentId,
        provider_session_id: 'pending',
        agent_type: 'facts',
        status: 'starting',
      },
    ], {
      onConflict: 'event_id,agent_type',
    });

    if (sessionsError) {
      console.error(`[orchestrator] Failed to create session records: ${sessionsError.message}`);
      // Continue anyway - sessions might already exist
    }

    // Connect sessions (will update status to 'active' via callback)
    try {
      runtime.cardsSessionId = await runtime.cardsSession.connect();
      runtime.factsSessionId = await runtime.factsSession.connect();
    } catch (error: any) {
      console.error(`[orchestrator] Failed to connect sessions: ${error.message}`);
      // Status will be updated to 'error' via callback
      throw error;
    }

    // Register event handlers for responses
    runtime.cardsSession.on('card', async (card: any) => {
      await this.handleCardResponse(runtime, card);
    });

    runtime.factsSession.on('facts', async (facts: any[]) => {
      await this.handleFactsResponse(runtime, facts);
    });

    // Start periodic context summary logging (every 5 minutes)
    this.startPeriodicSummary(runtime);

    // Update status
    runtime.status = 'running';
    await this.config.supabase
      .from('agents')
      .update({ status: 'running' })
      .eq('id', agentId);

    console.log(`[orchestrator] Event ${eventId} started`);
  }

  /**
   * Load glossary for event and cache in runtime
   */
  private async loadGlossary(eventId: string): Promise<Map<string, GlossaryEntry>> {
    const { data: terms, error } = await this.config.supabase
      .from('glossary_terms')
      .select('*')
      .eq('event_id', eventId)
      .eq('is_active', true)
      .order('confidence_score', { ascending: false });

    if (error) {
      console.error(`[orchestrator] Error loading glossary: ${error.message}`);
      return new Map();
    }

    const cache = new Map<string, GlossaryEntry>();
    for (const term of terms || []) {
      cache.set(term.term.toLowerCase(), {
        term: term.term,
        definition: term.definition,
        acronym_for: term.acronym_for,
        category: term.category,
        usage_examples: term.usage_examples || [],
        related_terms: term.related_terms || [],
        confidence_score: term.confidence_score || 0.5,
      });
    }

    console.log(`[orchestrator] Loaded ${cache.size} glossary terms for event ${eventId}`);
    return cache;
  }

  /**
   * Extract relevant glossary terms from text
   * Returns up to 15 most relevant terms
   */
  private extractGlossaryTerms(
    text: string,
    glossaryCache: Map<string, GlossaryEntry>
  ): GlossaryEntry[] {
    if (!glossaryCache || glossaryCache.size === 0) {
      return [];
    }

    const lowerText = text.toLowerCase();
    const words = lowerText.split(/\W+/).filter(w => w.length > 2);
    const foundTerms = new Set<string>();
    const results: GlossaryEntry[] = [];

    // Direct matches
    for (const word of words) {
      const term = glossaryCache.get(word);
      if (term && !foundTerms.has(term.term.toLowerCase())) {
        foundTerms.add(term.term.toLowerCase());
        results.push(term);
        
        // Include related terms
        for (const related of term.related_terms || []) {
          const relatedTerm = glossaryCache.get(related.toLowerCase());
          if (relatedTerm && !foundTerms.has(relatedTerm.term.toLowerCase())) {
            foundTerms.add(relatedTerm.term.toLowerCase());
            results.push(relatedTerm);
          }
        }
      }
    }

    // Phrase matches (2-4 word phrases)
    for (let i = 0; i < words.length - 1; i++) {
      for (let len = 2; len <= Math.min(4, words.length - i); len++) {
        const phrase = words.slice(i, i + len).join(' ');
        const term = glossaryCache.get(phrase);
        if (term && !foundTerms.has(term.term.toLowerCase())) {
          foundTerms.add(term.term.toLowerCase());
          results.push(term);
        }
      }
    }

    // Sort by confidence and limit
    return results
      .sort((a, b) => (b.confidence_score || 0) - (a.confidence_score || 0))
      .slice(0, 15);
  }

  /**
   * Format glossary entries for prompt inclusion
   */
  private formatGlossaryContext(terms: GlossaryEntry[]): string {
    if (terms.length === 0) return '';

    const lines = terms.map(term => {
      let line = `- ${term.term}: ${term.definition}`;
      if (term.acronym_for) {
        line += ` (Stands for: ${term.acronym_for})`;
      }
      if (term.category) {
        line += ` [${term.category}]`;
      }
      return line;
    });

    return `Glossary Definitions:\n${lines.join('\n')}`;
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

    // Load glossary for event
    const glossaryCache = await this.loadGlossary(eventId);

    const runtime: EventRuntime = {
      eventId,
      agentId,
      status: 'context_complete',
      ringBuffer: new RingBuffer(1000, 5 * 60 * 1000), // 5 minutes
      factsStore: new FactsStore(50), // Capped at 50 items with LRU eviction
      glossaryCache,
      cardsLastSeq: cardsCheckpoint?.last_seq_processed || 0,
      factsLastSeq: factsCheckpoint?.last_seq_processed || 0,
      factsLastUpdate: Date.now(),
      contextMetrics: {
        cards: { total: 0, count: 0, max: 0, warnings: 0, criticals: 0 },
        facts: { total: 0, count: 0, max: 0, warnings: 0, criticals: 0 },
      },
      logBuffers: {
        cards: [],
        facts: [],
      },
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
   * Handle session status changes
   */
  private async handleSessionStatusChange(
    eventId: string,
    agentId: string,
    agentType: 'cards' | 'facts',
    status: 'starting' | 'active' | 'closed' | 'error',
    sessionId?: string
  ): Promise<void> {
    console.log(
      `[orchestrator] Session status: ${agentType} -> ${status} (event: ${eventId})`
    );
    // Status is already updated in database by RealtimeSession
    
    // Update aggregated session status
    const runtime = this.runtimes.get(eventId);
    if (runtime) {
      try {
        await this.updateSessionStatus(runtime);
      } catch (error: any) {
        console.error(`[orchestrator] Error updating session status after change: ${error.message}`);
      }
    }
  }

  /**
   * Handle retrieve() tool call from agent
   * Executes vector search and returns top-K chunks
   */
  private async handleRetrieveQuery(
    runtime: EventRuntime,
    query: string,
    topK: number
  ): Promise<Array<{ id: string; chunk: string; similarity: number }>> {
    try {
      console.log(`[rag] retrieve() called: query="${query}", top_k=${topK}`);

      // Embed query
      const queryEmb = await this.embedText(query);

      // Search vector database
      const results = await this.searchContext(runtime.eventId, queryEmb, Math.min(topK, 10));

      console.log(`[rag] retrieve() returned ${results.length} chunks`);
      return results;
    } catch (error: any) {
      console.error(`[rag] Error executing retrieve(): ${error.message}`);
      return [];
    }
  }

  /**
   * Handle card response from Realtime API
   */
  private async handleCardResponse(runtime: EventRuntime, card: any): Promise<void> {
    try {
      // Validate card structure
      if (!card || card === null) {
        return; // No card to emit
      }

      // Ensure required fields
      if (!card.kind || !card.title) {
        console.warn(`[cards] Invalid card structure: missing kind or title`);
        return;
      }

      // Ensure card_type is valid
      if (!card.card_type || !['text', 'text_visual', 'visual'].includes(card.card_type)) {
        // Auto-determine type (use empty string since we don't have transcript text here)
        card.card_type = this.determineCardType(card, '');
      }

      // Normalize fields based on type
      if (card.card_type === 'visual') {
        if (!card.label) card.label = card.title || 'Image';
        if (!card.body) card.body = null;
      } else if (card.card_type === 'text_visual') {
        if (!card.body) card.body = card.title || 'Definition';
      } else {
        if (!card.body) card.body = card.title || 'Definition';
        card.image_url = null;
      }

      // Store in agent_outputs
      await this.config.supabase.from('agent_outputs').insert({
        event_id: runtime.eventId,
        agent_id: runtime.agentId,
        agent_type: 'cards',
        for_seq: card.source_seq || runtime.cardsLastSeq,
        type: 'card',
        payload: card,
      });

      // Also store in legacy cards table
      await this.config.supabase.from('cards').insert({
        event_id: runtime.eventId,
        kind: card.kind || 'Context',
        payload: card,
      });

      console.log(
        `[cards] Card received from Realtime API (seq: ${card.source_seq || runtime.cardsLastSeq}, type: ${card.card_type})`
      );
    } catch (error: any) {
      console.error(`[cards] Error storing card: ${error.message}`);
    }
  }

  /**
   * Handle facts response from Realtime API
   */
  private async handleFactsResponse(runtime: EventRuntime, facts: any[]): Promise<void> {
    try {
      // Facts should already be an array from event handler
      if (!facts || facts.length === 0) {
        return; // No facts to update
      }

      // Update facts store and database
      for (const fact of facts) {
        if (!fact.key || fact.value === undefined) continue;

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
            sources: [],
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

      console.log(`[facts] ${facts.length} facts updated from Realtime API`);
    } catch (error: any) {
      console.error(`[facts] Error storing facts: ${error.message}`);
    }
  }

  /**
   * Graceful shutdown
   */
  /**
   * Start periodic context summary logging and status updates
   */
  private startPeriodicSummary(runtime: EventRuntime): void {
    // Clear existing timer if any
    if (runtime.summaryTimer) {
      clearInterval(runtime.summaryTimer);
    }

    // Update session status every 5 seconds
    if (runtime.statusUpdateTimer) {
      clearInterval(runtime.statusUpdateTimer);
    }
    
    runtime.statusUpdateTimer = setInterval(async () => {
      try {
        await this.updateSessionStatus(runtime);
      } catch (error: any) {
        console.error(`[orchestrator] Error updating session status: ${error.message}`);
      }
    }, 5000); // 5 seconds

    // Log summary every 5 minutes
    runtime.summaryTimer = setInterval(() => {
      this.logContextSummary(runtime);
    }, 5 * 60 * 1000); // 5 minutes

    // Log initial summary after 1 minute
    setTimeout(() => {
      this.logContextSummary(runtime);
    }, 60 * 1000); // 1 minute
  }

  /**
   * Log context usage summary
   */
  private logContextSummary(runtime: EventRuntime): void {
    if (!runtime.contextMetrics) {
      return;
    }

    const { cards, facts } = runtime.contextMetrics;
    const ringStats = runtime.ringBuffer.getStats();
    const factsStats = runtime.factsStore.getStats();

    console.log(`\n[context] === Summary (Event: ${runtime.eventId}) ===`);
    console.log(`[context] Cards Agent:`);
    if (cards.count > 0) {
      console.log(`[context]   - Avg tokens: ${Math.round(cards.total / cards.count)}`);
      console.log(`[context]   - Max tokens: ${cards.max}`);
      console.log(`[context]   - Warnings: ${cards.warnings} (${((cards.warnings / cards.count) * 100).toFixed(1)}%)`);
      console.log(`[context]   - Critical: ${cards.criticals} (${((cards.criticals / cards.count) * 100).toFixed(1)}%)`);
    }
    console.log(`[context] Facts Agent:`);
    if (facts.count > 0) {
      console.log(`[context]   - Avg tokens: ${Math.round(facts.total / facts.count)}`);
      console.log(`[context]   - Max tokens: ${facts.max}`);
      console.log(`[context]   - Warnings: ${facts.warnings} (${((facts.warnings / facts.count) * 100).toFixed(1)}%)`);
      console.log(`[context]   - Critical: ${facts.criticals} (${((facts.criticals / facts.count) * 100).toFixed(1)}%)`);
    }
    console.log(`[context] RingBuffer: ${ringStats.finalized} finalized chunks`);
    console.log(`[context] FactsStore: ${factsStats.capacityUsed} (${factsStats.evictions} evictions)`);
    console.log(`[context] ========================================\n`);
  }

  async shutdown(): Promise<void> {
    console.log('[orchestrator] Shutting down...');

    // Log final summaries and cleanup
    for (const [eventId, runtime] of this.runtimes.entries()) {
      // Log final summary
      this.logContextSummary(runtime);
      
      // Clear timers
      if (runtime.summaryTimer) {
        clearInterval(runtime.summaryTimer);
      }
      if (runtime.statusUpdateTimer) {
        clearInterval(runtime.statusUpdateTimer);
      }

      // Flush all checkpoints
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

