export interface GlossaryTerm {
  id: string;
  event_id: string;
  
  // Term definition
  term: string;
  definition: string;
  acronym_for: string | null; // If term is an acronym, what it stands for
  
  // Categorization
  category: string | null; // e.g., 'technical', 'business', 'domain-specific'
  
  // Usage context
  usage_examples: string[] | null;
  related_terms: string[] | null;
  
  // Quality and source
  confidence_score: number | null; // 0-1
  source: string | null; // 'exa', 'document', 'llm_generation', 'wikipedia'
  source_url: string | null;
  
  // Metadata
  created_at: string;
  updated_at: string;
}

export type GlossaryCategory = 'technical' | 'business' | 'domain-specific' | 'acronym' | 'other';

