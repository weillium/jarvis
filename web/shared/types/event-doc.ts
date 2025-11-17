export interface EventDoc {
  id: string;
  event_id: string;
  path: string;
  name: string | null;
  file_type: 'pdf' | 'document' | 'image' | 'spreadsheet' | 'presentation' | 'archive' | 'other';
  created_at: string;
}

