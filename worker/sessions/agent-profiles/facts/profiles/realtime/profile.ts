import type { RealtimeSessionProfile } from '../../../../session-adapters/realtime/profile-types';

export const factsRealtimeProfile: RealtimeSessionProfile = {
  agentType: 'facts',
  getConnectionIntent: () => {
    throw new Error('Facts agent does not support realtime transport');
  },
  createSessionConfiguration: () => {
    throw new Error('Facts agent does not support realtime transport');
  },
  createAgentHandler: () => {
    throw new Error('Facts agent does not support realtime transport');
  },
};


