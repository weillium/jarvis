import type OpenAI from 'openai';
import type {
  AgentRealtimeSession,
  AgentType,
  RealtimeSessionConfig,
} from './session-adapters';
import type { OpenAIService } from '../services/openai-service';
import { agentTransportProfiles } from './agent-profiles/registry';
import type { AgentTransportProfiles } from './agent-profiles/registry';
import { RealtimeAgentSession } from './session-adapters/realtime/driver';
import { createStatelessAgentSession } from './session-adapters/stateless/driver';

export type AgentProfileTransport = 'stateless' | 'realtime';

export interface AgentProfileDeps {
  openaiService: OpenAIService;
}

export interface AgentProfile {
  defaultTransport: AgentProfileTransport;
  availableTransports: AgentProfileTransport[];
  description?: string;
  createSession: (
    openai: OpenAI,
    config: RealtimeSessionConfig,
    deps: AgentProfileDeps,
    transportOverride?: AgentProfileTransport
  ) => AgentRealtimeSession;
}

export type AgentProfileRegistry = Record<AgentType, AgentProfile>;

const resolveStatelessProfileDeps = (
  agentType: AgentType,
  deps: AgentProfileDeps
): unknown => {
  if (agentType === 'cards') {
    return { openaiService: deps.openaiService };
  }
  return undefined;
};

const instantiateSession = (
  agentType: AgentType,
  profiles: AgentTransportProfiles,
  openai: OpenAI,
  config: RealtimeSessionConfig,
  deps: AgentProfileDeps,
  transportOverride?: AgentProfileTransport
): AgentRealtimeSession => {
  const transport =
    transportOverride ??
    (profiles.defaultTransport as AgentProfileTransport);

  if (transport === 'realtime') {
    const realtimeProfile = profiles.transports.realtime;
    if (!realtimeProfile) {
      throw new Error(`${agentType} does not support realtime transport`);
    }
    return new RealtimeAgentSession(openai, config, realtimeProfile);
  }

  const statelessProfile = profiles.transports.stateless;
  if (!statelessProfile) {
    throw new Error(`${agentType} does not support stateless transport`);
  }

  return createStatelessAgentSession({
    openai,
    config,
    profile: statelessProfile,
    profileDeps: resolveStatelessProfileDeps(agentType, deps),
    logLabel: agentType,
  });
};

const buildAgentProfile = (
  agentType: AgentType,
  transportProfiles: AgentTransportProfiles,
  availableTransports: AgentProfileTransport[]
): AgentProfile => ({
  defaultTransport: transportProfiles.defaultTransport as AgentProfileTransport,
  availableTransports,
  description: transportProfiles.description,
  createSession: (openai, config, deps, transportOverride) =>
    instantiateSession(agentType, transportProfiles, openai, config, deps, transportOverride),
});

export const defaultAgentProfiles: AgentProfileRegistry = {
  cards: buildAgentProfile('cards', agentTransportProfiles.cards, ['realtime', 'stateless']),
  transcript: buildAgentProfile('transcript', agentTransportProfiles.transcript, ['realtime']),
  facts: buildAgentProfile('facts', agentTransportProfiles.facts, ['stateless']),
};

