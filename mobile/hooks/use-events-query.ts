import { useQuery } from '@tanstack/react-query';
import { getEvents, GetEventsOptions, GetEventsResult } from '@/lib/api/events';
import { EventWithStatus } from '@/types/event';

export interface UseEventsQueryOptions {
  search?: string;
  status?: 'all' | 'scheduled' | 'live' | 'ended';
  page?: number;
  limit?: number;
  enabled?: boolean;
  initialData?: GetEventsResult;
}

export interface UseEventsQueryResult {
  events: EventWithStatus[];
  total: number;
  page: number;
  limit: number;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * React Query hook for events list
 */
export function useEventsQuery(options: UseEventsQueryOptions = {}): UseEventsQueryResult {
  const {
    search,
    status = 'all',
    page = 1,
    limit = 20,
    enabled = true,
    initialData,
  } = options;

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['events', search, status, page, limit],
    queryFn: async () => {
      const result = await getEvents({
        search: search || undefined,
        status,
        page,
        limit,
      });

      if (result.error) {
        throw new Error(result.error);
      }

      return result;
    },
    enabled,
    initialData: initialData && !search && status === 'all' && page === 1 && limit === (initialData.limit ?? 20)
      ? initialData
      : undefined,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes cache
  });

  return {
    events: data?.data ?? [],
    total: data?.total ?? 0,
    page: data?.page ?? page,
    limit: data?.limit ?? limit,
    isLoading,
    error: error ? (error instanceof Error ? error.message : 'Unknown error') : null,
    refetch: () => {
      refetch();
    },
  };
}



