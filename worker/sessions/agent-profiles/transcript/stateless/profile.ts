import type { StatelessSessionProfile } from '../../../session-adapters/stateless/profile-types';

export const transcriptStatelessProfile: StatelessSessionProfile = {
  agentType: 'transcript',
  createHooks: ({ log }) => ({
    onSendMessage: () => {
      const error = new Error('Transcript agent does not support stateless transport');
      log('warn', 'Transcript stateless transport invoked - this mode is not supported');
      return Promise.reject(error);
    },
  }),
};


