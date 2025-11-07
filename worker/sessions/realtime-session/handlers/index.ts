import type { AgentHandler, AgentHandlerOptions } from '../types';
import { CardsAgentHandler } from './cards-handler';
import { FactsAgentHandler } from './facts-handler';
import { TranscriptAgentHandler } from './transcript-handler';

export const createAgentHandler = (options: AgentHandlerOptions): AgentHandler => {
  switch (options.context.agentType) {
    case 'cards':
      return new CardsAgentHandler(options);
    case 'facts':
      return new FactsAgentHandler(options);
    case 'transcript':
      return new TranscriptAgentHandler(options);
    default: {
      const exhaustiveCheck: never = options.context.agentType;
      throw new Error(`Unsupported agent type: ${exhaustiveCheck}`);
    }
  }
};

