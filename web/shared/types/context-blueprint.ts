export type BlueprintStatus = 'generating' | 'ready' | 'approved' | 'superseded' | 'error';

export type QualityTier = 'basic' | 'comprehensive';

export interface ResearchPlan {
  queries: string[];
  apis: string[]; // e.g., ['exa', 'wikipedia']
  search_count: number;
  estimated_cost: number;
}

export interface GlossaryPlan {
  target_terms: string[];
  categories: string[];
  estimated_count: number;
}

export interface ChunksPlan {
  target_count: number;
  sources: string[];
  ranking_strategy: string;
}

export interface ContextBlueprint {
  id: string;
  event_id: string;
  agent_id: string;
  status: BlueprintStatus;
  
  // Full blueprint content
  blueprint: {
    important_details: string[];
    inferred_topics: string[];
    key_terms: string[];
    research_plan: ResearchPlan;
    glossary_plan: GlossaryPlan;
    chunks_plan: ChunksPlan;
  };
  
  // Extracted fields (for easy querying)
  important_details: string[] | null;
  inferred_topics: string[] | null;
  key_terms: string[] | null;
  
  // Research plan details
  research_plan: ResearchPlan | null;
  research_apis: string[] | null;
  research_search_count: number | null;
  estimated_cost: number | null;
  
  // Construction plan details
  glossary_plan: GlossaryPlan | null;
  chunks_plan: ChunksPlan | null;
  target_chunk_count: number | null;
  quality_tier: QualityTier;
  
  // Metadata
  created_at: string;
  approved_at: string | null;
  error_message: string | null;
}

