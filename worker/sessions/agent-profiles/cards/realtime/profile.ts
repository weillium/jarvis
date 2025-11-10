import type { RealtimeSessionProfile } from '../../../session-adapters/realtime/profile-types';
import { createPassthroughAudioHooks } from '../../../session-adapters/realtime/runtime-controller';
import { CardsAgentHandler } from '../../../session-adapters/handlers/cards-handler';
import { getPolicy } from '../../../../policies';
import { getCardsRealtimeTooling } from '../tooling';
import {
  resolveModelOrThrow,
  resolveModelSetFromEnv,
} from '../../../../services/model-management/model-resolver';

const WORKER_MODEL_SET = resolveModelSetFromEnv();
const DEFAULT_REALTIME_MODEL = resolveModelOrThrow({
  modelKey: 'runtime.realtime',
  modelSet: WORKER_MODEL_SET,
});

export const cardsRealtimeProfile: RealtimeSessionProfile = {
  agentType: 'cards',
  getConnectionIntent: (config) => {
    const model = config.model ?? DEFAULT_REALTIME_MODEL;
    return { model };
  },
  resolveModel: (hint) => hint ?? DEFAULT_REALTIME_MODEL,
  createSessionConfiguration: ({ config, log }) => {
    const policy = getPolicy('cards');
    const { tools, sessionUpdateEvent } = getCardsRealtimeTooling(policy);
    log('log', `Sending session config with ${tools.length} tools`, {
      toolCount: tools.length,
      agentType: config.agentType,
    });
    return {
      event: sessionUpdateEvent,
      logContext: {
        toolCount: tools.length,
      },
    };
  },
  createAgentHandler: (options) => new CardsAgentHandler(options),
  createRuntimeHooks: createPassthroughAudioHooks,
};


