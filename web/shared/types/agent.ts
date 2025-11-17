// Agent lifecycle status (simplified - Phase 1)
export type AgentLifecycleStatus = 
  | 'idle'      // Not active (includes all workflow stages)
  | 'active'    // Processing (running or testing)
  | 'paused'    // Temporarily stopped
  | 'ended'     // Completed
  | 'error';    // Failed

// Agent workflow stage (Phase 1)
export type AgentStage = 
  | 'prepping'              // Legacy: automatic context building
  | 'blueprint'             // Blueprint generation
  | 'researching'           // Research phase
  | 'building_glossary'      // Glossary construction
  | 'building_chunks'       // Chunk construction
  | 'regenerating_research'  // Regenerating research
  | 'regenerating_glossary' // Regenerating glossary
  | 'regenerating_chunks'    // Regenerating chunks
  | 'context_complete'       // Context ready
  | 'testing'               // Testing sessions
  | 'ready'                 // Legacy: ready to start
  | 'running'                // Processing transcripts
  | null;                    // No stage

// Combined agent status type (for backward compatibility during migration)
export type AgentStatus = AgentLifecycleStatus;

export interface Agent {
  id: string;
  event_id: string;
  status: AgentStatus;
  stage: string | null;
  model_set: string;
  created_at: string;
}

