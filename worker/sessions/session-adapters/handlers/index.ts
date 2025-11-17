import type { AgentHandler, AgentHandlerOptions } from '../types';
import { CardsAgentHandler } from './cards-handler';
import { FactsAgentHandler } from './facts-handler';
import { TranscriptAgentHandler } from './transcript-handler';

type AgentTypeKey = AgentHandlerOptions['context']['agentType'];

const handlerFactories: Record<AgentTypeKey, (options: AgentHandlerOptions) => AgentHandler> =
  {
    cards: (opts: AgentHandlerOptions): AgentHandler => new CardsAgentHandler(opts),
    facts: (opts: AgentHandlerOptions): AgentHandler => new FactsAgentHandler(opts),
    transcript: (opts: AgentHandlerOptions): AgentHandler =>
      new TranscriptAgentHandler(opts),
  };

export const createAgentHandler = (options: AgentHandlerOptions): AgentHandler => {
  const factory = handlerFactories[options.context.agentType];
  return factory(options);
};

