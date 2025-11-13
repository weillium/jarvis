import { createHash } from 'crypto';
import type { WorkerSupabaseClient } from '../../../services/supabase';
import type { ResearchResults } from '../glossary/types';
import { fetchActiveResearch } from './persistence';
import type { ChunkCandidate } from './types';

interface LoadResearchParams {
  eventId: string;
  blueprintId: string;
  researchResults: ResearchResults | null;
  supabase: WorkerSupabaseClient;
}

export const loadResearchResults = async ({
  eventId,
  blueprintId,
  researchResults,
  supabase,
}: LoadResearchParams): Promise<ResearchResults> => {
  if (researchResults) {
    return researchResults;
  }

  const rows = await fetchActiveResearch(supabase, { eventId, blueprintId });

  return {
    chunks: rows.map((row) => ({
      text: row.content,
      source: row.api || 'research',
      metadata: row.metadata ?? undefined,
    })),
  };
};

export const buildResearchChunkCandidates = (research: ResearchResults): ChunkCandidate[] => {
  return research.chunks
    .filter((chunk) => typeof chunk.text === 'string' && chunk.text.trim().length > 0)
    .map((chunk) => {
      const rawText = chunk.text.trim();
      const metadata = chunk.metadata ?? undefined;
      const agentUtility = extractAgentUtility(metadata?.agent_utility);
      const queryPriority =
        typeof metadata?.query_priority === 'number'
          ? metadata.query_priority
          : typeof metadata?.priority === 'number'
            ? metadata.priority
            : undefined;

      const provenanceHint =
        typeof metadata?.provenance_hint === 'string' && metadata.provenance_hint.trim().length > 0
          ? metadata.provenance_hint
          : undefined;

      const promptText = createPromptView(rawText, agentUtility);
      const topics = extractTopics(metadata, rawText);
      const hash = createChunkHash(rawText);

      return {
        text: rawText,
        promptText,
        hash,
        source: chunk.source || 'research',
        researchSource: metadata?.api || chunk.source || 'research',
        qualityScore: metadata?.quality_score ?? 0.8,
        metadata,
        agentUtility,
        queryPriority,
        provenanceHint,
        topics,
        originalLength: rawText.length,
        promptLength: promptText.length,
      };
    });
};

const MAX_PROMPT_CHARS_DEFAULT = 700;
const MAX_PROMPT_CHARS_CARDS = 850;
const MAX_PROMPT_CHARS_FACTS = 600;

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'from',
  'this',
  'have',
  'will',
  'into',
  'about',
  'their',
  'which',
  'over',
  'where',
  'when',
  'what',
  'your',
  'into',
  'such',
  'also',
  'much',
  'many',
  'very',
]);

const extractAgentUtility = (
  value: unknown
): Array<'facts' | 'cards' | 'glossary'> | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const filtered = value.filter(
    (agent): agent is 'facts' | 'cards' | 'glossary' =>
      agent === 'facts' || agent === 'cards' || agent === 'glossary'
  );
  return filtered.length > 0 ? filtered : undefined;
};

const createPromptView = (
  text: string,
  agentUtility?: Array<'facts' | 'cards' | 'glossary'>
): string => {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }

  const includesFacts = agentUtility?.includes('facts') ?? false;
  const includesCards = agentUtility?.includes('cards') ?? false;

  const maxChars = includesCards
    ? includesFacts
      ? MAX_PROMPT_CHARS_CARDS
      : MAX_PROMPT_CHARS_CARDS
    : includesFacts
      ? MAX_PROMPT_CHARS_FACTS
      : MAX_PROMPT_CHARS_DEFAULT;

  const sentences = normalized.match(/[^.!?]+[.!?]*/g) || [normalized];
  let prompt = '';

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) {
      continue;
    }
    if ((prompt + ' ' + trimmedSentence).trim().length > maxChars) {
      break;
    }
    prompt = `${prompt} ${trimmedSentence}`.trim();
  }

  if (!prompt) {
    prompt = normalized.slice(0, maxChars);
  }

  return prompt;
};

const extractTopics = (
  metadata: Record<string, unknown> | undefined,
  text: string
): string[] => {
  const rawSources: string[] = [];

  if (metadata) {
    if (typeof metadata.query === 'string') {
      rawSources.push(metadata.query);
    }
    if (typeof metadata.title === 'string') {
      rawSources.push(metadata.title);
    }
    if (typeof metadata.provenance_hint === 'string') {
      rawSources.push(metadata.provenance_hint);
    }
  }

  if (rawSources.length === 0) {
    rawSources.push(text.slice(0, 200));
  }

  const tokens = rawSources
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(
      (token) =>
        token.length > 3 &&
        !STOP_WORDS.has(token) &&
        !/^\d+$/.test(token)
    );

  const unique: string[] = [];
  for (const token of tokens) {
    if (!unique.includes(token)) {
      unique.push(token);
    }
    if (unique.length >= 8) {
      break;
    }
  }

  return unique;
};

const createChunkHash = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex');

