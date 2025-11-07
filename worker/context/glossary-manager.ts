import { GlossaryEntry } from '../types';
import { GlossaryRepository } from '../services/supabase/glossary-repository';

export class GlossaryManager {
  constructor(private readonly glossaryRepo: GlossaryRepository) {}

  async loadGlossary(eventId: string): Promise<Map<string, GlossaryEntry>> {
    const terms = await this.glossaryRepo.getGlossaryTerms(eventId);
    const cache = new Map<string, GlossaryEntry>();

    for (const term of terms) {
      cache.set(term.term.toLowerCase(), {
        term: term.term,
        definition: term.definition,
        acronym_for: term.acronym_for || undefined,
        category: term.category || undefined,
        usage_examples: term.usage_examples || [],
        related_terms: term.related_terms || [],
        confidence_score: term.confidence_score || 0.5,
      });
    }

    return cache;
  }

  extractRelevantTerms(text: string, glossaryCache: Map<string, GlossaryEntry>): GlossaryEntry[] {
    if (!glossaryCache || glossaryCache.size === 0) {
      return [];
    }

    const lowerText = text.toLowerCase();
    const words = lowerText.split(/\W+/).filter((w) => w.length > 2);
    const foundTerms = new Set<string>();
    const results: GlossaryEntry[] = [];

    for (const word of words) {
      const term = glossaryCache.get(word);
      if (term && !foundTerms.has(term.term.toLowerCase())) {
        foundTerms.add(term.term.toLowerCase());
        results.push(term);

        for (const related of term.related_terms || []) {
          const relatedTerm = glossaryCache.get(related.toLowerCase());
          if (relatedTerm && !foundTerms.has(relatedTerm.term.toLowerCase())) {
            foundTerms.add(relatedTerm.term.toLowerCase());
            results.push(relatedTerm);
          }
        }
      }
    }

    for (let i = 0; i < words.length - 1; i++) {
      for (let len = 2; len <= Math.min(4, words.length - i); len++) {
        const phrase = words.slice(i, i + len).join(' ');
        const term = glossaryCache.get(phrase);
        if (term && !foundTerms.has(term.term.toLowerCase())) {
          foundTerms.add(term.term.toLowerCase());
          results.push(term);
        }
      }
    }

    return results
      .sort((a, b) => (b.confidence_score || 0) - (a.confidence_score || 0))
      .slice(0, 15);
  }

  formatGlossaryContext(terms: GlossaryEntry[]): string {
    if (terms.length === 0) return '';

    const lines = terms.map((term) => {
      let line = `- ${term.term}: ${term.definition}`;
      if (term.acronym_for) {
        line += ` (Stands for: ${term.acronym_for})`;
      }
      if (term.category) {
        line += ` [${term.category}]`;
      }
      return line;
    });

    return `Glossary Definitions:\n${lines.join('\n')}`;
  }
}
