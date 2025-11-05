/**
 * Context Builder - Creates topic-specific context database using standard LLM
 * This runs during the "prepping" phase before an event starts
 * 
 * Now includes external enrichment framework for rich vector database
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { EnrichmentOrchestrator, getEnrichmentConfig } from './enrichment';
import {
  TOPIC_CONTEXT_SYSTEM_PROMPT,
  createTopicContextUserPrompt,
} from './prompts';

export interface ContextBuilderOptions {
  supabase: ReturnType<typeof createClient>;
  openai: OpenAI;
  embedModel: string;
  genModel: string;
}

export async function buildTopicContext(
  eventId: string,
  eventTitle: string,
  eventTopic: string | null,
  options: ContextBuilderOptions
): Promise<void> {
  const { supabase, openai, embedModel, genModel } = options;

  console.log(`[context] Building topic-specific context for event: ${eventId}`);
  console.log(`[context] Title: ${eventTitle}, Topic: ${eventTopic || 'N/A'}`);

  // 1. Generate topic-specific context using standard LLM
  const topicContext = await generateTopicContext(eventTitle, eventTopic, openai, genModel);
  
  // 2. Store LLM-generated context chunks
  let llmInsertedCount = 0;
  for (const chunk of topicContext) {
    try {
      // Create embedding
      const embeddingRes = await openai.embeddings.create({
        model: embedModel,
        input: chunk,
      });
      const embedding = embeddingRes.data[0].embedding;

      // Store in database
      const { error } = await (supabase
        .from('context_items') as any).insert({
          event_id: eventId,
          source: 'topic_prep',
          chunk,
          embedding,
          enrichment_source: 'llm_generation',
          chunk_size: chunk.length,
          enrichment_timestamp: new Date().toISOString(),
        });

      if (error) {
        console.error(`[context] Error inserting LLM chunk: ${error.message}`);
      } else {
        llmInsertedCount++;
      }
    } catch (error: any) {
      console.error(`[context] Error processing LLM chunk: ${error.message}`);
    }
  }

  console.log(`[context] Stored ${llmInsertedCount} LLM-generated chunks`);

  // 3. Enrich with external services (web search, documents, etc.)
  const enrichmentConfig = getEnrichmentConfig();
  let enrichedCount = 0;

  if (enrichmentConfig.enabled.length > 0) {
    console.log(`[context] Starting external enrichment with ${enrichmentConfig.enabled.length} enricher(s)`);
    const orchestrator = new EnrichmentOrchestrator(
      enrichmentConfig,
      supabase,
      openai,
      embedModel
    );
    
    try {
      enrichedCount = await orchestrator.enrich(eventId, eventTitle, eventTopic);
      console.log(`[context] Enriched with ${enrichedCount} external chunks`);
    } catch (error: any) {
      console.error(`[context] Error during enrichment: ${error.message}`);
      // Continue even if enrichment fails - LLM context is still available
    }
  } else {
    console.log(`[context] No enrichment enrichers enabled, skipping external enrichment`);
  }

  const totalChunks = llmInsertedCount + enrichedCount;
  console.log(`[context] Built context for event ${eventId}: ${totalChunks} total chunks (${llmInsertedCount} LLM + ${enrichedCount} enriched)`);
}

/**
 * Generate topic-specific context using standard LLM
 * Creates a comprehensive knowledge base about the event topic
 */
async function generateTopicContext(
  eventTitle: string,
  eventTopic: string | null,
  openai: OpenAI,
  genModel: string
): Promise<string[]> {
  const topic = eventTopic || eventTitle;

  const systemPrompt = TOPIC_CONTEXT_SYSTEM_PROMPT;
  const userPrompt = createTopicContextUserPrompt(topic, eventTitle);

  try {
    const response = await openai.chat.completions.create({
      model: genModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from LLM');
    }

    const parsed = JSON.parse(content);
    const chunks = parsed.chunks || [];

    if (!Array.isArray(chunks) || chunks.length === 0) {
      console.warn('[context] LLM returned invalid format, generating fallback chunks');
      return generateFallbackChunks(topic, eventTitle);
    }

    console.log(`[context] Generated ${chunks.length} context chunks from LLM`);
    return chunks;
  } catch (error: any) {
    console.error(`[context] Error generating topic context: ${error.message}`);
    console.log('[context] Falling back to basic context chunks');
    return generateFallbackChunks(topic, eventTitle);
  }
}

/**
 * Generate fallback context chunks if LLM generation fails
 */
function generateFallbackChunks(topic: string, eventTitle: string): string[] {
  return [
    `Event Topic: ${topic}. Event Title: ${eventTitle}. This event will discuss topics related to ${topic}.`,
    `Key concepts related to ${topic} will be explored during this event. Participants should be prepared to discuss relevant aspects.`,
    `The event "${eventTitle}" focuses on ${topic}. Important context and background information will be shared during the discussion.`,
  ];
}
