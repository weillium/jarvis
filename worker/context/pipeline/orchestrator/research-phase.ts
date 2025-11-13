const MIN_WIKIPEDIA_INTERVAL_MS = 300;
const WIKIPEDIA_MAX_RETRIES = 3;
const WIKIPEDIA_INITIAL_BACKOFF_MS = 500;
let lastWikipediaCall = 0;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));
import { Exa } from 'exa-js';
import type { Blueprint } from '../blueprint/types';
import type { ResearchResults } from '../glossary/types';
import { getPricingVersion } from '../../../lib/pricing';
import type { ResearchResultInsert } from '../../../types';
import { chunkTextContent } from '../../../lib/text/llm-prompt-chunking';
import {
  insertResearchResultRow,
  type WorkerSupabaseClient,
} from './supabase-orchestrator';
import {
  calculateWikipediaQualityScore,
  executeExaSearch,
  pollResearchTasks,
  type PendingResearchTask,
} from './exa-orchestrator';
import { generateStubResearchChunks } from './llm-orchestrator';
import type { GenerationContext, PhaseOptions } from './phase-context';
import type { StatusManager } from './status-manager';

type BlueprintResearchQuery = Blueprint['research_plan']['queries'][number];

type OpenAIChatCompletionCost = {
  cost: number;
  usage: {
    prompt_tokens: number;
    completion_tokens?: number;
    total_tokens: number;
  };
  model: string;
};

const EXA_SCHEMA_VALIDATION_SIGNATURES = [
  'unable to validate json schema',
  'schema validation failed',
  'json schema validation failed',
];

export class ExaSchemaValidationError extends Error {
  constructor(readonly detail: string) {
    super('Exa schema validation failure');
    this.name = 'ExaSchemaValidationError';
  }
}

export function isExaSchemaValidationFailure(errorText: string): boolean {
  const normalized = errorText.toLowerCase();
  return EXA_SCHEMA_VALIDATION_SIGNATURES.some((signature) =>
    normalized.includes(signature)
  );
}

export interface ResearchPhaseOptions extends PhaseOptions {
  statusManager: StatusManager;
}

export async function runResearchPhase(
  context: GenerationContext,
  blueprint: Blueprint,
  generationCycleId: string,
  options: ResearchPhaseOptions
): Promise<ResearchResults> {
  const { supabase, openai, genModel, stubResearchModel, exaApiKey, statusManager } = options;
  const queries: BlueprintResearchQuery[] = blueprint.research_plan.queries ?? [];

  console.log(`[research] ========================================`);
  console.log(`[research] Starting research plan execution`);
  console.log(`[research] Total queries: ${queries.length}`);
  console.log(
    `[research] Event ID: ${context.eventId}, Blueprint ID: ${context.blueprintId}, Cycle ID: ${generationCycleId}`
  );
  console.log(`[research] ========================================`);

  const chunks: ResearchResults['chunks'] = [];
  const insertedCount = { value: 0 };
  const pendingResearchTasks: PendingResearchTask[] = [];

  const costBreakdown = {
    openai: {
      total: 0,
      chat_completions: [] as OpenAIChatCompletionCost[],
    },
    exa: {
      total: 0,
      search: { cost: 0, queries: 0 },
      research: { cost: 0, queries: 0, usage: { searches: 0, pages: 0, tokens: 0 } },
      answer: { cost: 0, queries: 0 },
    },
  };

  const exa = exaApiKey ? new Exa(exaApiKey) : null;
  if (!exa && queries.some((q) => q.api === 'exa')) {
    console.warn(
      `[research] ⚠️  Exa API key not provided, but ${
        queries.filter((q) => q.api === 'exa').length
      } Exa queries found. Falling back to LLM stub.`
    );
  }

  const exaQueries = queries.filter((q) => q.api === 'exa').length;
  const wikipediaQueries = queries.filter((q) => q.api === 'wikipedia').length;
  console.log(`[research] Query breakdown: ${exaQueries} Exa queries, ${wikipediaQueries} Wikipedia queries`);

  await statusManager.updateCycle(generationCycleId, {
    status: 'processing',
    progress_total: queries.length,
  });

  for (let i = 0; i < queries.length; i++) {
    const queryItem = queries[i];
    const queryNumber = i + 1;
    const queryProgress = `[${queryNumber}/${queries.length}]`;

    const agentUtilityTargets =
      Array.isArray(queryItem.agent_utility) && queryItem.agent_utility.length > 0
        ? queryItem.agent_utility
        : [];
    const provenanceHint =
      typeof queryItem.provenance_hint === 'string' && queryItem.provenance_hint.trim().length > 0
        ? queryItem.provenance_hint
        : null;

    console.log(
      `[research] ${queryProgress} Starting query: "${queryItem.query}" (API: ${queryItem.api}, Priority: ${queryItem.priority})`
    );

    const runWikipediaFlow = async () => {
      console.log(`[research] ${queryProgress} Executing Wikipedia API request for: ${queryItem.query}`);
      const startTime = Date.now();

      try {
        const wikipediaChunks = await executeWikipediaSearch(
          queryItem,
          supabase,
          context.eventId,
          context.blueprintId,
          generationCycleId
        );

        const duration = Date.now() - startTime;

        for (const chunk of wikipediaChunks) {
          insertedCount.value++;
          chunks.push(chunk);
        }

        console.log(
          `[research] ${queryProgress} ✓ Wikipedia API success: ${wikipediaChunks.length} chunks created in ${duration}ms for query: "${queryItem.query}"`
        );
      } catch (err: unknown) {
        console.error('[orchestrator] error:', String(err));
      }

      await statusManager.updateCycle(generationCycleId, {
        progress_current: queryNumber,
      });

      console.log(
        `[research] ${queryProgress} Query processing complete. Total chunks so far: ${insertedCount.value}`
      );
    };

    try {
      const priorityLevel =
        typeof queryItem.priority === 'number' && Number.isFinite(queryItem.priority)
          ? queryItem.priority
          : 5;

      if (priorityLevel === 1) {
        console.log(
          `[research] ${queryProgress} Priority 1 query detected – enforcing Exa /research for "${queryItem.query}"`
        );

        if (!exa) {
          console.warn(
            `[research] ${queryProgress} Exa API key not available - using LLM stub fallback for priority 1 query: "${queryItem.query}"`
          );
          const startTime = Date.now();

          try {
            const fallbackModel = stubResearchModel ?? genModel;
            const stubChunks = await generateStubResearchChunks(
              queryItem.query,
              openai,
              fallbackModel,
              costBreakdown
            );
            const duration = Date.now() - startTime;
            console.log(
              `[research] ${queryProgress} LLM stub generated ${stubChunks.length} chunks in ${duration}ms for query: "${queryItem.query}"`
            );

            for (const chunkText of stubChunks) {
              insertedCount.value++;
              chunks.push({
                text: chunkText,
                source: 'llm_stub',
                metadata: {
                  api: 'exa_stub',
                  query: queryItem.query,
                  priority: queryItem.priority,
                  query_priority: queryItem.priority,
                  agent_utility: agentUtilityTargets,
                  provenance_hint: provenanceHint,
                },
              });
            }
          } catch (err: unknown) {
            const errString = String(err);
            console.error('[orchestrator] error:', errString);
            if (isExaSchemaValidationFailure(errString)) {
              console.error(
                `[research] ${queryProgress} Exa schema validation failed. Per Exa Research FAQ, schema validation failure terminates the task. Adjust the output schema to remove unsupported keywords. Details: ${errString}`
              );
              throw new ExaSchemaValidationError(errString);
            }
          }

          await statusManager.updateCycle(generationCycleId, {
            progress_current: queryNumber,
          });

          console.log(
            `[research] ${queryProgress} Query processing complete. Total chunks so far: ${insertedCount.value}`
          );
          continue;
        }

        console.log(
          `[research] ${queryProgress} Using Exa /research endpoint for top-priority query: "${queryItem.query}"`
        );
        const startTime = Date.now();

        try {
          const outputSchema = {
            type: 'object',
            required: ['summary', 'keyPoints', 'sources'],
            properties: {
              summary: {
                type: 'string',
                description: 'A 400-600 word synthesis that references citations using bracketed IDs (e.g. [1])',
              },
              keyPoints: {
                type: 'array',
                maxItems: 8,
                minItems: 5,
                description:
                  'High-signal insights with citation references and confidence ratings to guide downstream generation',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['title', 'insight', 'citationId', 'confidence'],
                  properties: {
                    title: {
                      type: 'string',
                      description: 'Short label for the key point (<=8 words)',
                    },
                    insight: {
                      type: 'string',
                      description: 'One-sentence articulation of the key takeaway including a citation (e.g. "[2]")',
                    },
                    citationId: {
                      type: 'integer',
                      description: 'ID of the supporting source from the sources array',
                    },
                    confidence: {
                      type: 'string',
                      enum: ['high', 'medium', 'low'],
                      description:
                        'Confidence in the insight based on source quality and corroboration (enum required by Exa best practices)',
                    },
                  },
                },
              },
              sources: {
                type: 'array',
                maxItems: 6,
                description:
                  'Unique, authoritative sources sorted by relevance with metadata for downstream citation rendering',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['id', 'title', 'url'],
                  properties: {
                    id: {
                      type: 'integer',
                      description: 'Stable identifier used in citations (starts at 1)',
                    },
                    title: {
                      type: 'string',
                      description: 'Article or publication title',
                    },
                    url: {
                      type: 'string',
                      pattern: '^https?://.+$',
                      description: 'Resolvable HTTPS URL',
                    },
                    publisher: {
                      type: 'string',
                      description: 'Publisher or organization name',
                    },
                    publishedDate: {
                      type: 'string',
                      description: 'ISO-8601 date string when available',
                    },
                  },
                },
              },
            },
            additionalProperties: false,
          };

          const instructions = `Research the topic: "${queryItem.query}"

OBJECTIVE:
- Produce authoritative context to brief downstream AI systems on this topic.

RESEARCH GUARDRAILS:
- Issue no more than 4 high-signal searches; avoid redundant or broad keyword sweeps.
- Prioritize 2023+ primary sources (official docs, standards bodies, leading analysts, tier-1 reporting).
- Stop deep crawling once you have 5-6 distinct, credible sources; decline low-quality or speculative content.

OUTPUT EXPECTATIONS:
- Write a 400-600 word synthesis that references sources inline using bracketed IDs (e.g. [1]).
- Surface 5-8 key points; each should be a single sentence, include a citation reference, and specify a confidence level (high | medium | low).
- Return the sources array ordered by descending relevance with stable IDs starting at 1.

TONE & SCOPE:
- Keep the tone analytical and practical.
- Focus on actionable insights, industry standards, and current developments (2024-2025 emphasis).
- Call out major uncertainties or gaps explicitly when encountered.`;

          const research = await exa.research.create({
            model: 'exa-research',
            instructions,
            outputSchema,
          });

          console.log(
            `[research] ${queryProgress} ✓ Exa research task created: ${research.researchId}, status: ${research.status}. Will poll in background.`
          );
          console.log(
            `[research] ${queryProgress} Note: Research uses variable pricing ($5/1k searches, $5/1k pages, $5/1M reasoning tokens). OutputSchema helps constrain scope.`
          );

          pendingResearchTasks.push({
            researchId: research.researchId,
            queryItem,
            queryNumber,
            queryProgress,
            createdAt: Date.now(),
            startTime,
          });

          await statusManager.updateCycle(generationCycleId, {
            progress_current: queryNumber,
          });

          console.log(
            `[research] ${queryProgress} Moving on to next query while research task runs in background...`
          );
          continue;
        } catch (err: unknown) {
          console.error('[orchestrator] error:', String(err));
        }
      } else if (priorityLevel === 2) {
        const shouldUseWikipedia = queryItem.api === 'wikipedia' || !exa;

        if (shouldUseWikipedia && queryItem.api !== 'wikipedia') {
          console.log(
            `[research] ${queryProgress} Overriding requested API to Wikipedia for priority 2 query: "${queryItem.query}"`
          );
        }

        if (shouldUseWikipedia) {
          await runWikipediaFlow();
          continue;
        }

        console.log(
          `[research] ${queryProgress} Using Exa /search endpoint for priority 2 query: "${queryItem.query}"`
        );
        const startTime = Date.now();

        try {
          await executeExaSearch(
            queryItem,
            exa,
            supabase,
            context.eventId,
            context.blueprintId,
            generationCycleId,
            chunks,
            insertedCount,
            costBreakdown
          );
          const duration = Date.now() - startTime;
          console.log(
            `[research] ${queryProgress} ✓ Exa /search completed in ${duration}ms for query: "${queryItem.query}"`
          );
        } catch (err: unknown) {
          console.error('[orchestrator] error:', String(err));
        }

        await statusManager.updateCycle(generationCycleId, {
          progress_current: queryNumber,
        });

        console.log(
          `[research] ${queryProgress} Query processing complete. Total chunks so far: ${insertedCount.value}`
        );
        continue;
      } else {
        if (queryItem.api !== 'wikipedia') {
          console.log(
            `[research] ${queryProgress} Priority ${queryItem.priority} query defaulting to Wikipedia: "${queryItem.query}"`
          );
        }

        await runWikipediaFlow();
        continue;
      }
    } catch (err: unknown) {
      const errString = String(err);
      console.error('[orchestrator] error:', errString);
      if (err instanceof ExaSchemaValidationError) {
        throw err;
      }
    }
  }

  if (pendingResearchTasks.length > 0 && exa) {
    console.log(`[research] ========================================`);
    console.log(`[research] Starting background polling for ${pendingResearchTasks.length} research task(s)...`);
    console.log(`[research] ========================================`);

    await pollResearchTasks(
      exa,
      pendingResearchTasks,
      supabase,
      context.eventId,
      context.blueprintId,
      generationCycleId,
      chunks,
      insertedCount,
      costBreakdown
    );
  }

  const totalCost = costBreakdown.openai.total + costBreakdown.exa.total;

  console.log(`[research] ========================================`);
  console.log(`[research] Research plan execution COMPLETE`);
  console.log(
    `[research] Total cost: $${totalCost.toFixed(4)} (OpenAI: $${costBreakdown.openai.total.toFixed(
      4
    )}, Exa: $${costBreakdown.exa.total.toFixed(4)})`
  );

  const costMetadata = {
    cost: {
      total: totalCost,
      currency: 'USD',
      breakdown: {
        openai: {
          total: costBreakdown.openai.total,
          chat_completions: costBreakdown.openai.chat_completions,
        },
        exa: {
          total: costBreakdown.exa.total,
          search: costBreakdown.exa.search,
          research: costBreakdown.exa.research,
          answer: costBreakdown.exa.answer,
        },
      },
      tracked_at: new Date().toISOString(),
      pricing_version: getPricingVersion(),
    },
  };

  await statusManager.updateCycle(generationCycleId, {
    status: 'completed',
    progress_current: queries.length,
    metadata: costMetadata,
  });

  console.log(`[research] ========================================`);
  console.log(`[research] Total queries processed: ${queries.length}`);
  console.log(`[research] Total chunks created: ${insertedCount.value}`);
  console.log(`[research] Results stored in database: ${insertedCount.value}`);
  console.log(`[research] ========================================`);

  return { chunks };
}

async function executeWikipediaSearch(
  queryItem: BlueprintResearchQuery,
  supabase: WorkerSupabaseClient,
  eventId: string,
  blueprintId: string,
  generationCycleId: string
): Promise<ResearchResults['chunks']> {
  const chunks: ResearchResults['chunks'] = [];
  const startTime = Date.now();

  const query = queryItem.query;
  const agentUtilityTargets =
    Array.isArray(queryItem.agent_utility) && queryItem.agent_utility.length > 0
      ? queryItem.agent_utility
      : [];
  const provenanceHint =
    typeof queryItem.provenance_hint === 'string' && queryItem.provenance_hint.trim().length > 0
      ? queryItem.provenance_hint
      : null;

  try {
    console.log(`[research] Wikipedia: Searching for articles matching "${query}"...`);
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      query
    )}&srlimit=5&format=json&origin=*`;

    const searchResponse = await fetchWithWikipediaLimits(searchUrl);
    if (!searchResponse.ok) {
      const errorText = await searchResponse.text().catch(() => 'Unable to read response');
      throw new Error(
        `Wikipedia search API returned ${searchResponse.status}: ${errorText.substring(0, 200)}`
      );
    }

    const searchData = (await searchResponse.json()) as {
      query?: {
        search?: Array<{
          title: string;
          pageid: number;
          snippet: string;
        }>;
      };
    };
    const searchResults = searchData.query?.search || [];
    const searchDuration = Date.now() - startTime;

    if (searchResults.length === 0) {
      console.warn(`[research] Wikipedia: No articles found for query "${query}" (duration: ${searchDuration}ms)`);
      return chunks;
    }

    console.log(
      `[research] Wikipedia: Found ${searchResults.length} articles in ${searchDuration}ms for query: "${query}"`
    );

    let processedArticles = 0;
    let skippedArticles = 0;

    for (const result of searchResults) {
      const articleStartTime = Date.now();
      try {
        const pageTitle = encodeURIComponent(result.title.replace(/ /g, '_'));
        const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${pageTitle}`;

        const summaryResponse = await fetchWithWikipediaLimits(summaryUrl);

        if (!summaryResponse.ok) {
          const errorText = await summaryResponse.text().catch(() => 'Unable to read response');
          console.warn(
            `[research] Wikipedia: Failed to fetch summary for "${result.title}" (status: ${
              summaryResponse.status
            }): ${errorText.substring(0, 100)}`
          );
          skippedArticles++;
          continue;
        }

        const summaryData = (await summaryResponse.json()) as {
          extract?: string;
          extract_html?: string;
          title?: string;
          content_urls?: {
            desktop?: {
              page?: string;
            };
          };
          thumbnail?: {
            source?: string;
          };
          coordinates?: {
            lat?: number;
            lon?: number;
          };
        };

        let content = summaryData.extract || '';
        if (summaryData.extract_html) {
          content = summaryData.extract_html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        }

        if (!content || content.length < 50) {
          console.warn(
            `[research] Wikipedia: Article "${result.title}" has insufficient content (${content?.length || 0} chars)`
          );
          skippedArticles++;
          continue;
        }

        const articleDuration = Date.now() - articleStartTime;
        processedArticles++;

        const textChunks = chunkTextContent(content, 200, 400);

        for (const chunkText of textChunks) {
          const qualityScore = calculateWikipediaQualityScore(summaryData, chunkText);
          const sourceUrl =
            summaryData.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${pageTitle}`;
          const metadata: ResearchResultInsert['metadata'] = {
            api: 'wikipedia',
            query,
            title: result.title,
            url: sourceUrl,
            page_id: result.pageid,
            quality_score: qualityScore,
            query_priority: queryItem.priority,
            priority: queryItem.priority,
            provenance_hint: provenanceHint,
            agent_utility: agentUtilityTargets,
          };

          const insertResult = await insertResearchResultRow(supabase, {
            event_id: eventId,
            blueprint_id: blueprintId,
            generation_cycle_id: generationCycleId,
            query,
            api: 'wikipedia',
            content: chunkText,
            source_url: sourceUrl,
            quality_score: qualityScore,
            metadata,
          });

          if (!insertResult.success) {
            console.error(
              `[research] Wikipedia: Database error storing result for article "${result.title}": ${insertResult.message}`
            );
            continue;
          }

          chunks.push({
            text: chunkText,
            source: 'wikipedia',
            metadata,
          });
        }

        console.log(
          `[research] Wikipedia: Processed article "${result.title}" - ${textChunks.length} chunks created in ${articleDuration}ms`
        );
      } catch (err: unknown) {
        console.error('[orchestrator] error:', String(err));
      }
    }

    const totalDuration = Date.now() - startTime;
    console.log(
      `[research] Wikipedia: Completed query "${query}" - ${processedArticles}/${searchResults.length} articles processed (${skippedArticles} skipped), ${chunks.length} chunks created in ${totalDuration}ms`
    );
  } catch (err: unknown) {
    console.error('[orchestrator] error:', String(err));
  }

  return chunks;
}

async function fetchWithWikipediaLimits(url: string): Promise<Response> {
  await enforceWikipediaInterval();

  let attempt = 0;
  let delay = WIKIPEDIA_INITIAL_BACKOFF_MS;

  while (true) {
    attempt += 1;
    const response = await fetch(url);
    lastWikipediaCall = Date.now();

    if (response.status !== 429 || attempt >= WIKIPEDIA_MAX_RETRIES) {
      return response;
    }

    console.warn(`[research] Wikipedia returned 429 for ${url}. Retrying in ${delay}ms (attempt ${attempt}/${WIKIPEDIA_MAX_RETRIES})`);
    await sleep(delay);
    delay *= 2;
  }
}

async function enforceWikipediaInterval(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastWikipediaCall;

  if (elapsed < MIN_WIKIPEDIA_INTERVAL_MS) {
    await sleep(MIN_WIKIPEDIA_INTERVAL_MS - elapsed);
  }
}

