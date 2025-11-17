import type { EventRuntime, GlossaryEntry } from '../types';
import type { Fact } from '../state/facts-store';
import type { GlossaryManager } from './glossary-manager';
import { countTokens } from '../lib/text/token-counter';

type FactsRecord = Record<string, unknown>;
type FactConfidenceRecord = Record<string, { value: unknown; confidence: number }>;

export interface AgentContext {
  bullets: string[];
  facts: FactsRecord;
  glossaryContext: string;
}

export class ContextBuilder {
  constructor(private glossaryManager: GlossaryManager) {}

  buildCardsContext(runtime: EventRuntime, currentChunkText: string): AgentContext {
    const bullets = runtime.ringBuffer.getContextBullets(10, 2048);
    const facts = this.normalizeFactsRecord(runtime.factsStore.getContextFormat());
    const combinedText = `${currentChunkText} ${bullets.join(' ')}`;
    const glossaryTerms = this.glossaryManager.extractRelevantTerms(
      combinedText,
      runtime.glossaryCache ?? new Map<string, GlossaryEntry>()
    );
    const glossaryContext = this.glossaryManager.formatGlossaryContext(glossaryTerms);

    return {
      bullets,
      facts,
      glossaryContext,
    };
  }

  buildFactsContext(runtime: EventRuntime): {
    context: AgentContext;
    recentText: string;
  } {
    const recentText = runtime.ringBuffer.getRecentText(20, 2048);
    const currentFacts = runtime
      .factsStore
      .getAll()
      .filter((fact) => !fact.excludeFromPrompt);
    const glossaryTerms = this.glossaryManager.extractRelevantTerms(
      recentText,
      runtime.glossaryCache ?? new Map<string, GlossaryEntry>()
    );
    const glossaryContext = this.glossaryManager.formatGlossaryContext(glossaryTerms);

    const factsRecord = this.buildFactConfidenceRecord(currentFacts);

    return {
      context: {
        bullets: [],
        facts: factsRecord,
        glossaryContext,
      },
      recentText,
    };
  }

  getCardsTokenBreakdown(context: AgentContext, currentChunk: string): {
    total: number;
    breakdown: Record<string, number>;
  } {
    const breakdown: Record<string, number> = {};
    const ringBufferTokens = countTokens(context.bullets.join('\n'));
    const factsTokens = countTokens(JSON.stringify(context.facts));
    const glossaryTokens = countTokens(context.glossaryContext);
    const currentChunkTokens = countTokens(currentChunk);

    breakdown.ringBuffer = ringBufferTokens;
    breakdown.facts = factsTokens;
    breakdown.glossary = glossaryTokens;
    breakdown.currentChunk = currentChunkTokens;

    return {
      total: ringBufferTokens + factsTokens + glossaryTokens + currentChunkTokens,
      breakdown,
    };
  }

  getFactsTokenBreakdown(context: AgentContext, recentText: string): {
    total: number;
    breakdown: Record<string, number>;
  } {
    const breakdown: Record<string, number> = {};
    const recentTextTokens = countTokens(recentText);
    const factsTokens = countTokens(JSON.stringify(context.facts));
    const glossaryTokens = countTokens(context.glossaryContext);

    breakdown.recentText = recentTextTokens;
    breakdown.facts = factsTokens;
    breakdown.glossary = glossaryTokens;

    return {
      total: recentTextTokens + factsTokens + glossaryTokens,
      breakdown,
    };
  }

  private normalizeFactsRecord(source: Record<string, unknown>): FactsRecord {
    if (!source) {
      return {};
    }

    return Object.entries(source).reduce<FactsRecord>((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
  }

  private buildFactConfidenceRecord(facts: Fact[]): FactConfidenceRecord {
    return facts.reduce<FactConfidenceRecord>((acc, fact) => {
      const factValue: unknown = fact.value;
      acc[fact.key] = {
        value: factValue,
        confidence: fact.confidence,
      };
      return acc;
    }, {});
  }
}
