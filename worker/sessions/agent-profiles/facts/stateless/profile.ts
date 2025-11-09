import type { StatelessSessionProfile } from '../../../session-adapters/stateless/profile-types';
import type { RealtimeMessageContext } from '../../../session-adapters/types';

const FACTS_HISTORY_KEY = 'facts:history';

export const factsStatelessProfile: StatelessSessionProfile = {
  agentType: 'facts',
  resolveModel: (hint) => hint ?? 'facts-stateless',
  createHooks: ({ emit, log, storage }) => ({
    onSessionStart: ({ storage: sessionStorage }) => {
      sessionStorage.clear();
    },
    onSessionClose: ({ storage: sessionStorage }) => {
      sessionStorage.clear();
    },
    onSendMessage: ({
      message,
      context,
    }: {
      message: string;
      context?: RealtimeMessageContext;
    }) => {
      log('log', 'Facts stateless session received message', {
        hasContext: Boolean(context),
      });

      storage.set(FACTS_HISTORY_KEY, {
        latestMessage: message,
        context,
        recordedAt: new Date().toISOString(),
      });

      emit('facts', []);

      return Promise.resolve();
    },
  }),
};


