import type { RealtimeFactDTO } from '../../../../types';
import type { Fact } from '../../../../state/facts-store';
import type { OpenAIService } from '../../../../services/openai-service';
import { getPolicy } from '../../../../policies';
import { createFactsGenerationUserPrompt } from '../../../../prompts';
import { mapFactsPayload } from '../../../session-adapters/shared/payload-utils';
import { executeJsonPrompt } from '../../shared/json-prompt-runner';

interface FactsGenerationDeps {
  openaiService: OpenAIService;
  model?: string;
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

const formatTranscriptWindow = (recentTranscript: string): string => recentTranscript;

const normalizeGlossaryContext = (glossaryContext?: string): string | undefined => {
  if (!glossaryContext) {
    return undefined;
  }

  const trimmed = glossaryContext.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export class PromptFactsGenerator {
  constructor(private readonly deps: FactsGenerationDeps) {}

  async generate(input: FactsGenerationInput): Promise<FactsGenerationResult> {
    const existingFactsJson = formatExistingFacts(input.existingFacts);
    const policy = getPolicy('facts', 1);
    const transcriptWindow = formatTranscriptWindow(input.recentTranscript);
    const glossaryContext = normalizeGlossaryContext(input.glossaryContext);

    const userPrompt = createFactsGenerationUserPrompt({
      transcriptWindow,
      existingFactsJson,
      glossaryContext,
    });

    const { content, parsed } = await executeJsonPrompt({
      openaiService: this.deps.openaiService,
      model: this.deps.model,
      systemPrompt: policy,
      userPrompt,
      temperature: 0.5,
    });

    if (!content) {
      return {
        generatedFacts: [],
        rawResponse: null,
      };
    }

    const payloadSource = parsed ?? content;

    return {
      generatedFacts: this.parseFacts(payloadSource),
      rawResponse: payloadSource,
    };
  }

  private parseFacts(raw: unknown): RealtimeFactDTO[] {
    return mapFactsPayload(raw);
  }

}

