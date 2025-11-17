import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/shared/lib/supabase/client';
import type { Card } from '@/shared/types/card';

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
      queryClient.invalidateQueries({ queryKey: ['blueprint-full', eventId] });
      queryClient.invalidateQueries({ queryKey: ['context-status', eventId] });
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
      // Invalidate agent query and all context-related queries to refetch updated status
      queryClient.invalidateQueries({ queryKey: ['agent', eventId] });
      queryClient.invalidateQueries({ queryKey: ['context-status', eventId] });
      queryClient.invalidateQueries({ queryKey: ['blueprint', eventId] });
      queryClient.invalidateQueries({ queryKey: ['blueprint-full', eventId] });
      queryClient.invalidateQueries({ queryKey: ['research', eventId] });
      queryClient.invalidateQueries({ queryKey: ['glossary', eventId] });
      queryClient.invalidateQueries({ queryKey: ['context-database', eventId] });
    },
  });
}

/**
 * Start context generation mutation (consolidated - handles both start and regenerate)
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
      // Invalidate agent and blueprint queries to show updated status
      queryClient.invalidateQueries({ queryKey: ['agent', eventId] });
      queryClient.invalidateQueries({ queryKey: ['blueprint', eventId] });
      queryClient.invalidateQueries({ queryKey: ['blueprint-full', eventId] });
      queryClient.invalidateQueries({ queryKey: ['context-status', eventId] });
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
    onSuccess: (_, stage) => {
      // Invalidate agent query to show updated status
      queryClient.invalidateQueries({ queryKey: ['agent', eventId] });
      queryClient.invalidateQueries({ queryKey: ['context-status', eventId] });
      
      // Invalidate stage-specific queries
      if (stage === 'research') {
        queryClient.invalidateQueries({ queryKey: ['research', eventId] });
      } else if (stage === 'glossary') {
        queryClient.invalidateQueries({ queryKey: ['glossary', eventId] });
      } else if (stage === 'chunks') {
        queryClient.invalidateQueries({ queryKey: ['context-database', eventId] });
      }
    },
  });
}

// ============================================================================
// Cards Moderation Mutations
// ============================================================================

export function useUpdateCardActiveStatusMutation(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ cardId, isActive, reason }: { cardId: string; isActive: boolean; reason?: string }) => {
      const res = await fetch(`/api/cards/${eventId}/moderate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cardId, isActive, reason }),
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || 'Failed to update card status');
      }
      return { cardId, isActive };
    },
    onSuccess: (_, { cardId, isActive }) => {
      queryClient.setQueryData<Card[]>(['cards', eventId], (previous = []) => {
        if (!Array.isArray(previous)) return previous;
        if (!isActive) {
          return previous.filter((card) => card.id !== cardId);
        }
        return previous;
      });
    },
  });
}

/**
 * Start or regenerate mutation (consolidated endpoint)
 * Used by regenerate-button component
 * 
 * For blueprint operations, delegates to useStartContextGenerationMutation to avoid duplication.
 * For other stages (research, glossary, chunks), uses the regenerate endpoint.
 */
export function useStartOrRegenerateMutation(eventId: string) {
  const queryClient = useQueryClient();
  // Always call the blueprint mutation hook (React rules), but only use it when stage is 'blueprint'
  const blueprintMutation = useStartContextGenerationMutation(eventId);

  return useMutation({
    mutationFn: async ({ stage }: { stage: 'blueprint' | 'research' | 'glossary' | 'chunks'; hasBlueprint: boolean }) => {
      // For blueprint, reuse the blueprint mutation's logic
      if (stage === 'blueprint') {
        return blueprintMutation.mutateAsync(undefined);
      }
      
      // For other stages, use the regenerate endpoint
      const endpoint = `/api/context/${eventId}/regenerate?stage=${stage}`;
      const res = await fetch(endpoint, {
        method: 'POST',
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || `Failed to regenerate ${stage}`);
      }
      return data;
    },
    onSuccess: (_, variables) => {
      // Invalidate agent query to show updated status
      queryClient.invalidateQueries({ queryKey: ['agent', eventId] });
      queryClient.invalidateQueries({ queryKey: ['context-status', eventId] });
      
      // Invalidate blueprint query if it was a blueprint operation
      if (variables.stage === 'blueprint') {
        queryClient.invalidateQueries({ queryKey: ['blueprint', eventId] });
        queryClient.invalidateQueries({ queryKey: ['blueprint-full', eventId] });
      } else if (variables.stage === 'research') {
        queryClient.invalidateQueries({ queryKey: ['research', eventId] });
      } else if (variables.stage === 'glossary') {
        queryClient.invalidateQueries({ queryKey: ['glossary', eventId] });
      } else if (variables.stage === 'chunks') {
        queryClient.invalidateQueries({ queryKey: ['context-database', eventId] });
      }
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
      queryClient.invalidateQueries({ queryKey: ['agent-sessions', eventId] });
    },
  });
}

/**
 * Start agent sessions mutation
 */
export function useStartSessionsMutation(
  eventId: string
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (agents: { transcript: boolean; cards: boolean; facts: boolean }) => {
      const res = await fetch(`/api/agent-sessions/${eventId}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ agents }),
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
      queryClient.invalidateQueries({ queryKey: ['agent-sessions', eventId] });
    },
  });
}

/**
 * Reset agent sessions mutation
 */
export function useResetSessionsMutation(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/agent-sessions/${eventId}/reset`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || 'Failed to reset sessions');
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent', eventId] });
      queryClient.invalidateQueries({ queryKey: ['agent-sessions', eventId] });
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
      queryClient.invalidateQueries({ queryKey: ['agent-sessions', eventId] });
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
      queryClient.invalidateQueries({ queryKey: ['agent-sessions', eventId] });
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
 * Create event mutation
 */
export function useCreateEventMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (eventData: {
      owner_uid: string;
      title: string;
      topic?: string | null;
      start_time?: string | null;
      end_time?: string | null;
    }) => {
      const { data, error } = await supabase.functions.invoke('orchestrator', {
        body: {
          action: 'create_event_and_agent',
          payload: {
            owner_uid: eventData.owner_uid,
            title: eventData.title,
            topic: eventData.topic || null,
            start_time: eventData.start_time || null,
            end_time: eventData.end_time || null,
          },
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to create event');
      }

      if (!data?.ok || !data?.event) {
        throw new Error(data?.error || 'Failed to create event');
      }

      return data.event as { id: string };
    },
    onSuccess: () => {
      // Invalidate events list query to show new event
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
  });
}

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

// ============================================================================
// Event Document Mutations
// ============================================================================

/**
 * Update event document name mutation
 */
export function useUpdateEventDocNameMutation(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ docId, name }: { docId: string; name: string }) => {
      const { data, error } = await supabase
        .from('event_docs')
        .update({ name: name.trim() })
        .eq('id', docId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update document name: ${error.message}`);
      }

      if (!data) {
        throw new Error(`Document with ID ${docId} not found or could not be updated`);
      }

      return data;
    },
    onSuccess: () => {
      // Invalidate event docs query
      queryClient.invalidateQueries({ queryKey: ['event-docs', eventId] });
    },
  });
}

/**
 * Delete event document mutation
 */
export function useDeleteEventDocMutation(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (docId: string) => {
      // Get doc path first
      const { data: doc, error: fetchError } = await supabase
        .from('event_docs')
        .select('path')
        .eq('id', docId)
        .single();

      if (fetchError || !doc) {
        throw new Error('Document not found');
      }

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('event-docs')
        .remove([doc.path]);

      if (storageError) {
        throw new Error(`Failed to delete file from storage: ${storageError.message}`);
      }

      // Delete from database
      const { error: dbError } = await supabase
        .from('event_docs')
        .delete()
        .eq('id', docId);

      if (dbError) {
        throw new Error(`Failed to delete document record: ${dbError.message}`);
      }
    },
    onSuccess: () => {
      // Invalidate event docs query
      queryClient.invalidateQueries({ queryKey: ['event-docs', eventId] });
    },
  });
}

