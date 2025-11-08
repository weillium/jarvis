import type OpenAI from 'openai';
import type { Exa } from 'exa-js';
import {
  EXA_ANSWER_SYSTEM_PROMPT,
  GLOSSARY_DEFINITION_SYSTEM_PROMPT,
  createGlossaryDefinitionUserPrompt,
  EXA_ANSWER_TRANSFORM_SYSTEM_PROMPT,
  createExaAnswerTransformUserPrompt,
} from '../../../prompts';
import {
  calculateExaAnswerCost,
  calculateOpenAICost,
} from '../pricing-config';
import {
  normalizeGlossaryDefinitions,
} from '../../../lib/context-normalization';
import type {
  GlossaryPlanTerm,
  GlossaryCostBreakdown,
  TermDefinition,
} from './types';

type ChatCompletionRequest = Parameters<OpenAI['chat']['completions']['create']>[0];

export async function generateTermDefinitions(
  terms: GlossaryPlanTerm[],
  researchContext: string,
  importantDetails: string,
  openai: OpenAI,
  genModel: string,
  exa: Exa | undefined,
  costBreakdown?: GlossaryCostBreakdown
): Promise<{ definitions: TermDefinition[]; batchCostBreakdown: GlossaryCostBreakdown }> {
  const definitions: TermDefinition[] = [];
  const termsForLLM: GlossaryPlanTerm[] = [];

  const batchCostBreakdown: GlossaryCostBreakdown = {
    openai: {
      total: 0,
      chat_completions: [],
    },
    exa: {
      total: 0,
      answer: { cost: 0, queries: 0 },
    },
  };

  for (const term of terms) {
    if (term.priority <= 3 && exa) {
      try {
        console.log(`[glossary] Using Exa /answer for high-priority term (priority ${term.priority}): ${term.term}`);

        const answer = await exa.answer(`What is ${term.term}?`, {
          text: true,
          systemPrompt: EXA_ANSWER_SYSTEM_PROMPT,
        });

        const answerText = typeof answer.answer === 'string' ? answer.answer.trim() : '';
        if (answerText) {
          const sourceUrl =
            Array.isArray(answer.citations) && answer.citations.length > 0
              ? answer.citations[0]?.url
              : undefined;

          const transformedDef = await transformExaAnswerToGlossary(
            term,
            answerText,
            sourceUrl,
            openai,
            genModel
          );

          if (transformedDef) {
            definitions.push(transformedDef);
            console.log(`[glossary] Generated definition for "${term.term}" using Exa /answer (transformed to glossary format)`);

            const answerCost = calculateExaAnswerCost(1);
            batchCostBreakdown.exa.total += answerCost;
            batchCostBreakdown.exa.answer.cost += answerCost;
            batchCostBreakdown.exa.answer.queries += 1;

            continue;
          } else {
            console.warn(`[glossary] Failed to transform Exa answer for "${term.term}", falling back to LLM`);
          }
        }
      } catch (err: unknown) {
        console.error("[worker] error:", String(err));
      }
    }

    termsForLLM.push(term);
  }

  if (termsForLLM.length > 0) {
    const systemPrompt = GLOSSARY_DEFINITION_SYSTEM_PROMPT;

    const termsList = termsForLLM
      .map((term) => `- ${term.term}${term.is_acronym ? ' (acronym)' : ''} - ${term.category}`)
      .join('\n');

    const userPrompt = createGlossaryDefinitionUserPrompt(
      termsList,
      researchContext,
      importantDetails
    );

    try {
      const modelLower = genModel.toLowerCase();
      const isO1Model = modelLower.startsWith('o1');
      const isGpt5Model = modelLower.includes('gpt-5') || modelLower.startsWith('gpt5');
      const onlySupportsDefaultTemp = isO1Model || isGpt5Model;
      const supportsCustomTemperature = !onlySupportsDefaultTemp;

      if (onlySupportsDefaultTemp) {
        console.log(
          `[glossary] Model "${genModel}" only supports default temperature (1), skipping custom temperature setting`
        );
      }

      const requestOptions: ChatCompletionRequest = {
        model: genModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      };

      if (supportsCustomTemperature) {
        requestOptions.temperature = 0.5;
      }

      const response = await openai.chat.completions.create(requestOptions) as OpenAI.Chat.Completions.ChatCompletion;

      if (response.usage) {
        const usage = response.usage;
        const cost = calculateOpenAICost(usage, genModel, false);
        batchCostBreakdown.openai.total += cost;
        batchCostBreakdown.openai.chat_completions.push({
          cost,
          usage: {
            prompt_tokens: usage.prompt_tokens,
            completion_tokens: usage.completion_tokens ?? 0,
            total_tokens: usage.total_tokens ?? usage.prompt_tokens + (usage.completion_tokens ?? 0),
          },
          model: genModel,
        });
      }

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from LLM');
      }

      const parsed: unknown = JSON.parse(content);
      const llmDefinitions =
        (parsed as { definitions?: unknown; terms?: unknown }).definitions ??
        (parsed as { definitions?: unknown; terms?: unknown }).terms ??
        [];

      if (!Array.isArray(llmDefinitions)) {
        throw new Error('LLM did not return array of definitions');
      }

      const normalizedLLMDefinitions = normalizeGlossaryDefinitions(llmDefinitions);

      definitions.push(...normalizedLLMDefinitions);
    } catch (err: unknown) {
      console.error("[worker] error:", String(err));
    }
  }

  if (costBreakdown) {
    costBreakdown.openai.total += batchCostBreakdown.openai.total;
    costBreakdown.openai.chat_completions.push(...batchCostBreakdown.openai.chat_completions);
    costBreakdown.exa.total += batchCostBreakdown.exa.total;
    costBreakdown.exa.answer.cost += batchCostBreakdown.exa.answer.cost;
    costBreakdown.exa.answer.queries += batchCostBreakdown.exa.answer.queries;
  }

  return { definitions, batchCostBreakdown };
}

async function transformExaAnswerToGlossary(
  term: GlossaryPlanTerm,
  exaAnswer: string,
  sourceUrl: string | undefined,
  openai: OpenAI,
  genModel: string
): Promise<TermDefinition | null> {
  try {
    const systemPrompt = EXA_ANSWER_TRANSFORM_SYSTEM_PROMPT;
    const termDescriptor = `- ${term.term}${term.is_acronym ? ' (acronym)' : ''} - ${term.category}`;
    const userPrompt = createExaAnswerTransformUserPrompt(termDescriptor, exaAnswer);

    const modelLower = genModel.toLowerCase();
    const isO1Model = modelLower.startsWith('o1');
    const isGpt5Model = modelLower.includes('gpt-5') || modelLower.startsWith('gpt5');
    const onlySupportsDefaultTemp = isO1Model || isGpt5Model;
    const supportsCustomTemperature = !onlySupportsDefaultTemp;

    const requestOptions: ChatCompletionRequest = {
      model: genModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    };

    if (supportsCustomTemperature) {
      requestOptions.temperature = 0.3;
    }

    const response = await openai.chat.completions.create(requestOptions) as OpenAI.Chat.Completions.ChatCompletion;
    const content = response.choices[0]?.message?.content;

    if (!content) {
      console.warn(`[glossary] Empty response when transforming Exa answer for "${term.term}"`);
      return null;
    }

    try {
      const parsed = JSON.parse(content) as {
        term?: string;
        definition?: string;
        acronym_for?: string;
        category?: string;
        usage_examples?: string[];
        related_terms?: string[];
      };

      if (!parsed.definition || !parsed.definition.trim()) {
        console.warn(
          `[glossary] Missing definition in transformed Exa answer for "${term.term}"`
        );
        return null;
      }

      return {
        term: parsed.term || term.term,
        definition: parsed.definition.trim(),
        acronym_for: parsed.acronym_for || undefined,
        category: parsed.category || term.category,
        usage_examples: parsed.usage_examples || [],
        related_terms: parsed.related_terms || [],
        confidence_score: 0.9,
        source: 'exa',
        source_url: sourceUrl,
      };
    } catch (err: unknown) {
      console.error("[worker] error:", String(err));
    }
    return null;
  } catch (err: unknown) {
    console.error("[worker] error:", String(err));
  }
  return null;
}

