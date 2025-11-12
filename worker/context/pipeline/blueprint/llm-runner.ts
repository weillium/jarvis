import type OpenAI from 'openai';
import type { ChatCompletionCreateParams } from 'openai/resources/chat/completions';
import { ensureBlueprintShape } from '../../../lib/context-normalization';
import { postProcessBlueprint } from './post-processing';
import { buildBlueprintPrompts } from './prompt-builder';
import type { BlueprintWithUsage } from './types';
import type { OpenAIUsage } from '../../../lib/pricing';

interface BlueprintLLMContext {
  eventTitle: string;
  eventTopic: string | null;
  documentsText: string;
  hasDocuments: boolean;
}

interface GenerateBlueprintWithLLMParams {
  context: BlueprintLLMContext;
  openai: OpenAI;
  genModel: string;
  maxRetries?: number;
}

const parseBlueprintResponse = (rawContent: string): unknown => {
  try {
    return JSON.parse(rawContent) as unknown;
  } catch (err: unknown) {
    console.error('[blueprint-generator] error:', String(err));
    throw err;
  }
};

export const generateBlueprintWithLLM = async (
  params: GenerateBlueprintWithLLMParams
): Promise<BlueprintWithUsage> => {
  const { context, openai, genModel, maxRetries = 2 } = params;
  const topic = context.eventTopic || context.eventTitle;
  const { systemPrompt, userPrompt } = buildBlueprintPrompts({
    eventTitle: context.eventTitle,
    topic,
    documentsText: context.documentsText,
    hasDocuments: context.hasDocuments,
  });

  let attempt = 0;
  let parsedBlueprint: BlueprintWithUsage | null = null;
  let totalUsage: OpenAIUsage | null = null;

  while (attempt <= maxRetries) {
    try {
      const isRetry = attempt > 0;

      const promptMessage = isRetry
        ? `${userPrompt}

IMPORTANT: This is a retry attempt. The previous response had empty or insufficient arrays. You MUST fill ALL arrays with actual, relevant content. Do not return empty arrays. Every array field must have the minimum required items as specified above.`
        : userPrompt;

      console.log(
        `[blueprint] LLM attempt ${attempt + 1}/${maxRetries + 1} for topic "${topic}"`
      );

      const request: ChatCompletionCreateParams = {
        model: genModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: promptMessage },
        ],
        response_format: { type: 'json_object' },
      };

      const response = await openai.chat.completions.create({
        ...request,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'Blueprint',
            schema: {
              type: 'object',
              required: [
                'important_details',
                'inferred_topics',
                'key_terms',
                'research_plan',
                'glossary_plan',
                'chunks_plan',
                'cost_breakdown',
              ],
              additionalProperties: false,
              properties: {
                important_details: {
                  type: 'array',
                  minItems: 5,
                  maxItems: 10,
                  items: { type: 'string', minLength: 1 },
                },
                inferred_topics: {
                  type: 'array',
                  minItems: 5,
                  maxItems: 10,
                  items: { type: 'string', minLength: 1 },
                },
                key_terms: {
                  type: 'array',
                  minItems: 10,
                  maxItems: 20,
                  items: { type: 'string', minLength: 1 },
                },
                research_plan: {
                  type: 'object',
                  required: ['queries', 'total_searches', 'estimated_total_cost'],
                  additionalProperties: false,
                  properties: {
                    queries: {
                      type: 'array',
                      minItems: 5,
                      maxItems: 12,
                      items: {
                        type: 'object',
                        required: ['query', 'api', 'priority', 'estimated_cost'],
                        additionalProperties: false,
                        properties: {
                          query: { type: 'string', minLength: 1 },
                          api: { type: 'string', enum: ['exa', 'wikipedia'] },
                          priority: { type: 'integer', minimum: 1 },
                          estimated_cost: { type: 'number', minimum: 0 },
                        },
                      },
                    },
                    total_searches: { type: 'integer', minimum: 1 },
                    estimated_total_cost: { type: 'number', minimum: 0 },
                  },
                },
                glossary_plan: {
                  type: 'object',
                  required: ['terms', 'estimated_count'],
                  additionalProperties: false,
                  properties: {
                    terms: {
                      type: 'array',
                      minItems: 10,
                      maxItems: 20,
                      items: {
                        type: 'object',
                        required: ['term', 'is_acronym', 'category', 'priority'],
                        additionalProperties: false,
                        properties: {
                          term: { type: 'string', minLength: 1 },
                          is_acronym: { type: 'boolean' },
                          category: { type: 'string', minLength: 1 },
                          priority: { type: 'integer', minimum: 1 },
                        },
                      },
                    },
                    estimated_count: { type: 'integer', minimum: 10 },
                  },
                },
                chunks_plan: {
                  type: 'object',
                  required: ['sources', 'target_count', 'quality_tier', 'ranking_strategy'],
                  additionalProperties: false,
                  properties: {
                    sources: {
                      type: 'array',
                      minItems: 3,
                      items: {
                        type: 'object',
                        required: ['source', 'priority', 'estimated_chunks'],
                        additionalProperties: false,
                        properties: {
                          source: { type: 'string', minLength: 1 },
                          priority: { type: 'integer', minimum: 1 },
                          estimated_chunks: { type: 'integer', minimum: 1 },
                        },
                      },
                    },
                    target_count: { type: 'integer', enum: [500, 1000] },
                    quality_tier: { type: 'string', enum: ['basic', 'comprehensive'] },
                    ranking_strategy: { type: 'string', minLength: 1 },
                  },
                },
                cost_breakdown: {
                  type: 'object',
                  required: ['research', 'glossary', 'chunks', 'total'],
                  additionalProperties: false,
                  properties: {
                    research: { type: 'number', minimum: 0 },
                    glossary: { type: 'number', minimum: 0 },
                    chunks: { type: 'number', minimum: 0 },
                    total: { type: 'number', minimum: 0 },
                  },
                },
              },
            },
            strict: true,
          },
        },
      }) as OpenAI.Chat.Completions.ChatCompletion;

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from LLM');
      }

      const attemptUsage: OpenAIUsage | null = response.usage
        ? (() => {
            const promptTokens = response.usage.prompt_tokens ?? 0;
            const completionTokens = response.usage.completion_tokens ?? 0;
            const totalTokens = response.usage.total_tokens ?? promptTokens + completionTokens;

            return {
              total_tokens: totalTokens,
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
            };
          })()
        : null;

      if (attemptUsage) {
        const attemptPromptTokens = attemptUsage.prompt_tokens ?? 0;
        const attemptCompletionTokens = attemptUsage.completion_tokens ?? 0;

        if (totalUsage) {
          totalUsage = {
            total_tokens: totalUsage.total_tokens + attemptUsage.total_tokens,
            prompt_tokens: (totalUsage.prompt_tokens ?? 0) + attemptPromptTokens,
            completion_tokens: (totalUsage.completion_tokens ?? 0) + attemptCompletionTokens,
          };
        } else {
          totalUsage = attemptUsage;
        }
      }

      const parsedJson = parseBlueprintResponse(content);
      const ensuredBlueprint = ensureBlueprintShape(parsedJson);

      reportValidationStats(ensuredBlueprint, attempt);

      if (validationPassed(ensuredBlueprint)) {
        const result = postProcessBlueprint(ensuredBlueprint, topic);
        parsedBlueprint = {
          ...result,
          usage: totalUsage,
        };
        console.log(`[blueprint] Validation passed on attempt ${attempt + 1}`);
        break;
      }

      if (attempt < maxRetries) {
        attempt += 1;
        continue;
      }

      console.error(
        `[blueprint] All retries exhausted. Using response with insufficient data: ${collectMissingFields(
          ensuredBlueprint
        ).join(', ')}`
      );
      const fallbackResult = postProcessBlueprint(ensuredBlueprint, topic);
      parsedBlueprint = {
        ...fallbackResult,
        usage: totalUsage,
      };
      break;
    } catch (err: unknown) {
      const message = typeof err === 'object' && err !== null && 'message' in err
        ? String((err as { message?: unknown }).message)
        : String(err);
      console.error('[blueprint-generator] error:', message);
      if (attempt >= maxRetries) {
        throw err;
      }
      attempt += 1;
    }
  }

  if (!parsedBlueprint) {
    throw new Error('Failed to parse LLM response');
  }

  console.log(
    `[blueprint] LLM generated blueprint with ${parsedBlueprint.important_details.length} important details, ${parsedBlueprint.inferred_topics.length} inferred topics, ${parsedBlueprint.key_terms.length} key terms, ${parsedBlueprint.research_plan.queries.length} research queries, ${parsedBlueprint.glossary_plan.terms.length} glossary terms, target ${parsedBlueprint.chunks_plan.target_count} chunks`
  );

  return parsedBlueprint;
};

const validationPassed = (blueprint: BlueprintWithUsage): boolean => {
  const importantDetailsCount = blueprint.important_details.length;
  const inferredTopicsCount = blueprint.inferred_topics.length;
  const keyTermsCount = blueprint.key_terms.length;
  const researchQueriesCount = blueprint.research_plan.queries.length;
  const glossaryTermsCount = blueprint.glossary_plan.terms.length;
  const chunksSourcesCount = blueprint.chunks_plan.sources.length;

  return (
    importantDetailsCount >= 5 &&
    inferredTopicsCount >= 5 &&
    keyTermsCount >= 10 &&
    researchQueriesCount >= 5 &&
    glossaryTermsCount >= 10 &&
    chunksSourcesCount >= 3
  );
};

const collectMissingFields = (blueprint: BlueprintWithUsage): string[] => {
  const missing: string[] = [];
  if (blueprint.important_details.length < 5) {
    missing.push(`important_details (${blueprint.important_details.length}/5)`);
  }
  if (blueprint.inferred_topics.length < 5) {
    missing.push(`inferred_topics (${blueprint.inferred_topics.length}/5)`);
  }
  if (blueprint.key_terms.length < 10) {
    missing.push(`key_terms (${blueprint.key_terms.length}/10)`);
  }
  if (blueprint.research_plan.queries.length < 5) {
    missing.push(`research_queries (${blueprint.research_plan.queries.length}/5)`);
  }
  if (blueprint.glossary_plan.terms.length < 10) {
    missing.push(`glossary_terms (${blueprint.glossary_plan.terms.length}/10)`);
  }
  if (blueprint.chunks_plan.sources.length < 3) {
    missing.push(`chunks_sources (${blueprint.chunks_plan.sources.length}/3)`);
  }
  return missing;
};

const reportValidationStats = (blueprint: BlueprintWithUsage, attempt: number) => {
  console.log(`[blueprint] LLM response validation - attempt ${attempt + 1}:`, {
    important_details: blueprint.important_details.length,
    inferred_topics: blueprint.inferred_topics.length,
    key_terms: blueprint.key_terms.length,
    research_queries: blueprint.research_plan.queries.length,
    glossary_terms: blueprint.glossary_plan.terms.length,
    chunks_sources: blueprint.chunks_plan.sources.length,
  });

  if (!validationPassed(blueprint)) {
    const missing = collectMissingFields(blueprint);
    console.warn(
      `[blueprint] Validation failed on attempt ${attempt + 1}. Missing: ${missing.join(', ')}`
    );
  }
};

