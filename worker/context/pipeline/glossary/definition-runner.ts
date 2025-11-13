import type OpenAI from 'openai';
import type { Exa } from 'exa-js';
import {
  EXA_ANSWER_SYSTEM_PROMPT,
  GLOSSARY_TERM_SYSTEM_PROMPT,
  createGlossaryTermUserPrompt,
  EXA_ANSWER_POLISH_SYSTEM_PROMPT,
  createExaAnswerPolishUserPrompt,
} from '../../../prompts';
import { calculateExaAnswerCost, calculateOpenAICost } from '../../../lib/pricing';
import { normalizeGlossaryDefinitions } from '../../../lib/context-normalization';
import { selectRelevantSnippets } from './snippet-selector';
import type { AgentUtilityTargets } from './types';
import type {
  GlossaryPlanTerm,
  GlossaryCostBreakdown,
  ResearchResults,
  TermDefinition,
} from './types';

type ChatCompletionRequest = Parameters<OpenAI['chat']['completions']['create']>[0];

interface TermGenerationParams {
  term: GlossaryPlanTerm;
  snippets: string[];
  importantDetails: string;
  openai: OpenAI;
  glossaryModel: string;
  exa: Exa | undefined;
  preferExa: boolean;
}

type ChatCompletionCostEntry =
  GlossaryCostBreakdown['openai']['chat_completions'][number];
type ExaAnswerCallEntry = GlossaryCostBreakdown['exa']['answer']['calls'][number];

interface RunGlossaryModelParams {
  term: string;
  openai: OpenAI;
  model: string;
  systemPrompt: string;
  userPrompt: string;
}

interface RunGlossaryModelResult {
  definition: TermDefinition | null;
  openAICalls: ChatCompletionCostEntry[];
}

const isChatCompletion = (
  value: unknown
): value is OpenAI.Chat.Completions.ChatCompletion =>
  typeof value === 'object' &&
  value !== null &&
  Array.isArray((value as { choices?: unknown }).choices);

const runGlossaryModel = async (
  params: RunGlossaryModelParams
): Promise<RunGlossaryModelResult> => {
  const { term, openai, model, systemPrompt, userPrompt } = params;

  const request: ChatCompletionRequest = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
  };

  const rawResponse = await openai.chat.completions.create(request);

  if (!isChatCompletion(rawResponse)) {
    console.warn(`[glossary] Unexpected response shape when generating definition for "${term}"`);
    return { definition: null, openAICalls: [] };
  }

  const response = rawResponse;

  const openAICalls: ChatCompletionCostEntry[] = [];

  if (response.usage) {
    const usage = response.usage;
    const cost = calculateOpenAICost(usage, model, false);
    openAICalls.push({
      term,
      cost,
      model,
      usage: {
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens ?? 0,
        total_tokens:
          usage.total_tokens ??
          usage.prompt_tokens + (usage.completion_tokens ?? 0),
      },
    });
  }

  const content = response.choices[0]?.message?.content;
  if (!content) {
    console.warn(`[glossary] Empty response when generating definition for "${term}"`);
    return { definition: null, openAICalls };
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    const rawEntries = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { definitions?: unknown[] }).definitions)
        ? (parsed as { definitions: unknown[] }).definitions
        : [parsed];

    const normalized = normalizeGlossaryDefinitions(rawEntries);
    const first = normalized[0];

    if (!first || typeof first.definition !== 'string') {
      console.warn(`[glossary] Glossary model returned unexpected structure for "${term}"`);
      return { definition: null, openAICalls };
    }

    const parsedDefinition: TermDefinition = {
      term: typeof first.term === 'string' ? first.term : term,
      definition: first.definition,
      acronym_for: typeof first.acronym_for === 'string' ? first.acronym_for : undefined,
      category: typeof first.category === 'string' ? first.category : 'general',
      usage_examples: Array.isArray(first.usage_examples) ? first.usage_examples : [],
      related_terms: Array.isArray(first.related_terms) ? first.related_terms : [],
      confidence_score:
        typeof first.confidence_score === 'number' ? first.confidence_score : undefined,
      source: typeof first.source === 'string' ? first.source : undefined,
      source_url: typeof first.source_url === 'string' ? first.source_url : undefined,
    };

    return {
      definition: parsedDefinition,
      openAICalls,
    };
  } catch (err: unknown) {
    console.error("[worker] error:", String(err));
    return { definition: null, openAICalls };
  }
};

interface TermGenerationResult {
  definition: TermDefinition | null;
  openAICalls: GlossaryCostBreakdown['openai']['chat_completions'];
  exaCost?: number;
  exaDisabled?: boolean;
}

const EXA_CREDIT_LIMIT_SIGNATURES = [
  'exaerror: you have exceeded your credits limit',
  'exceeded your credits limit',
] as const;

const isExaCreditsLimitError = (text: string): boolean => {
  const normalized = text.toLowerCase();
  return EXA_CREDIT_LIMIT_SIGNATURES.some((signature) =>
    normalized.includes(signature)
  );
};

export async function generateTermDefinitions(
  terms: GlossaryPlanTerm[],
  research: ResearchResults,
  importantDetails: string,
  openai: OpenAI,
  glossaryModel: string,
  exa: Exa | undefined
): Promise<{ definitions: TermDefinition[]; batchCostBreakdown: GlossaryCostBreakdown }> {
  const openAiEntries: ChatCompletionCostEntry[] = [];
  const exaCalls: ExaAnswerCallEntry[] = [];
  let openAiTotal = 0;
  let exaTotal = 0;
  let exaAnswerCost = 0;
  let exaAnswerQueries = 0;
  const definitions: TermDefinition[] = [];
  let exaAvailable = Boolean(exa);

  for (const term of terms) {
    const snippets = selectRelevantSnippets(term, research);
    const preferExa = exaAvailable && Boolean(exa) && term.priority < 2;

    const result = await generateDefinitionForTerm({
      term,
      snippets,
      importantDetails,
      openai,
      glossaryModel,
      exa,
      preferExa,
    });

    if (result.definition) {
      definitions.push(result.definition);
    }

    if (result.exaDisabled) {
      if (exaAvailable) {
        console.warn(
          `[glossary] Disabling Exa usage for remaining terms: exhausted credits detected at term "${term.term}"`
        );
      }
      exaAvailable = false;
    }

    for (const call of result.openAICalls) {
      openAiTotal += call.cost;
      openAiEntries.push(call);
    }

    if (typeof result.exaCost === 'number') {
      exaTotal += result.exaCost;
      exaAnswerCost += result.exaCost;
      exaAnswerQueries += 1;
      exaCalls.push({ term: term.term, cost: result.exaCost });
    }
  }

  const batchCostBreakdown: GlossaryCostBreakdown = {
    openai: {
      total: openAiTotal,
      chat_completions: openAiEntries,
    },
    exa: {
      total: exaTotal,
      answer: {
        cost: exaAnswerCost,
        queries: exaAnswerQueries,
        calls: exaCalls,
      },
    },
  };

  return { definitions, batchCostBreakdown };
}

async function generateDefinitionForTerm(params: TermGenerationParams): Promise<TermGenerationResult> {
  let exaAttempt: TermGenerationResult | null = null;
  if (params.preferExa && params.exa) {
    exaAttempt = await tryExaFirst(params);
    if (exaAttempt.definition) {
      return exaAttempt;
    }
  }

  const fallback = await generateViaGlossaryModel(params);
  if (exaAttempt?.exaDisabled) {
    return { ...fallback, exaDisabled: true };
  }

  return fallback;
}

async function tryExaFirst(params: TermGenerationParams): Promise<TermGenerationResult> {
  const { term, snippets, importantDetails, exa } = params;
  if (!exa) {
    return { definition: null, openAICalls: [] };
  }

  try {
    const query = buildExaAnswerQuery(term, snippets, importantDetails);
    console.log(`[glossary] Using Exa /answer for term "${term.term}"`);
    const answer = await exa.answer(query, {
      text: true,
      systemPrompt: EXA_ANSWER_SYSTEM_PROMPT,
    });

    const answerText = typeof answer.answer === 'string' ? answer.answer.trim() : '';
    const exaCost = calculateExaAnswerCost(1);
    const citationUrl =
      Array.isArray(answer.citations) && answer.citations.length > 0
        ? answer.citations[0]?.url ?? undefined
        : undefined;

    if (!answerText) {
      console.warn(`[glossary] Exa /answer returned empty content for "${term.term}", falling back to LLM`);
      return {
        definition: null,
        openAICalls: [],
        exaCost,
      };
    }

    const polished = await polishExaAnswer({
      ...params,
      answerText,
      citationUrl,
    });

    return {
      definition: polished.definition,
      openAICalls: polished.openAICalls,
      exaCost,
    };
  } catch (err: unknown) {
    const errString = String(err);
    console.error("[worker] error:", errString);
    if (isExaCreditsLimitError(errString)) {
      console.warn(
        `[glossary] Exa credits limit reached during term "${term.term}". Falling back to LLM definitions for remaining terms.`
      );
      return { definition: null, openAICalls: [], exaDisabled: true };
    }
    return { definition: null, openAICalls: [] };
  }
}

async function polishExaAnswer(
  params: TermGenerationParams & { answerText: string; citationUrl?: string }
): Promise<TermGenerationResult> {
  const { term, answerText, citationUrl, snippets, importantDetails, openai, glossaryModel } = params;

  const {
    definition: polishedDefinition,
    openAICalls: polishedCalls,
  } = await runGlossaryModel({
    term: term.term,
    openai,
    model: glossaryModel,
    systemPrompt: EXA_ANSWER_POLISH_SYSTEM_PROMPT,
    userPrompt: createExaAnswerPolishUserPrompt({
      term: term.term,
      isAcronym: term.is_acronym,
      category: term.category,
      answer: answerText,
      snippets,
      importantDetails,
      agentUtility: term.agent_utility,
    }),
  });

  if (!polishedDefinition) {
    return { definition: null, openAICalls: polishedCalls };
  }

  const definition: TermDefinition = {
    term: polishedDefinition.term || term.term,
    definition: formatDefinitionForAgents({
      base: polishedDefinition.definition,
      agentUtility: term.agent_utility,
    }),
    acronym_for: polishedDefinition.acronym_for ?? (term.is_acronym ? term.term : undefined),
    category:
      polishedDefinition.category && polishedDefinition.category !== 'general'
        ? polishedDefinition.category
        : term.category,
    usage_examples: normalizeUsageExamples(polishedDefinition.usage_examples, term.agent_utility),
    related_terms: polishedDefinition.related_terms ?? [],
    confidence_score: polishedDefinition.confidence_score ?? 0.95,
    source: 'exa',
    source_url: citationUrl ?? polishedDefinition.source_url,
    agent_utility: term.agent_utility,
  };

  return { definition, openAICalls: polishedCalls };
}

async function generateViaGlossaryModel(params: TermGenerationParams): Promise<TermGenerationResult> {
  const { term, snippets, importantDetails, openai, glossaryModel } = params;

  const {
    definition: generatedDefinition,
    openAICalls,
  } = await runGlossaryModel({
    term: term.term,
    openai,
    model: glossaryModel,
    systemPrompt: GLOSSARY_TERM_SYSTEM_PROMPT,
    userPrompt: createGlossaryTermUserPrompt({
      term: term.term,
      isAcronym: term.is_acronym,
      category: term.category,
      importantDetails,
      snippets,
      agentUtility: term.agent_utility,
    }),
  });

  if (!generatedDefinition) {
    return { definition: null, openAICalls };
  }

  const definition: TermDefinition = {
    term: generatedDefinition.term || term.term,
    definition: formatDefinitionForAgents({
      base: generatedDefinition.definition,
      agentUtility: term.agent_utility,
    }),
    acronym_for: generatedDefinition.acronym_for ?? undefined,
    category:
      generatedDefinition.category && generatedDefinition.category !== 'general'
        ? generatedDefinition.category
        : term.category,
    usage_examples: normalizeUsageExamples(generatedDefinition.usage_examples, term.agent_utility),
    related_terms: generatedDefinition.related_terms ?? [],
    confidence_score: generatedDefinition.confidence_score ?? 0.85,
    source: generatedDefinition.source ?? 'llm_generation',
    source_url: generatedDefinition.source_url,
    agent_utility: term.agent_utility,
  };

  return { definition, openAICalls };
}

const buildExaAnswerQuery = (
  term: GlossaryPlanTerm,
  snippets: string[],
  importantDetails: string
): string => {
  const snippetSummary =
    snippets.length > 0
      ? snippets.join(' ').slice(0, 600)
      : 'No supporting snippets available.';

  const detailsSection = importantDetails ? importantDetails.slice(0, 400) : '';

  return [
    `Provide an authoritative, up-to-date definition for "${term.term}" (${term.category}).`,
    term.is_acronym ? 'If it is an acronym, expand it.' : '',
    snippetSummary ? `Focus on the following context: ${snippetSummary}` : '',
    detailsSection ? `Event details to consider: ${detailsSection}` : '',
  ]
    .filter(Boolean)
    .join(' ');
};

const formatDefinitionForAgents = ({
  base,
  agentUtility,
}: {
  base: string;
  agentUtility?: AgentUtilityTargets;
}): string => {
  if (!agentUtility || agentUtility.length === 0) {
    return base;
  }

  const includesFacts = agentUtility.includes('facts');
  const includesCards = agentUtility.includes('cards');

  if (includesFacts && includesCards) {
    return `${base} ${cardsFriendlySuffix()}`;
  }

  if (includesFacts) {
    return ensureFactsTone(base);
  }

  if (includesCards) {
    return ensureCardsTone(base);
  }

  return base;
};

const ensureFactsTone = (text: string): string => {
  if (/\.$/.test(text.trim())) {
    return text.trim();
  }
  return `${text.trim()}.`;
};

const ensureCardsTone = (text: string): string => {
  const trimmed = text.trim();
  if (trimmed.endsWith('!') || trimmed.endsWith('.')) {
    return trimmed;
  }
  return `${trimmed}.`;
};

const cardsFriendlySuffix = (): string =>
  'This definition highlights why the concept matters in practice, offering a quick takeaway suitable for cards.';

const normalizeUsageExamples = (
  examples: unknown,
  agentUtility?: AgentUtilityTargets
): string[] => {
  const list = Array.isArray(examples)
    ? examples.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];

  if (!agentUtility || agentUtility.length === 0) {
    return list;
  }

  const includesCards = agentUtility.includes('cards');
  if (includesCards && list.length === 0) {
    return ['Use this concept to anchor a compelling narrative or visual highlight.'];
  }

  return list;
};

