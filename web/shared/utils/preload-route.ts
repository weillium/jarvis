/**
 * Preload utilities for routes and their dependencies
 * Helps reduce compile time when navigating to routes
 */

/**
 * Preload critical dependencies for the create event page
 * This preloads the JavaScript chunks that will be needed
 * Uses dynamic imports to trigger webpack chunk loading
 */
export async function preloadCreateEventDependencies(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    // Preload dayjs and plugins using dynamic imports
    // This triggers webpack to load the chunks (based on our splitChunks config)
    // The chunks are already separated by webpack, so this just prefetches them
    const preloadPromises = [
      // These will load the 'dayjs' chunk (named by webpack config)
      import('dayjs').catch(() => {}),
      import('dayjs/plugin/utc').catch(() => {}),
      import('dayjs/plugin/timezone').catch(() => {}),
    ];

    // Note: UI components (DateTimePicker, MarkdownEditor, FileUpload) 
    // are already in the route bundle or will be loaded when the route loads
    // We don't need to preload them separately
    
    await Promise.all(preloadPromises);
  } catch (error) {
    // Silently fail - preloading is an optimization
    console.debug('Failed to preload create event dependencies:', error);
  }
}

/**
 * Preload route on hover/mouseenter for better UX
 * Call this in onMouseEnter handler
 */
export function preloadRouteOnHover(route: string): () => void {
  let preloaded = false;
  
  return () => {
    if (!preloaded) {
      preloaded = true;
      // Use requestIdleCallback for non-blocking preload
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => {
          preloadCreateEventDependencies();
        }, { timeout: 2000 });
      } else {
        // Fallback for browsers without requestIdleCallback
        setTimeout(() => preloadCreateEventDependencies(), 100);
      }
    }
  };
}

/**
 * Eagerly preload route dependencies (immediately, not on idle)
 * Use this for high-priority routes like the create event page
 */
export function eagerPreloadRoute(route: string): void {
  if (typeof window === 'undefined') return;
  
  // Preload dependencies in the background
  // Don't await - let it load asynchronously
  preloadCreateEventDependencies().catch(() => {
    // Silently fail
  });
}

