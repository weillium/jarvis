/**
 * Get file extension from filename or path
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

/**
 * Get file type category based on extension
 */
export function getFileType(extension: string): 'pdf' | 'document' | 'image' | 'spreadsheet' | 'presentation' | 'archive' | 'other' {
  const ext = extension.toLowerCase();
  
  if (ext === 'pdf') return 'pdf';
  
  if (['doc', 'docx', 'txt', 'rtf', 'odt'].includes(ext)) return 'document';
  
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp'].includes(ext)) return 'image';
  
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return 'spreadsheet';
  
  if (['ppt', 'pptx', 'odp'].includes(ext)) return 'presentation';
  
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
  
  return 'other';
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Extract filename from storage path
 */
export function getFilenameFromPath(path: string): string {
  // Path format: eventId/timestamp-random.ext
  const parts = path.split('/');
  if (parts.length > 1) {
    return parts[parts.length - 1];
  }
  return path;
}
