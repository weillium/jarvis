import type OpenAI from 'openai';
import type { ChatCompletionCreateParams } from 'openai/resources/chat/completions';
import { ensureBlueprintShape } from '../../../lib/context-normalization';
import { postProcessBlueprint } from './post-processing';
import { buildBlueprintPrompts } from './prompt-builder';
import type { BlueprintWithUsage } from './types';
import type { OpenAIUsage } from '../pricing-config';

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
      const isO1Model = genModel.startsWith('o1');
      const onlySupportsDefaultTemp = isO1Model || genModel.includes('gpt-5');
      const supportsCustomTemperature = !onlySupportsDefaultTemp;
      const currentTemperature = supportsCustomTemperature ? (isRetry ? 0.5 : 0.7) : undefined;

      const promptMessage = isRetry
        ? `${userPrompt}

IMPORTANT: This is a retry attempt. The previous response had empty or insufficient arrays. You MUST fill ALL arrays with actual, relevant content. Do not return empty arrays. Every array field must have the minimum required items as specified above.`
        : userPrompt;

      console.log(
        `[blueprint] LLM attempt ${attempt + 1}/${maxRetries + 1} for topic "${topic}"${
          isRetry && supportsCustomTemperature ? ' (retry with lower temperature)' : ''
        }`
      );

      const request: ChatCompletionCreateParams = {
        model: genModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: promptMessage },
        ],
        response_format: { type: 'json_object' },
      };

      if (supportsCustomTemperature && currentTemperature !== undefined) {
        request.temperature = currentTemperature;
      }

      const response = await openai.chat.completions.create(request) as OpenAI.Chat.Completions.ChatCompletion;

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from LLM');
      }

      const attemptUsage: OpenAIUsage | null = response.usage
        ? {
            prompt_tokens: response.usage.prompt_tokens,
            completion_tokens: response.usage.completion_tokens ?? 0,
            total_tokens:
              response.usage.total_tokens ??
              response.usage.prompt_tokens + (response.usage.completion_tokens ?? 0),
          }
        : null;

      if (attemptUsage) {
        if (totalUsage) {
          totalUsage = {
            prompt_tokens: totalUsage.prompt_tokens + attemptUsage.prompt_tokens,
            completion_tokens: (totalUsage.completion_tokens ?? 0) + (attemptUsage.completion_tokens ?? 0),
            total_tokens: totalUsage.total_tokens + attemptUsage.total_tokens,
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

