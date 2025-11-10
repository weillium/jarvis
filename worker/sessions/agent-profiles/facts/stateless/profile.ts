import type { StatelessSessionProfile } from '../../../session-adapters/stateless/profile-types';
import type { RealtimeMessageContext } from '../../../session-adapters/types';
import type { OpenAIService } from '../../../../services/openai-service';
import {
  resolveModelOrThrow,
  resolveModelSetFromEnv,
} from '../../../../services/model-management/model-resolver';
import { PromptFactsGenerator } from './generator';

const FACTS_HISTORY_KEY = 'facts:history';
const WORKER_MODEL_SET = resolveModelSetFromEnv();
const FALLBACK_FACTS_MODEL = resolveModelOrThrow({
  modelKey: 'runtime.facts_generation',
  modelSet: WORKER_MODEL_SET,
});

interface FactsStatelessProfileDeps {
  openaiService: OpenAIService;
}

export const factsStatelessProfile: StatelessSessionProfile<FactsStatelessProfileDeps> = {
  agentType: 'facts',
  resolveModel: (hint) => hint ?? FALLBACK_FACTS_MODEL,
  createHooks: ({ config, deps, emit, log, storage }) => {
    if (!deps?.openaiService) {
      throw new Error('Facts stateless profile requires openaiService dependency');
    }

    const generator = new PromptFactsGenerator({
      openaiService: deps.openaiService,
    });

    const persistHistory = (
      message: string,
      context: RealtimeMessageContext | undefined,
      generatedFactsCount: number
    ): void => {
      storage.set(FACTS_HISTORY_KEY, {
        latestMessage: message,
        context,
        generatedFactsCount,
        recordedAt: new Date().toISOString(),
        model: config.model ?? FALLBACK_FACTS_MODEL,
      });
    };

    return {
      onSessionStart: ({ storage: sessionStorage }) => {
        sessionStorage.clear();
      },
      onSessionClose: ({ storage: sessionStorage }) => {
        sessionStorage.clear();
      },
      onSendMessage: async ({ message, context }) => {
        log('log', 'Facts stateless session generating output', {
          hasContext: Boolean(context),
        });

        try {
          const result = await generator.generate({
            recentTranscript: message,
            existingFacts: context?.facts ?? null,
            glossaryContext:
              typeof context?.glossaryContext === 'string'
                ? context.glossaryContext
                : undefined,
          });

          persistHistory(message, context, result.generatedFacts.length);

          if (result.generatedFacts.length > 0) {
            emit('facts', result.generatedFacts);
          }
        } catch (err: unknown) {
          log('error', 'Facts stateless session failed to generate output', {
            error: String(err),
          });
          persistHistory(message, context, 0);
        }
      },
    };
  },
};


