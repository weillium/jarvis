/**
 * Utility function to add timeout to promises
 * @param promise - The promise to wrap with timeout
 * @param timeoutMs - Timeout in milliseconds
 * @param errorMessage - Custom error message (optional)
 * @returns Promise that rejects if timeout is exceeded
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage?: string
): Promise<T> {
  const timeoutPromise = new Promise<T>((_, reject) => {
    setTimeout(() => {
      reject(
        new Error(
          errorMessage ||
            `Operation timed out after ${timeoutMs / 1000} seconds`
        )
      );
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

