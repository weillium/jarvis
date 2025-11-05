import { useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * Mutation hooks for all POST/PUT/DELETE operations
 * These replace manual mutation handlers with React Query's useMutation
 */

// ============================================================================
// Context & Blueprint Mutations
// ============================================================================

/**
 * Approve blueprint mutation
 */
export function useApproveBlueprintMutation(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/context/${eventId}/blueprint`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || 'Failed to approve blueprint');
      }
      return data;
    },
    onSuccess: () => {
      // Invalidate agent and blueprint queries to refetch updated data
      queryClient.invalidateQueries({ queryKey: ['agent', eventId] });
      queryClient.invalidateQueries({ queryKey: ['blueprint', eventId] });
    },
  });
}

/**
 * Reset context mutation
 */
export function useResetContextMutation(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/context/${eventId}/reset`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || 'Failed to reset context');
      }
      return data;
    },
    onSuccess: () => {
      // Invalidate agent query to refetch updated status
      queryClient.invalidateQueries({ queryKey: ['agent', eventId] });
    },
  });
}

/**
 * Start context generation mutation
 */
export function useStartContextGenerationMutation(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/context/${eventId}/start`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || 'Failed to start context generation');
      }
      return data;
    },
    onSuccess: () => {
      // Invalidate agent query to show updated status
      queryClient.invalidateQueries({ queryKey: ['agent', eventId] });
    },
  });
}

/**
 * Regenerate blueprint mutation
 */
export function useRegenerateBlueprintMutation(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/context/${eventId}/blueprint/regenerate`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || 'Failed to regenerate blueprint');
      }
      return data;
    },
    onSuccess: () => {
      // Invalidate agent and blueprint queries
      queryClient.invalidateQueries({ queryKey: ['agent', eventId] });
      queryClient.invalidateQueries({ queryKey: ['blueprint', eventId] });
    },
  });
}

/**
 * Regenerate stage mutation (research, glossary, chunks)
 */
export function useRegenerateStageMutation(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (stage: 'research' | 'glossary' | 'chunks') => {
      const res = await fetch(`/api/context/${eventId}/regenerate?stage=${stage}`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || `Failed to regenerate ${stage}`);
      }
      return data;
    },
    onSuccess: () => {
      // Invalidate agent query to show updated status
      queryClient.invalidateQueries({ queryKey: ['agent', eventId] });
    },
  });
}

/**
 * Start or regenerate mutation (conditional endpoint based on hasBlueprint)
 * Used by regenerate-button component
 */
export function useStartOrRegenerateMutation(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ stage, hasBlueprint }: { stage: 'blueprint' | 'research' | 'glossary' | 'chunks'; hasBlueprint: boolean }) => {
      let endpoint = '';
      if (stage === 'blueprint') {
        // If no blueprint, start generation; otherwise regenerate
        endpoint = hasBlueprint 
          ? `/api/context/${eventId}/blueprint/regenerate`
          : `/api/context/${eventId}/start`;
      } else {
        endpoint = `/api/context/${eventId}/regenerate?stage=${stage}`;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || `Failed to ${hasBlueprint ? 'regenerate' : 'start'} ${stage}`);
      }
      return data;
    },
    onSuccess: () => {
      // Invalidate agent query to show updated status
      queryClient.invalidateQueries({ queryKey: ['agent', eventId] });
      // Invalidate blueprint query if it was a blueprint operation
      queryClient.invalidateQueries({ queryKey: ['blueprint', eventId] });
    },
  });
}

// ============================================================================
// Agent Session Mutations
// ============================================================================

/**
 * Create agent sessions mutation
 */
export function useCreateSessionsMutation(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/agent-sessions/${eventId}/create`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || 'Failed to create sessions');
      }
      return data;
    },
    onSuccess: () => {
      // Invalidate agent query to reflect status change (context_complete -> testing)
      queryClient.invalidateQueries({ queryKey: ['agent', eventId] });
    },
  });
}

/**
 * Start agent sessions mutation
 */
export function useStartSessionsMutation(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/agent-sessions/${eventId}/start`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || 'Failed to start sessions');
      }
      return data;
    },
    onSuccess: () => {
      // Invalidate agent query to reflect status change
      queryClient.invalidateQueries({ queryKey: ['agent', eventId] });
    },
  });
}

/**
 * Pause agent sessions mutation
 */
export function usePauseSessionsMutation(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/agent-sessions/${eventId}/pause`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || 'Failed to pause sessions');
      }
      return data;
    },
    onSuccess: () => {
      // Invalidate agent query to reflect status change
      queryClient.invalidateQueries({ queryKey: ['agent', eventId] });
    },
  });
}

/**
 * Resume agent sessions mutation
 */
export function useResumeSessionsMutation(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/agent-sessions/${eventId}/resume`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || 'Failed to resume sessions');
      }
      return data;
    },
    onSuccess: () => {
      // Invalidate agent query to reflect status change
      queryClient.invalidateQueries({ queryKey: ['agent', eventId] });
    },
  });
}

/**
 * Confirm ready mutation
 */
export function useConfirmReadyMutation(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/agent-sessions/${eventId}/confirm-ready`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || 'Failed to confirm ready');
      }
      return data;
    },
    onSuccess: () => {
      // Invalidate agent query (testing -> ready)
      queryClient.invalidateQueries({ queryKey: ['agent', eventId] });
    },
  });
}

/**
 * Send test transcript mutation
 */
export function useSendTestTranscriptMutation(eventId: string) {
  return useMutation({
    mutationFn: async ({ text, speaker }: { text: string; speaker: string }) => {
      const res = await fetch(`/api/agent-sessions/${eventId}/test-transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, speaker }),
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || 'Failed to send test transcript');
      }
      return data;
    },
  });
}

// ============================================================================
// Event Mutations
// ============================================================================

/**
 * Update event mutation
 */
export function useUpdateEventMutation(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updateData: {
      title?: string;
      topic?: string | null;
      start_time?: string | null;
      end_time?: string | null;
    }) => {
      const res = await fetch(`/api/events/${eventId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Failed to update event');
      }
      return result.data;
    },
    onSuccess: () => {
      // Invalidate event query to refetch updated data
      queryClient.invalidateQueries({ queryKey: ['event', eventId] });
    },
  });
}

