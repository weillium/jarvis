import type { Exa } from 'exa-js';
import type { ResearchResults } from '../glossary-builder';
import type { ResearchResultInsert } from '../../../types';
import { insertResearchResultRow, type WorkerSupabaseClient } from './supabase-orchestrator';
import { calculateExaResearchCost, calculateExaSearchCost } from '../pricing-config';
import { chunkTextContent } from '../../../lib/text/llm-prompt-chunking';
import { isRecord } from '../../../lib/context-normalization';

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

interface ExaResearchTaskStatus {
  status: string;
  output?: unknown;
  error?: unknown;
}

type ExaResearchRetriever = {
  retrieve: (taskId: string) => Promise<unknown>;
};

interface NormalizedResearchOutput {
  summary: string;
  keyPoints: string[];
}

interface ExaSearchMetadata {
  title?: string;
  author?: string;
  publishedDate?: string;
}

interface WikipediaSummaryData {
  title?: string;
  extract?: string;
  extract_html?: string;
  thumbnail?: { source?: string };
  coordinates?: { lat?: number; lon?: number };
}

const isExaResearchTaskStatus = (value: unknown): value is ExaResearchTaskStatus =>
  isRecord(value) && typeof value.status === 'string';

const normalizeResearchOutput = (output: unknown): NormalizedResearchOutput | null => {
  if (typeof output === 'string') {
    const trimmed = output.trim();
    if (!trimmed) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isRecord(parsed)) {
        return normalizeResearchOutput(parsed);
      }
    } catch {
      // Treat as plain text
    }

    return { summary: trimmed, keyPoints: [] };
  }

  if (!isRecord(output)) {
    return null;
  }

  const record = output;
  const summarySources = ['summary', 'content', 'text'];
  const summary = summarySources
    .map((key) => record[key])
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0);

  if (!summary) {
    return null;
  }

  const keyPointsValue = record.keyPoints;
  const keyPoints = Array.isArray(keyPointsValue)
    ? keyPointsValue.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

  return {
    summary: summary.trim(),
    keyPoints,
  };
};

const getStringField = (record: Record<string, unknown>, key: string): string | undefined => {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
};

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const getResearchClient = (research: unknown): ExaResearchRetriever | null => {
  if (!isRecord(research)) {
    return null;
  }

  const retrieveValue = research.retrieve;
  if (typeof retrieveValue !== 'function') {
    return null;
  }

  return {
    retrieve: (taskId: string) =>
      Promise.resolve<unknown>(retrieveValue.call(research, taskId)),
  };
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
        try {
          await executeExaSearch(
            task.queryItem,
            exa,
            supabase,
            eventId,
            blueprintId,
            generationCycleId,
            chunks,
            insertedCount,
            costBreakdown
          );
        } catch (fallbackError) {
          console.error(
            `[research-poll] ${task.queryProgress} Fallback /search error: ${toErrorMessage(fallbackError)}`
          );
        }
        activeTasks.splice(i, 1);
        continue;
      }

      try {
        const researchClient = getResearchClient(exa.research);
        if (!researchClient) {
          console.error('[research-poll] Research client unavailable, aborting task polling');
          return;
        }
        const taskStatus = await researchClient.retrieve(task.researchId);
        if (!isExaResearchTaskStatus(taskStatus)) {
          console.error(
            `[research-poll] ${task.queryProgress} Unexpected task status shape for ${task.researchId}`
          );
          activeTasks.splice(i, 1);
          continue;
        }

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
            `[research-poll] ${task.queryProgress} Task ${task.researchId} failed: ${typeof taskStatus.error === 'string' ? taskStatus.error : 'unknown error'}`
          );
          activeTasks.splice(i, 1);
        }
      } catch (error) {
        console.error(`[research-poll] ${task.queryProgress} Error polling task: ${toErrorMessage(error)}`);
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
  taskStatus: ExaResearchTaskStatus,
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

  const normalizedOutput = normalizeResearchOutput(taskStatus.output);

  if (!normalizedOutput || normalizedOutput.summary.length < 50) {
    console.warn(
      `[research-poll] ${queryProgress} Exa /research output is empty or too short for query: "${queryItem.query}"`
    );
    try {
      await executeExaSearch(
        queryItem,
        exa,
        supabase,
        eventId,
        blueprintId,
        generationCycleId,
        chunks,
        insertedCount,
        costBreakdown
      );
    } catch (fallbackError) {
      console.error(
        `[research-poll] ${queryProgress} Fallback /search error: ${toErrorMessage(fallbackError)}`
      );
    }
    return;
  }

  const researchText =
    normalizedOutput.summary +
    (normalizedOutput.keyPoints.length > 0
      ? '\n\nKey Points:\n' + normalizedOutput.keyPoints.map((kp, i) => `${i + 1}. ${kp}`).join('\n')
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

    const rawResults = Array.isArray(searchResults.results) ? searchResults.results : [];

    if (rawResults.length === 0) {
      console.warn(
        `[research] Exa /search: No results found for query "${queryItem.query}" (duration: ${searchDuration}ms)`
      );
      return;
    }

    console.log(
      `[research] Exa /search: Received ${rawResults.length} results in ${searchDuration}ms for query: "${queryItem.query}"`
    );

    let processedResults = 0;
    let skippedResults = 0;

    for (const result of rawResults) {
      if (!isRecord(result)) {
        skippedResults++;
        continue;
      }

      const text = getStringField(result, 'text');
      if (!text) {
        console.warn(
          `[research] Exa /search: Result missing text content for URL: ${getStringField(result, 'url') || 'unknown'}`
        );
        skippedResults++;
        continue;
      }

      processedResults++;
      const textChunks = chunkTextContent(text, 200, 400);
      const url = getStringField(result, 'url');
      const metadataFields: ExaSearchMetadata = {
        title: getStringField(result, 'title'),
        author: getStringField(result, 'author'),
        publishedDate: getStringField(result, 'publishedDate'),
      };

      for (const chunkText of textChunks) {
        const qualityScore = calculateQualityScore(metadataFields, chunkText);
        const metadata: ResearchResultInsert['metadata'] = {
          api: 'exa',
          query: queryItem.query,
          url,
          title: metadataFields.title || null,
          author: metadataFields.author || null,
          published_date: metadataFields.publishedDate || null,
          quality_score: qualityScore,
        };

        const insertResult = await insertResearchResultRow(supabase, {
          event_id: eventId,
          blueprint_id: blueprintId,
          generation_cycle_id: generationCycleId,
          query: queryItem.query,
          api: 'exa',
          content: chunkText,
          source_url: url,
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
      `[research] Exa /search: Processed ${processedResults}/${rawResults.length} results (${skippedResults} skipped), created ${insertedCount.value} chunks in ${totalDuration}ms for query: "${queryItem.query}"`
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[research] ✗ Exa /search API FAILURE for query "${queryItem.query}":`, {
      error: toErrorMessage(error),
      duration: `${duration}ms`,
    });
    throw error;
  }
};

export const calculateWikipediaQualityScore = (
  articleData: WikipediaSummaryData,
  chunkText: string
): number => {
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

export const calculateQualityScore = (
  result: ExaSearchMetadata,
  chunkText: string
): number => {
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
