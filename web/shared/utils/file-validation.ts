/**
 * Maximum file size in bytes (50MB)
 */
export const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Validates file size
 * @param file - File to validate
 * @returns Error message if invalid, null if valid
 */
export function validateFileSize(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return `File "${file.name}" exceeds the maximum size of 50MB. Please upload a smaller file.`;
  }
  return null;
}

/**
 * Validates multiple files
 * @param files - Array of files to validate
 * @returns Array of error messages (one per invalid file), empty if all valid
 */
export function validateFiles(files: File[]): string[] {
  const errors: string[] = [];
  for (const file of files) {
    const error = validateFileSize(file);
    if (error) {
      errors.push(error);
    }
  }
  return errors;
}

