import type { WorkerSupabaseClient } from './types';

export const extractDocumentsText = async (
  eventId: string,
  supabase: WorkerSupabaseClient
): Promise<string> => {
  try {
    const { data: docs, error } = await supabase
      .from('event_docs')
      .select('id, path')
      .eq('event_id', eventId);

    if (error) {
      console.warn(`[blueprint] Error fetching documents: ${error.message}`);
      return '';
    }

    if (!docs || docs.length === 0) {
      console.log(`[blueprint] No documents found for event ${eventId}`);
      return '';
    }

    console.log(`[blueprint] Found ${docs.length} document(s) for event ${eventId}`);
    return `[${docs.length} document(s) uploaded - text extraction will be available in full implementation]`;
  } catch (err: unknown) {
    console.error('[blueprint-generator] error:', String(err));
  }

  return '';
};

