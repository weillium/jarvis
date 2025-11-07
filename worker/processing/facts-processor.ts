import { EventRuntime, Fact } from '../types';
import { ContextBuilder } from '../context/context-builder';
import { OpenAIService } from '../services/openai-service';
import { Logger } from '../monitoring/logger';
import { MetricsCollector } from '../monitoring/metrics-collector';
import { CheckpointManager } from '../monitoring/checkpoint-manager';
import { RealtimeSession } from '../sessions/realtime-session';
import { FACTS_EXTRACTION_SYSTEM_PROMPT, createFactsExtractionUserPrompt } from '../prompts';
import { checkBudgetStatus, formatTokenBreakdown } from '../utils/token-counter';
import { FactsRepository } from '../services/supabase/facts-repository';
import { AgentOutputsRepository } from '../services/supabase/agent-outputs-repository';

export class FactsProcessor {
  constructor(
    private contextBuilder: ContextBuilder,
    private readonly factsRepository: FactsRepository,
    private readonly agentOutputs: AgentOutputsRepository,
    private openai: OpenAIService,
    private logger: Logger,
    private metrics: MetricsCollector,
    private checkpointManager: CheckpointManager
  ) {}

  async process(
    runtime: EventRuntime,
    session: RealtimeSession | undefined,
    sessionId: string | undefined
  ): Promise<void> {
    if (!session || !sessionId) {
      this.logger.log(runtime.eventId, 'facts', 'warn', `No session for event ${runtime.eventId}`);
      return;
    }

    try {
      const { context, recentText } = this.contextBuilder.buildFactsContext(runtime);
      const tokenBreakdown = this.contextBuilder.getFactsTokenBreakdown(context, recentText);
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
      this.logger.log(runtime.eventId, 'facts', logLevel, logMessage, { seq: runtime.factsLastSeq });

      this.metrics.recordTokens(
        runtime.eventId,
        'facts',
        tokenBreakdown.total,
        budgetStatus.warning,
        budgetStatus.critical
      );

      const currentFacts = runtime.factsStore.getAll();
      await session.sendMessage(recentText, {
        recentText,
        facts: currentFacts,
        glossaryContext: context.glossaryContext,
      });

      await this.generateFactsFallback(runtime, recentText, currentFacts, context.glossaryContext);

      await this.checkpointManager.saveCheckpoint(
        runtime.eventId,
        'facts',
        runtime.factsLastSeq
      );
      runtime.factsLastUpdate = Date.now();
    } catch (error: any) {
      this.logger.log(runtime.eventId, 'facts', 'error', `Error processing: ${error.message}`, { seq: runtime.factsLastSeq });
    }
  }

  private async generateFactsFallback(
    runtime: EventRuntime,
    recentText: string,
    currentFacts: Fact[],
    glossaryContext?: string
  ): Promise<void> {
    const policy = FACTS_EXTRACTION_SYSTEM_PROMPT;

    const userPrompt = createFactsExtractionUserPrompt(
      recentText,
      JSON.stringify(currentFacts, null, 2),
      glossaryContext
    );

    try {
      const response = await this.openai.createChatCompletion(
        [
          { role: 'system', content: policy },
          { role: 'user', content: userPrompt },
        ],
        {
          responseFormat: { type: 'json_object' },
          temperature: 0.5,
        }
      );

      const factsJson = response.choices[0]?.message?.content;
      if (!factsJson) return;

      const parsed = JSON.parse(factsJson);
      const newFacts = parsed.facts || [];

      const evictedKeys: string[] = [];
      
      for (const fact of newFacts) {
        if (!fact.key || !fact.value) continue;

        const initialConfidence = fact.confidence || 0.7;
        const keysEvicted = runtime.factsStore.upsert(
          fact.key,
          fact.value,
          initialConfidence,
          runtime.factsLastSeq,
          undefined
        );
        
        // Accumulate evicted keys to mark as inactive later
        if (keysEvicted.length > 0) {
          evictedKeys.push(...keysEvicted);
        }

        // Get the computed confidence from FactsStore (may have been adjusted)
        const storedFact = runtime.factsStore.get(fact.key);
        const computedConfidence = storedFact?.confidence ?? initialConfidence;

        await this.factsRepository.upsertFact({
          event_id: runtime.eventId,
          fact_key: fact.key,
          fact_value: fact.value,
          confidence: computedConfidence,
          last_seen_seq: runtime.factsLastSeq,
          sources: storedFact?.sources || [],
        });

        await this.agentOutputs.insertAgentOutput({
          event_id: runtime.eventId,
          agent_id: runtime.agentId,
          agent_type: 'facts',
          for_seq: runtime.factsLastSeq,
          type: 'fact_update',
          payload: fact,
        });
      }

      // Mark evicted facts as inactive in database
      if (evictedKeys.length > 0) {
        await this.factsRepository.updateFactActiveStatus(runtime.eventId, evictedKeys, false);
        console.log(`[facts-processor] Marked ${evictedKeys.length} evicted facts as inactive for event ${runtime.eventId}`);
      }

      this.logger.log(
        runtime.eventId,
        'facts',
        'log',
        `Updated ${newFacts.length} facts (event: ${runtime.eventId})`,
        { seq: runtime.factsLastSeq }
      );
    } catch (error: any) {
      this.logger.log(runtime.eventId, 'facts', 'error', `Error generating facts: ${error.message}`, { seq: runtime.factsLastSeq });
    }
  }
}
