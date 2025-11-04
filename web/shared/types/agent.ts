// Context generation statuses (new workflow)
export type ContextGenerationStatus = 
  | 'idle'                    // Agent created but context generation not started
  | 'blueprint_generating'    // Generating context blueprint
  | 'blueprint_ready'         // Blueprint generated, awaiting user approval
  | 'blueprint_approved'      // User approved, research starting
  | 'researching'             // Executing deep research plan
  | 'building_glossary'        // Constructing glossary knowledge base
  | 'building_chunks'         // Constructing vector database chunks
  | 'context_complete'        // Context generation complete
  | 'testing';                // Sessions generated, ready for testing

// Legacy statuses (backward compatibility - 'ready' is deprecated, use 'context_complete' instead)
export type LegacyAgentStatus = 'prepping' | 'ready' | 'running' | 'ended' | 'error';

// Combined agent status type
export type AgentStatus = ContextGenerationStatus | LegacyAgentStatus;

export interface Agent {
  id: string;
  event_id: string;
  status: AgentStatus;
  model: string;
  created_at: string;
}

