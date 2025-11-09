import pdfParse from 'pdf-parse';
import type { WorkerSupabaseClient } from '../../services/supabase';

const DOCUMENT_BUCKET = 'event-docs';
const SUPPORTED_EXTENSIONS = new Set(['txt', 'md', 'pdf']);
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB safety cap
const MAX_TEXT_LENGTH = 20_000;

export interface EventDocumentMetadata {
  id: string;
  path: string;
  file_type?: string | null;
  name?: string | null;
}

export interface ExtractedDocumentText {
  doc: EventDocumentMetadata;
  text: string;
}

export interface ExtractionOptions {
  maxDocuments?: number;
}

export const extractDocumentText = async (
  supabase: WorkerSupabaseClient,
  doc: EventDocumentMetadata
): Promise<string | null> => {
  const extension = getDocumentExtension(doc);

  if (!extension || !SUPPORTED_EXTENSIONS.has(extension)) {
    console.log(`[documents] Skipping unsupported document ${doc.id} (${extension || 'unknown'})`);
    return null;
  }

  try {
    const download = await supabase.storage.from(DOCUMENT_BUCKET).download(doc.path);

    if (download.error) {
      console.error('[documents] error:', String(download.error));
      return null;
    }

    if (!download.data) {
      console.warn(`[documents] Download returned empty data for document ${doc.id}`);
      return null;
    }

    const arrayBuffer = await download.data.arrayBuffer();

    if (arrayBuffer.byteLength === 0) {
      console.warn(`[documents] Document ${doc.id} is empty`);
      return null;
    }

    if (arrayBuffer.byteLength > MAX_FILE_BYTES) {
      console.warn(
        `[documents] Document ${doc.id} skipped because size ${arrayBuffer.byteLength} exceeds ${MAX_FILE_BYTES}`
      );
      return null;
    }

    const buffer = Buffer.from(arrayBuffer);
    const rawText = await parseBuffer(buffer, extension);
    const normalized = normalizeText(rawText);

    if (!normalized) {
      console.warn(`[documents] No extractable text found for document ${doc.id}`);
      return null;
    }

    return normalized;
  } catch (err: unknown) {
    console.error('[documents] error:', String(err));
    return null;
  }
};

export const extractDocumentBatch = async (
  supabase: WorkerSupabaseClient,
  docs: EventDocumentMetadata[],
  options: ExtractionOptions = {}
): Promise<ExtractedDocumentText[]> => {
  const { maxDocuments = docs.length } = options;
  const extracted: ExtractedDocumentText[] = [];

  for (const doc of docs.slice(0, maxDocuments)) {
    const text = await extractDocumentText(supabase, doc);
    if (text) {
      extracted.push({ doc, text });
    }
  }

  return extracted;
};

const getDocumentExtension = (doc: EventDocumentMetadata): string | null => {
  const fromFileType =
    typeof doc.file_type === 'string' && doc.file_type.trim().length > 0
      ? doc.file_type.trim().toLowerCase()
      : null;

  if (fromFileType && SUPPORTED_EXTENSIONS.has(fromFileType)) {
    return fromFileType;
  }

  const path = doc.path || '';
  const segment = path.split('/').pop() ?? '';
  const parts = segment.split('.');
  if (parts.length > 1) {
    return parts.pop()?.toLowerCase() ?? null;
  }
  return null;
};

const parseBuffer = async (buffer: Buffer, extension: string): Promise<string> => {
  if (extension === 'pdf') {
    const result = await pdfParse(buffer);
    return result.text ?? '';
  }

  return buffer.toString('utf8');
};

const normalizeText = (text: string | null | undefined): string | null => {
  if (!text) {
    return null;
  }

  const cleaned = text.replace(/\u0000/g, ' ').replace(/\r\n?/g, '\n').replace(/\s+\n/g, '\n').trim();

  if (!cleaned) {
    return null;
  }

  if (cleaned.length > MAX_TEXT_LENGTH) {
    return cleaned.slice(0, MAX_TEXT_LENGTH);
  }

  return cleaned;
};

