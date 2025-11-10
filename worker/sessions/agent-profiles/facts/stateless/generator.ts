import type { RealtimeFactDTO } from '../../../../types';
import type { Fact } from '../../../../state/facts-store';
import type { OpenAIService } from '../../../../services/openai-service';
import {
  FACTS_EXTRACTION_SYSTEM_PROMPT,
  createFactsExtractionUserPrompt,
} from '../../../../prompts';
import {
  isRecord,
  safeJsonParse,
} from '../../../session-adapters/shared/payload-utils';

interface FactsGenerationDeps {
  openaiService: OpenAIService;
}

interface FactsGenerationInput {
  recentTranscript: string;
  existingFacts?: Fact[] | Record<string, unknown> | string | null;
  glossaryContext?: string;
}

interface FactsGenerationResult {
  generatedFacts: RealtimeFactDTO[];
  rawResponse?: unknown;
}

const formatExistingFacts = (
  existingFacts: FactsGenerationInput['existingFacts']
): string => {
  if (!existingFacts) {
    return '[]';
  }

  if (typeof existingFacts === 'string') {
    return existingFacts;
  }

  try {
    return JSON.stringify(existingFacts, null, 2);
  } catch {
    return '[]';
  }
};

const formatTranscriptWindow = (
  recentTranscript: string,
  glossaryContext?: string
): string => {
  if (!glossaryContext) {
    return recentTranscript;
  }

  return `${recentTranscript}\n\nGlossary Context:\n${glossaryContext}`;
};

export class PromptFactsGenerator {
  constructor(private readonly deps: FactsGenerationDeps) {}

  async generate(input: FactsGenerationInput): Promise<FactsGenerationResult> {
    const existingFactsJson = formatExistingFacts(input.existingFacts);
    const transcriptWindow = formatTranscriptWindow(
      input.recentTranscript,
      input.glossaryContext
    );

    const response = await this.deps.openaiService.createChatCompletion(
      [
        { role: 'system', content: FACTS_EXTRACTION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: createFactsExtractionUserPrompt(
            transcriptWindow,
            existingFactsJson
          ),
        },
      ],
      {
        responseFormat: { type: 'json_object' },
        temperature: 0.5,
      }
    );

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return {
        generatedFacts: [],
        rawResponse: null,
      };
    }

    return {
      generatedFacts: this.parseFacts(content),
      rawResponse: content,
    };
  }

  private parseFacts(raw: string): RealtimeFactDTO[] {
    const parsed = safeJsonParse<unknown>(raw);
    if (!parsed) {
      return [];
    }

    if (Array.isArray(parsed)) {
      return this.normalizeFacts(parsed);
    }

    if (isRecord(parsed) && Array.isArray(parsed.facts)) {
      return this.normalizeFacts(parsed.facts);
    }

    if (isRecord(parsed)) {
      const single = this.normalizeFact(parsed);
      return single ? [single] : [];
    }

    return [];
  }

  private normalizeFacts(candidates: unknown[]): RealtimeFactDTO[] {
    return candidates
      .map((candidate) => this.normalizeFact(candidate))
      .filter((fact): fact is RealtimeFactDTO => fact !== null);
  }

  private normalizeFact(candidate: unknown): RealtimeFactDTO | null {
    if (!isRecord(candidate)) {
      return null;
    }

    const { key, value, confidence, ...rest } = candidate;
    if (typeof key !== 'string' || !('value' in candidate)) {
      return null;
    }

    const fact: RealtimeFactDTO = {
      key,
      value,
    };

    if (typeof confidence === 'number') {
      fact.confidence = confidence;
    }

    for (const [extraKey, extraValue] of Object.entries(rest)) {
      fact[extraKey] = extraValue;
    }

    return fact;
  }
}


