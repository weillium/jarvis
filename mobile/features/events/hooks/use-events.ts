import { useCallback, useEffect, useState } from "react";
import { supabase } from "lib/supabase";
import { EventWithStatus } from "../components/event-card";

export interface UseEventsResult {
    events: EventWithStatus[];
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
}

function calculateEventStatus(event: any): "scheduled" | "live" | "ended" {
    const now = new Date();
    const startTime = event.start_time ? new Date(event.start_time) : null;
    const endTime = event.end_time ? new Date(event.end_time) : null;

    if (!startTime) {
        return "scheduled";
    }

    if (endTime && now > endTime) {
        return "ended";
    }

    if (startTime && now >= startTime && (!endTime || now <= endTime)) {
        return "live";
    }

    return "scheduled";
}

export function useEvents(): UseEventsResult {
    const [events, setEvents] = useState<EventWithStatus[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchEvents = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                setEvents([]);
                return;
            }

            const { data, error: queryError } = await supabase
                .from("events")
                .select(
                    "id, owner_uid, title, topic, start_time, end_time, created_at",
                )
                .eq("owner_uid", user.id)
                .order("created_at", { ascending: false })
                .limit(50);

            if (queryError) {
                throw queryError;
            }

            if (data) {
                const mappedEvents = data.map((event) => ({
                    ...event,
                    status: calculateEventStatus(event),
                })) as EventWithStatus[];
                setEvents(mappedEvents);
            }
        } catch (err: any) {
            console.error("Error fetching events:", err);
            setError(err.message || "Failed to fetch events");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchEvents();
    }, [fetchEvents]);

    return {
        events,
        loading,
        error,
        refetch: fetchEvents,
    };
}
