import type { ExtractedDocumentText } from '../../../lib/documents/document-extraction';
import { extractDocumentBatch } from '../../../lib/documents/document-extraction';
import type { WorkerSupabaseClient } from './types';

const MAX_DOCUMENTS_FOR_PROMPT = 3;
const MAX_SNIPPET_LENGTH = 600;

export interface BlueprintDocumentsSection {
  text: string;
  totalDocuments: number;
}

export const loadBlueprintDocumentsSection = async (
  eventId: string,
  supabase: WorkerSupabaseClient
): Promise<BlueprintDocumentsSection> => {
  try {
    const { data: docs, error } = await supabase
      .from('event_docs')
      .select('id, path, file_type, name')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn(`[blueprint] Error fetching documents: ${error.message}`);
      return { text: '', totalDocuments: 0 };
    }

    const allDocs = docs ?? [];

    if (allDocs.length === 0) {
      console.log(`[blueprint] No documents found for event ${eventId}`);
      return { text: '', totalDocuments: 0 };
    }

    const extracted = await extractDocumentBatch(
      supabase,
      allDocs,
      { maxDocuments: MAX_DOCUMENTS_FOR_PROMPT }
    );

    if (extracted.length === 0) {
      console.log(`[blueprint] Unable to extract text from documents for event ${eventId}`);
      return { text: '', totalDocuments: allDocs.length };
    }

    console.log(
      `[blueprint] Extracted text from ${extracted.length}/${allDocs.length} document(s) for event ${eventId}`
    );

    return {
      text: buildPromptSection(extracted),
      totalDocuments: allDocs.length,
    };
  } catch (err: unknown) {
    console.error('[blueprint-generator] error:', String(err));
  }

  return { text: '', totalDocuments: 0 };
};

export const extractDocumentsText = async (
  eventId: string,
  supabase: WorkerSupabaseClient
): Promise<string> => {
  const section = await loadBlueprintDocumentsSection(eventId, supabase);
  return section.text;
};

const buildPromptSection = (extractedDocs: ExtractedDocumentText[]): string => {
  return extractedDocs
    .map(({ doc, text }) => {
      const header = doc.name && doc.name.trim().length > 0 ? doc.name.trim() : doc.path;
      return `Document: ${header}\n${truncateForPrompt(text)}`;
    })
    .join('\n\n');
};

const truncateForPrompt = (content: string): string => {
  if (content.length <= MAX_SNIPPET_LENGTH) {
    return content;
  }
  return `${content.slice(0, MAX_SNIPPET_LENGTH)}…`;
};

