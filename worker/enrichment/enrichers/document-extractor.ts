/**
 * Document Extractor Enricher
 * Extracts text from uploaded documents (PDF, DOCX, etc.)
 * 
 * PLACEHOLDER: Implementation pending
 * TODO: Add PDF extraction using pdf-parse or similar
 * TODO: Add DOCX extraction using mammoth or similar
 * TODO: Add text extraction from Supabase Storage files
 */

import type { PostgrestResponse } from '@supabase/supabase-js';
import { BaseEnricher } from './base-enricher';
import type { EnrichmentResult } from '../types';
import type { WorkerSupabaseClient } from '../../services/supabase';
import { extractDocumentBatch } from '../../lib/documents/document-extraction';

interface EventDocumentRow {
  id: string;
  path: string;
  file_type: string | null;
  name?: string | null;
}

export class DocumentExtractor extends BaseEnricher {
  name = 'document_extractor';

  private readonly maxDocuments = 10;

  constructor(private readonly supabase: WorkerSupabaseClient) {
    super();
  }

  async enrich(
    eventId: string,
    eventTitle: string,
    eventTopic: string | null
  ): Promise<EnrichmentResult[]> {
    void eventTitle;
    void eventTopic;
    console.log(`[enrichment/${this.name}] Starting document extraction for event ${eventId}`);

    // TODO: Handle pagination when large numbers of documents exist
    try {
      const docsResponse: PostgrestResponse<EventDocumentRow> = await this.supabase
        .from('event_docs')
        .select('id, path, file_type, name')
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });
      const { data: docs, error } = docsResponse;

      if (error) {
        console.error(`[enrichment/${this.name}] error:`, String(error));
        return [];
      }

      if (!docs || docs.length === 0) {
        console.log(`[enrichment/${this.name}] No documents to extract for event ${eventId}`);
        return [];
      }

      console.log(
        `[enrichment/${this.name}] Retrieved ${docs.length} document(s); attempting extraction`
      );

      const extracted = await extractDocumentBatch(this.supabase, docs, {
        maxDocuments: this.maxDocuments,
      });

      if (extracted.length === 0) {
        console.log(`[enrichment/${this.name}] No text extracted from documents for event ${eventId}`);
        return [];
      }

      console.log(
        `[enrichment/${this.name}] Extracted text from ${extracted.length} document(s) for event ${eventId}`
      );

      return extracted.map((item): EnrichmentResult => {
        const metadata = {
          enricher: this.name,
          document_id: item.doc.id,
          document_path: item.doc.path,
          file_type: item.doc.file_type,
          document_name: item.doc.name,
          extracted_at: new Date().toISOString(),
        };

        return {
          chunks: [item.text],
          metadata,
          source: this.name,
          qualityScore: 0.7,
        };
      });
    } catch (err: unknown) {
      console.error(`[enrichment/${this.name}] error:`, String(err));
      return [];
    }
  }
}

