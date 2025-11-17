import { CARDS_POLICY_V1 } from './cards';
import { FACTS_POLICY_V1 } from './facts';
import { TRANSCRIPT_POLICY_V1 } from './transcript';

export type PolicyAgentType = 'cards' | 'facts' | 'transcript';

const POLICY_REGISTRY: Record<PolicyAgentType, Record<number, string>> = {
  cards: {
    1: CARDS_POLICY_V1,
  },
  facts: {
    1: FACTS_POLICY_V1,
  },
  transcript: {
    1: TRANSCRIPT_POLICY_V1,
  },
};

const DEFAULT_VERSION: Record<PolicyAgentType, number> = {
  cards: 1,
  facts: 1,
  transcript: 1,
};

export function getPolicy(agentType: PolicyAgentType, version: number = DEFAULT_VERSION[agentType]): string {
  const agentPolicies = POLICY_REGISTRY[agentType];
  if (!agentPolicies) {
    throw new Error(`Unknown agent type: ${agentType}`);
  }

  const policy = agentPolicies[version] ?? agentPolicies[DEFAULT_VERSION[agentType]];
  if (!policy) {
    throw new Error(`No policy available for ${agentType} (requested v${version})`);
  }

  return policy;
}

export function getPolicyVersions(agentType: PolicyAgentType): number[] {
  return Object.keys(POLICY_REGISTRY[agentType] ?? {}).map((v) => Number(v)).sort((a, b) => a - b);
}


