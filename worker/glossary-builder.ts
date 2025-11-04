/**
 * Glossary Builder
 * Builds glossary from blueprint plan and research results
 * Stores terms, definitions, acronyms, and related metadata in glossary_terms table
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { Exa } from 'exa-js';
import { Blueprint } from './blueprint-generator';

export interface GlossaryBuilderOptions {
  supabase: ReturnType<typeof createClient>;
  openai: OpenAI;
  genModel: string;
  embedModel: string;
  exaApiKey?: string; // Optional Exa API key for authoritative definitions
}

export interface ResearchResults {
  chunks: Array<{
    text: string;
    source: string;
    metadata?: Record<string, any>;
  }>;
}

/**
 * Build glossary from blueprint plan and research results
 * Fetches research from research_results table if not provided
 */
export async function buildGlossary(
  eventId: string,
  blueprintId: string,
  generationCycleId: string,
  blueprint: Blueprint,
  researchResults: ResearchResults | null,
  options: GlossaryBuilderOptions
): Promise<number> {
  const { supabase, openai, genModel, exaApiKey } = options;

  console.log(`[glossary] Building glossary for event ${eventId}, cycle ${generationCycleId}`);
  console.log(`[glossary] Blueprint has ${blueprint.glossary_plan.terms.length} terms planned`);

  const termsToBuild = blueprint.glossary_plan.terms || [];
  if (termsToBuild.length === 0) {
    console.log(`[glossary] No terms to build, skipping`);
    return 0;
  }

  // Fetch research from research_results table if not provided
  let research: ResearchResults;
  if (!researchResults) {
    const { data: researchData, error: researchError } = await (supabase
      .from('research_results') as any)
      .select('content, metadata, query, api')
      .eq('event_id', eventId)
      .eq('blueprint_id', blueprintId)
      .eq('is_active', true);

    if (researchError) {
      console.warn(`[glossary] Warning: Failed to fetch research results: ${researchError.message}`);
    }

    research = {
      chunks: (researchData || []).map((item: any) => ({
        text: item.content,
        source: item.api || 'research',
        metadata: item.metadata || {},
      })),
    };
  } else {
    research = researchResults;
  }

  // Soft delete existing glossary terms (mark as inactive)
  const { error: softDeleteError } = await (supabase
    .from('glossary_terms') as any)
    .update({
      is_active: false,
      deleted_at: new Date().toISOString(),
    })
    .eq('event_id', eventId)
    .eq('is_active', true);

  if (softDeleteError) {
    console.warn(`[glossary] Warning: Failed to soft delete existing terms: ${softDeleteError.message}`);
  }

  // Extract context from research results
  const researchContext = research.chunks
    .map(c => c.text)
    .join('\n\n')
    .substring(0, 10000); // Limit context size

  let insertedCount = 0;

  // Update generation cycle progress
  const { error: cycleError } = await (supabase
    .from('generation_cycles') as any)
    .update({
      status: 'processing',
      progress_total: termsToBuild.length,
    })
    .eq('id', generationCycleId);

  // Process terms in batches to avoid rate limits
  const batchSize = 5;
  for (let i = 0; i < termsToBuild.length; i += batchSize) {
    const batch = termsToBuild.slice(i, i + batchSize);
    
    try {
      const definitions = await generateTermDefinitions(
        batch,
        researchContext,
        blueprint.important_details.join('\n'),
        openai,
        genModel,
        exaApiKey ? new Exa(exaApiKey) : undefined
      );

      // Store definitions in database
      for (const def of definitions) {
        try {
          const { error } = await (supabase
            .from('glossary_terms') as any)
            .insert({
              event_id: eventId,
              generation_cycle_id: generationCycleId,
              term: def.term,
              definition: def.definition,
              acronym_for: def.acronym_for || null,
              category: def.category || 'general',
              usage_examples: def.usage_examples || [],
              related_terms: def.related_terms || [],
              confidence_score: def.confidence_score || 0.8,
              source: def.source || 'llm_generation',
              source_url: def.source_url || null,
              is_active: true,
              version: 1,
            });

          if (error) {
            console.error(`[glossary] Error inserting term "${def.term}": ${error.message}`);
          } else {
            insertedCount++;
            // Update progress
            await (supabase
              .from('generation_cycles') as any)
              .update({ progress_current: insertedCount })
              .eq('id', generationCycleId);
          }
        } catch (error: any) {
          console.error(`[glossary] Error processing term "${def.term}": ${error.message}`);
        }
      }
    } catch (error: any) {
      console.error(`[glossary] Error processing batch: ${error.message}`);
    }
  }

  // Mark cycle as completed
  await (supabase
    .from('generation_cycles') as any)
    .update({
      status: 'completed',
      progress_current: insertedCount,
      completed_at: new Date().toISOString(),
    })
    .eq('id', generationCycleId);

  console.log(`[glossary] Inserted ${insertedCount} glossary terms for event ${eventId}`);
  return insertedCount;
}

interface TermDefinition {
  term: string;
  definition: string;
  acronym_for?: string;
  category: string;
  usage_examples?: string[];
  related_terms?: string[];
  confidence_score?: number;
  source?: string;
  source_url?: string;
}

/**
 * Generate definitions for terms using Exa /answer for high-priority terms, LLM for others
 */
async function generateTermDefinitions(
  terms: Array<{ term: string; is_acronym: boolean; category: string; priority: number }>,
  researchContext: string,
  importantDetails: string,
  openai: OpenAI,
  genModel: string,
  exa?: Exa
): Promise<TermDefinition[]> {
  const definitions: TermDefinition[] = [];
  const termsForLLM: Array<{ term: string; is_acronym: boolean; category: string; priority: number }> = [];

  // Process high-priority terms (priority <= 3) with Exa /answer if available
  for (const term of terms) {
    if (term.priority <= 3 && exa) {
      try {
        console.log(`[glossary] Using Exa /answer for high-priority term (priority ${term.priority}): ${term.term}`);
        
        const answer = await exa.answer(`What is ${term.term}?`, {
          text: true,
          systemPrompt: `Provide a comprehensive, technical definition suitable for professionals. 
                        If this is an acronym, explain what it stands for. 
                        Include relevant context and related concepts.`,
        });

        if (answer.answer && answer.answer.trim()) {
          // Extract source URL from citations if available
          const sourceUrl = answer.citations && answer.citations.length > 0 
            ? answer.citations[0].url 
            : undefined;

          // Transform Exa markdown answer into structured glossary format using LLM
          const transformedDef = await transformExaAnswerToGlossary(
            term.term,
            term.is_acronym,
            term.category,
            answer.answer.trim(),
            sourceUrl,
            openai,
            genModel
          );

          if (transformedDef) {
            definitions.push(transformedDef);
            console.log(`[glossary] Generated definition for "${term.term}" using Exa /answer (transformed to glossary format)`);
            continue; // Skip LLM generation for this term
          } else {
            console.warn(`[glossary] Failed to transform Exa answer for "${term.term}", falling back to LLM`);
            // Fall through to LLM generation
          }
        }
      } catch (exaError: any) {
        console.warn(`[glossary] Exa /answer failed for term "${term.term}": ${exaError.message}. Falling back to LLM.`);
        // Fall through to LLM generation
      }
    }

    // Add to LLM batch if Exa wasn't used or failed
    termsForLLM.push(term);
  }

  // Generate remaining terms with LLM
  if (termsForLLM.length > 0) {
    const systemPrompt = `You are a glossary assistant that creates clear, accurate definitions for technical and domain-specific terms.

Your task: Generate definitions for terms based on research context and event information.

Guidelines:
- Create concise, clear definitions (1-3 sentences)
- If a term is an acronym, provide what it stands for
- Include 1-2 usage examples when helpful
- Identify related terms
- Assign confidence score (0.9-1.0 if highly certain, 0.7-0.9 if somewhat certain)
- Use "llm_generation" as source

Output format: Return a JSON array of term definitions.`;

    const termsList = termsForLLM.map(t => `- ${t.term}${t.is_acronym ? ' (acronym)' : ''} - ${t.category}`).join('\n');

    const userPrompt = `Generate definitions for the following terms:

${termsList}

Research Context:
${researchContext.substring(0, 5000)}

Important Event Details:
${importantDetails.substring(0, 2000)}

For each term, provide:
- term: The exact term name
- definition: Clear definition (1-3 sentences)
- acronym_for: What the term stands for (if it's an acronym, otherwise omit)
- category: Category (e.g., technical, business, domain-specific)
- usage_examples: Array of 1-2 example sentences (optional)
- related_terms: Array of related term names (optional)
- confidence_score: Number between 0 and 1
- source: "llm_generation"

Return as JSON object with a "definitions" key containing an array of term definitions.`;

    try {
      // Some models (like o1, o1-preview, o1-mini, gpt-5) don't support custom temperature values
      // Only set temperature if model supports custom values
      // Check for models that only support default temperature (1) or don't support it at all
      const modelLower = genModel.toLowerCase();
      const isO1Model = modelLower.startsWith('o1');
      const isGpt5Model = modelLower.includes('gpt-5') || modelLower.startsWith('gpt5');
      const onlySupportsDefaultTemp = isO1Model || isGpt5Model;
      const supportsCustomTemperature = !onlySupportsDefaultTemp;
      
      if (onlySupportsDefaultTemp) {
        console.log(`[glossary] Model "${genModel}" only supports default temperature (1), skipping custom temperature setting`);
      }
      
      // Build request options - conditionally include temperature
      const requestOptions: any = {
        model: genModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      };
      
      // Only add temperature if model supports custom temperature values
      if (supportsCustomTemperature) {
        requestOptions.temperature = 0.5; // Lower temperature for more consistent definitions
      }
      
      const response = await openai.chat.completions.create(requestOptions);

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from LLM');
      }

      const parsed = JSON.parse(content);
      // Handle both "definitions" and "terms" keys (json_object format always returns object)
      const llmDefinitions = parsed.definitions || parsed.terms || [];

      if (!Array.isArray(llmDefinitions)) {
        throw new Error('LLM did not return array of definitions');
      }

      // Validate and normalize definitions
      const normalizedLLMDefinitions = llmDefinitions.map((def: any) => ({
        term: def.term || '',
        definition: def.definition || '',
        acronym_for: def.acronym_for || undefined,
        category: def.category || 'general',
        usage_examples: def.usage_examples || [],
        related_terms: def.related_terms || [],
        confidence_score: def.confidence_score || 0.8,
        source: def.source || 'llm_generation',
        source_url: def.source_url || undefined,
      }));

      definitions.push(...normalizedLLMDefinitions);
    } catch (error: any) {
      console.error(`[glossary] Error generating LLM definitions: ${error.message}`);
      // Return basic definitions on error
      const fallbackDefinitions = termsForLLM.map(t => ({
        term: t.term,
        definition: `Term: ${t.term}. Definition to be completed.`,
        category: t.category,
        confidence_score: 0.5,
        source: 'llm_generation',
      }));
      definitions.push(...fallbackDefinitions);
    }
  }

  return definitions;
}

/**
 * Transform Exa markdown answer into structured glossary format
 * Extracts clean definition, usage examples, and related terms
 */
async function transformExaAnswerToGlossary(
  term: string,
  isAcronym: boolean,
  category: string,
  exaAnswer: string,
  sourceUrl: string | undefined,
  openai: OpenAI,
  genModel: string
): Promise<TermDefinition | null> {
  try {
    const systemPrompt = `You are a glossary assistant that transforms authoritative answers into structured glossary entries.

Your task: Transform a markdown-formatted answer (which may contain links, formatting, and citations) into a clean, structured glossary entry.

Guidelines:
- Extract a clean definition (1-3 sentences) without markdown formatting or links
- If the term is an acronym, extract what it stands for
- Generate 1-2 usage examples based on the answer content
- Extract related terms mentioned in the answer (2-5 terms)
- Preserve the authoritative nature of the source material
- Remove markdown links, formatting, and citations from the definition text

Output format: Return a JSON object with this exact structure:
{
  "term": "exact term name",
  "definition": "clean definition without markdown (1-3 sentences)",
  "acronym_for": "what it stands for (if acronym, otherwise omit this field)",
  "category": "category name",
  "usage_examples": ["example sentence 1", "example sentence 2"],
  "related_terms": ["term1", "term2", "term3"]
}`;

    const userPrompt = `Transform this Exa answer into a structured glossary entry:

Term: ${term}
Is Acronym: ${isAcronym}
Category: ${category}

Exa Answer (markdown):
${exaAnswer}

Extract:
1. A clean definition (remove markdown, links, citations)
2. Acronym expansion (if applicable)
3. 1-2 usage examples based on the answer
4. 2-5 related terms mentioned in the answer

Return as JSON object.`;

    // Some models (like o1, o1-preview, o1-mini, gpt-5) don't support custom temperature values
    const modelLower = genModel.toLowerCase();
    const isO1Model = modelLower.startsWith('o1');
    const isGpt5Model = modelLower.includes('gpt-5') || modelLower.startsWith('gpt5');
    const onlySupportsDefaultTemp = isO1Model || isGpt5Model;
    const supportsCustomTemperature = !onlySupportsDefaultTemp;

    const requestOptions: any = {
      model: genModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    };

    if (supportsCustomTemperature) {
      requestOptions.temperature = 0.3; // Low temperature for consistent transformation
    }

    const response = await openai.chat.completions.create(requestOptions);
    const content = response.choices[0]?.message?.content;

    if (!content) {
      console.warn(`[glossary] Empty response when transforming Exa answer for "${term}"`);
      return null;
    }

    try {
      const parsed = JSON.parse(content) as {
        term?: string;
        definition?: string;
        acronym_for?: string;
        category?: string;
        usage_examples?: string[];
        related_terms?: string[];
      };

      if (!parsed.definition || !parsed.definition.trim()) {
        console.warn(`[glossary] Missing definition in transformed Exa answer for "${term}"`);
        return null;
      }

      return {
        term: parsed.term || term,
        definition: parsed.definition.trim(),
        acronym_for: parsed.acronym_for || undefined,
        category: parsed.category || category,
        usage_examples: parsed.usage_examples || [],
        related_terms: parsed.related_terms || [],
        confidence_score: 0.9, // High confidence for Exa answers
        source: 'exa',
        source_url: sourceUrl,
      };
    } catch (parseError: any) {
      console.warn(`[glossary] Failed to parse transformed Exa answer for "${term}": ${parseError.message}`);
      return null;
    }
  } catch (error: any) {
    console.warn(`[glossary] Error transforming Exa answer for "${term}": ${error.message}`);
    return null;
  }
}
