import { Exa } from 'exa-js';
import type { ResearchResults } from '../glossary-builder';
import type { ResearchResultInsert } from '../../../types';
import { insertResearchResultRow, type WorkerSupabaseClient } from './supabase-orchestrator';
import { calculateExaResearchCost, calculateExaSearchCost } from '../pricing-config';
import { chunkTextContent } from '../../../lib/text/llm-prompt-chunking';

export type ExaCostUsage = {
  searches: number;
  pages: number;
  tokens: number;
};

export type ExaCostBreakdown = {
  total: number;
  search: { cost: number; queries: number };
  research: { cost: number; queries: number; usage: ExaCostUsage };
  answer: { cost: number; queries: number };
};

export type ResearchCostTracker = {
  exa: ExaCostBreakdown;
};

export interface PendingResearchTask {
  researchId: string;
  queryItem: { query: string; api: string; priority: number };
  queryNumber: number;
  queryProgress: string;
  createdAt: number;
  startTime: number;
}

export const pollResearchTasks = async (
  exa: Exa,
  pendingTasks: PendingResearchTask[],
  supabase: WorkerSupabaseClient,
  eventId: string,
  blueprintId: string,
  generationCycleId: string,
  chunks: ResearchResults['chunks'],
  insertedCount: { value: number },
  costBreakdown: ResearchCostTracker
): Promise<void> => {
  const MAX_POLL_TIME_MS = 5 * 60 * 1000;
  const POLL_INTERVAL_MS = 10000;
  const activeTasks = [...pendingTasks];
  const startTime = Date.now();

  console.log(`[research-poll] Polling ${activeTasks.length} research task(s)`);

  while (activeTasks.length > 0) {
    for (let i = activeTasks.length - 1; i >= 0; i--) {
      const task = activeTasks[i];
      const taskAge = Date.now() - task.createdAt;

      if (taskAge > MAX_POLL_TIME_MS) {
        console.warn(
          `[research-poll] ${task.queryProgress} Task ${task.researchId} exceeded max poll time, falling back to /search`
        );
        activeTasks.splice(i, 1);
        continue;
      }

      try {
        const taskStatus = await (exa.research as any).retrieve(task.researchId);
        if (taskStatus.status === 'completed') {
          await processCompletedResearchTask(
            task,
            taskStatus,
            exa,
            supabase,
            eventId,
            blueprintId,
            generationCycleId,
            chunks,
            insertedCount,
            costBreakdown
          );
          activeTasks.splice(i, 1);
        } else if (taskStatus.status === 'failed') {
          console.error(
            `[research-poll] ${task.queryProgress} Task ${task.researchId} failed: ${taskStatus.error || 'unknown error'}`
          );
          activeTasks.splice(i, 1);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[research-poll] ${task.queryProgress} Error polling task: ${message}`);
      }
    }

    if (activeTasks.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  const totalDuration = Date.now() - startTime;
  console.log(`[research-poll] Polling complete in ${totalDuration}ms`);
};

export const processCompletedResearchTask = async (
  task: PendingResearchTask,
  taskStatus: any,
  exa: Exa,
  supabase: WorkerSupabaseClient,
  eventId: string,
  blueprintId: string,
  generationCycleId: string,
  chunks: ResearchResults['chunks'],
  insertedCount: { value: number },
  costBreakdown: ResearchCostTracker
): Promise<void> => {
  const { queryItem, queryProgress } = task;

  let researchData: any;
  if (typeof taskStatus.output === 'string') {
    try {
      researchData = JSON.parse(taskStatus.output);
    } catch {
      researchData = { summary: taskStatus.output, keyPoints: [] };
    }
  } else {
    researchData = taskStatus.output;
  }

  const summary = researchData.summary || researchData.content || researchData.text || '';
  const keyPoints = researchData.keyPoints || [];

  if (!summary || summary.length < 50) {
    console.warn(
      `[research-poll] ${queryProgress} Exa /research output is empty or too short for query: "${queryItem.query}"`
    );
    return;
  }

  const researchText =
    summary +
    (keyPoints.length > 0
      ? '\n\nKey Points:\n' + keyPoints.map((kp: string, i: number) => `${i + 1}. ${kp}`).join('\n')
      : '');

  const textChunks = chunkTextContent(researchText, 200, 400);

  for (const chunkText of textChunks) {
    const qualityScore = 0.95;
    const metadata: ResearchResultInsert['metadata'] = {
      api: 'exa',
      query: queryItem.query,
      research_id: task.researchId,
      method: 'research',
      quality_score: qualityScore,
    };

    const insertResult = await insertResearchResultRow(supabase, {
      event_id: eventId,
      blueprint_id: blueprintId,
      generation_cycle_id: generationCycleId,
      query: queryItem.query,
      api: 'exa',
      content: chunkText,
      quality_score: qualityScore,
      metadata,
    });

    if (!insertResult.success) {
      console.error(
        `[research-poll] ${queryProgress} Error storing research result: ${insertResult.message}`
      );
      continue;
    }

    insertedCount.value++;
    chunks.push({
      text: chunkText,
      source: 'exa_research',
      metadata,
    });
  }

  const estimatedUsage = {
    searches: 5,
    pages: 3,
    tokens: 50000,
  };
  const researchCost = calculateExaResearchCost(estimatedUsage);
  costBreakdown.exa.total += researchCost;
  costBreakdown.exa.research.cost += researchCost;
  costBreakdown.exa.research.queries += 1;
  costBreakdown.exa.research.usage.searches += estimatedUsage.searches;
  costBreakdown.exa.research.usage.pages += estimatedUsage.pages;
  costBreakdown.exa.research.usage.tokens += estimatedUsage.tokens;
};

export const executeExaSearch = async (
  queryItem: { query: string },
  exa: Exa,
  supabase: WorkerSupabaseClient,
  eventId: string,
  blueprintId: string,
  generationCycleId: string,
  chunks: ResearchResults['chunks'],
  insertedCount: { value: number },
  costBreakdown?: { exa: { total: number; search: { cost: number; queries: number } } }
): Promise<void> => {
  const startTime = Date.now();

  try {
    console.log(`[research] Exa /search: Initiating search for "${queryItem.query}"...`);

    if (costBreakdown) {
      const searchCost = calculateExaSearchCost(1);
      costBreakdown.exa.total += searchCost;
      costBreakdown.exa.search.cost += searchCost;
      costBreakdown.exa.search.queries += 1;
    }

    const searchResults = await exa.search(queryItem.query, {
      contents: { text: true },
      numResults: 5,
    });

    const searchDuration = Date.now() - startTime;

    if (!searchResults.results || searchResults.results.length === 0) {
      console.warn(
        `[research] Exa /search: No results found for query "${queryItem.query}" (duration: ${searchDuration}ms)`
      );
      return;
    }

    console.log(
      `[research] Exa /search: Received ${searchResults.results.length} results in ${searchDuration}ms for query: "${queryItem.query}"`
    );

    let processedResults = 0;
    let skippedResults = 0;

    for (const result of searchResults.results) {
      if (!result.text) {
        console.warn(`[research] Exa /search: Result missing text content for URL: ${result.url}`);
        skippedResults++;
        continue;
      }

      processedResults++;
      const textChunks = chunkTextContent(result.text, 200, 400);

      for (const chunkText of textChunks) {
        const qualityScore = calculateQualityScore(result, chunkText);
        const metadata: ResearchResultInsert['metadata'] = {
          api: 'exa',
          query: queryItem.query,
          url: result.url,
          title: result.title || null,
          author: result.author || null,
          published_date: result.publishedDate || null,
          quality_score: qualityScore,
        };

        const insertResult = await insertResearchResultRow(supabase, {
          event_id: eventId,
          blueprint_id: blueprintId,
          generation_cycle_id: generationCycleId,
          query: queryItem.query,
          api: 'exa',
          content: chunkText,
          source_url: result.url,
          quality_score: qualityScore,
          metadata,
        });

        if (!insertResult.success) {
          console.error(
            `[research] Exa /search: Database error storing result for "${queryItem.query}": ${insertResult.message}`
          );
          continue;
        }

        insertedCount.value++;
        chunks.push({
          text: chunkText,
          source: 'exa',
          metadata,
        });
      }
    }

    const totalDuration = Date.now() - startTime;
    console.log(
      `[research] Exa /search: Processed ${processedResults}/${searchResults.results.length} results (${skippedResults} skipped), created ${insertedCount.value} chunks in ${totalDuration}ms for query: "${queryItem.query}"`
    );
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`[research] ✗ Exa /search API FAILURE for query "${queryItem.query}":`, {
      error: error.message,
      stack: error.stack,
      duration: `${duration}ms`,
      statusCode: error.status || error.statusCode || 'N/A',
      code: error.code || 'N/A',
      response: error.response ? JSON.stringify(error.response).substring(0, 300) : 'N/A',
      type: error.constructor?.name || 'Unknown',
    });
    throw error;
  }
};

export const calculateWikipediaQualityScore = (articleData: any, chunkText: string): number => {
  let score = 0.5;
  if (articleData.title && articleData.title.length > 20) {
    score += 0.1;
  }
  if (articleData.thumbnail) {
    score += 0.1;
  }
  if (articleData.coordinates) {
    score += 0.1;
  }
  if (articleData.extract && articleData.extract.length > 500) {
    score += 0.1;
  }
  const wordCount = chunkText.split(/\s+/).length;
  if (wordCount > 100) {
    score += 0.1;
  }
  return Math.min(score, 1.0);
};

export const calculateQualityScore = (result: any, chunkText: string): number => {
  let score = 0.5;
  if (result.title && result.title.length > 10) {
    score += 0.1;
  }
  if (result.author) {
    score += 0.1;
  }
  if (result.publishedDate) {
    try {
      const published = new Date(result.publishedDate);
      const now = new Date();
      const daysSincePublished = (now.getTime() - published.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSincePublished < 730) {
        score += 0.1;
      }
    } catch {
      // Ignore parsing errors
    }
  }
  const wordCount = chunkText.split(/\s+/).length;
  if (wordCount > 100) {
    score += 0.1;
  }
  return Math.min(score, 1.0);
};
