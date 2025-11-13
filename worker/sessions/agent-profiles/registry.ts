import type { AgentType } from '../session-adapters/types';
import type { RealtimeSessionProfile } from '../session-adapters/realtime/profile-types';
import type { StatelessSessionProfile } from '../session-adapters/stateless/profile-types';
import { cardsAgentDefinition } from './cards';
import { transcriptAgentDefinition } from './transcript';
import { factsAgentDefinition } from './facts';
import { cardsRealtimeProfile } from './cards/profiles/realtime/profile';
import { cardsStatelessProfile } from './cards/profiles/stateless/profile';
import { transcriptRealtimeProfile } from './transcript/profiles/realtime/profile';
import { transcriptStatelessProfile } from './transcript/profiles/stateless/profile';
import { factsStatelessProfile } from './facts/profiles/stateless/profile';

export interface AgentTransportProfiles {
  defaultTransport: 'realtime' | 'stateless';
  transports: {
    realtime?: RealtimeSessionProfile;
    stateless?: StatelessSessionProfile;
  };
  description?: string;
}

export const agentTransportProfiles: Record<AgentType, AgentTransportProfiles> = {
  cards: {
    defaultTransport: cardsAgentDefinition.defaultTransport,
    description: cardsAgentDefinition.description,
    transports: {
      realtime: cardsRealtimeProfile,
      stateless: cardsStatelessProfile as StatelessSessionProfile,
    },
  },
  transcript: {
    defaultTransport: transcriptAgentDefinition.defaultTransport,
    description: transcriptAgentDefinition.description,
    transports: {
      realtime: transcriptRealtimeProfile,
      stateless: transcriptStatelessProfile,
    },
  },
  facts: {
    defaultTransport: factsAgentDefinition.defaultTransport,
    description: factsAgentDefinition.description,
    transports: {
      stateless: factsStatelessProfile as StatelessSessionProfile,
    },
  },
};


