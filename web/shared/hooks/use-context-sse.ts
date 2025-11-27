"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useSSEStream } from "./use-sse-stream";
import type { SSEMessage } from "@/shared/types/card";

export interface UseContextSSEOptions {
    eventId: string;
    enabled?: boolean;
}

/**
 * Hook for connecting to SSE stream and automatically invalidating
 * React Query caches when context-related events occur.
 *
 * This ensures that components like BlueprintDisplay, ResearchResultsVisualization,
 * and GlossaryVisualization automatically refresh when the backend updates data.
 */
export function useContextSSE(
    { eventId, enabled = true }: UseContextSSEOptions,
) {
    const queryClient = useQueryClient();

    const handleMessage = (message: SSEMessage) => {
        // Invalidate queries based on message type
        switch (message.type) {
            case "blueprint_updated":
            case "blueprint_approved":
            case "blueprint_ready":
                console.log(
                    "[ContextSSE] Blueprint updated, invalidating queries",
                );
                queryClient.invalidateQueries({
                    queryKey: ["blueprint-full", eventId],
                });
                break;

            case "research_updated":
            case "research_complete":
                console.log(
                    "[ContextSSE] Research updated, invalidating queries",
                );
                queryClient.invalidateQueries({
                    queryKey: ["research", eventId],
                });
                break;

            case "glossary_updated":
            case "glossary_complete":
                console.log(
                    "[ContextSSE] Glossary updated, invalidating queries",
                );
                queryClient.invalidateQueries({
                    queryKey: ["glossary", eventId],
                });
                break;

            case "chunks_updated":
            case "chunks_complete":
                console.log(
                    "[ContextSSE] Chunks updated, invalidating queries",
                );
                // Invalidate context database queries if needed
                queryClient.invalidateQueries({
                    queryKey: ["context-chunks", eventId],
                });
                break;

            case "agent_status_changed":
            case "agent_stage_changed":
                console.log(
                    "[ContextSSE] Agent status/stage changed, invalidating agent queries",
                );
                queryClient.invalidateQueries({ queryKey: ["agent", eventId] });
                queryClient.invalidateQueries({
                    queryKey: ["context-status", eventId],
                });
                break;

            // Handle other message types as needed
            default:
                // Don't log for heartbeat or other frequent messages
                if (
                    message.type !== "heartbeat" && message.type !== "connected"
                ) {
                    console.log("[ContextSSE] Received message:", message.type);
                }
        }
    };

    return useSSEStream({
        eventId,
        onMessage: enabled ? handleMessage : undefined,
        onConnect: () => {
            console.log("[ContextSSE] Connected to SSE stream");
        },
        onDisconnect: () => {
            console.log("[ContextSSE] Disconnected from SSE stream");
        },
        onError: (error) => {
            console.error("[ContextSSE] SSE error:", error);
        },
    });
}
