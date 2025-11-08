import { Exa } from 'exa-js';
import type { Blueprint } from '../blueprint/types';
import type { ResearchResults } from '../glossary/types';
import { getPricingVersion } from '../pricing-config';
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

type OpenAIChatCompletionCost = {
  cost: number;
  usage: {
    prompt_tokens: number;
    completion_tokens?: number;
    total_tokens: number;
  };
  model: string;
};

export interface ResearchPhaseOptions extends PhaseOptions {
  statusManager: StatusManager;
}

export async function runResearchPhase(
  context: GenerationContext,
  blueprint: Blueprint,
  generationCycleId: string,
  options: ResearchPhaseOptions
): Promise<ResearchResults> {
  const { supabase, openai, genModel, exaApiKey, statusManager } = options;
  const queries: Blueprint['research_plan']['queries'] =
    blueprint.research_plan.queries ?? [];

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

    console.log(
      `[research] ${queryProgress} Starting query: "${queryItem.query}" (API: ${queryItem.api}, Priority: ${queryItem.priority})`
    );

    try {
      if (queryItem.api === 'wikipedia') {
        console.log(`[research] ${queryProgress} Executing Wikipedia API request for: ${queryItem.query}`);
        const startTime = Date.now();

        try {
          const wikipediaChunks = await executeWikipediaSearch(
            queryItem.query,
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
        continue;
      } else if (queryItem.api === 'exa') {
        if (!exa) {
          console.warn(
            `[research] ${queryProgress} Exa API key not available - using LLM stub fallback for query: "${queryItem.query}"`
          );
          const startTime = Date.now();

          try {
            const stubChunks = await generateStubResearchChunks(queryItem.query, openai, genModel, costBreakdown);
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
                },
              });
            }
          } catch (err: unknown) {
            console.error('[orchestrator] error:', String(err));
          }
        } else if (queryItem.priority <= 2) {
          console.log(
            `[research] ${queryProgress} Using Exa /research endpoint for high-priority query (priority ${queryItem.priority}): "${queryItem.query}"`
          );
          const startTime = Date.now();

          try {
            const outputSchema = {
              type: 'object',
              required: ['summary', 'keyPoints'],
              properties: {
                summary: {
                  type: 'string',
                  description: 'A comprehensive summary (500-1000 words) covering the main topic',
                },
                keyPoints: {
                  type: 'array',
                  items: { type: 'string' },
                  maxItems: 10,
                  description: 'Key insights, developments, or findings (1-2 sentences each)',
                },
              },
              additionalProperties: false,
            };

            const instructions = `Research the topic: "${queryItem.query}"

OBJECTIVE: Provide a structured summary with key points suitable for AI context building.

WHAT TO FIND:
- Latest developments and current state (2023-2025 focus)
- Industry standards and best practices
- Key insights and practical applications
- Relevant technical details and methodologies

HOW TO RESEARCH:
- Use 3-5 targeted searches to find authoritative sources
- Focus on recent, high-quality publications and official documentation
- Prioritize comprehensive overview sources over narrow niche articles

HOW TO COMPOSE:
- Write a concise summary (500-1000 words) synthesizing findings
- Extract 8-10 key points as separate insights
- Include citations for important claims
- Focus on actionable information relevant to the topic`;

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
        } else {
          console.log(
            `[research] ${queryProgress} Using Exa /search endpoint for query (priority ${queryItem.priority}): "${queryItem.query}"`
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
        }
      }

      await statusManager.updateCycle(generationCycleId, {
        progress_current: queryNumber,
      });

      console.log(
        `[research] ${queryProgress} Query processing complete. Total chunks so far: ${insertedCount.value}`
      );
    } catch (err: unknown) {
      console.error('[orchestrator] error:', String(err));
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
  query: string,
  supabase: WorkerSupabaseClient,
  eventId: string,
  blueprintId: string,
  generationCycleId: string
): Promise<ResearchResults['chunks']> {
  const chunks: ResearchResults['chunks'] = [];
  const startTime = Date.now();

  try {
    console.log(`[research] Wikipedia: Searching for articles matching "${query}"...`);
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      query
    )}&srlimit=5&format=json&origin=*`;

    const searchResponse = await fetch(searchUrl);
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

        const summaryResponse = await fetch(summaryUrl);

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

