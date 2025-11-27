import { createServerClient } from "@/shared/lib/supabase/server";

export type ContextDataResult<T> = {
    data: T | null;
    error?: string;
    message?: string;
};

/**
 * Fetch blueprint for an event directly from the database
 */
export async function getBlueprintForEvent(
    eventId: string,
): Promise<ContextDataResult<any>> {
    try {
        const supabase = await createServerClient();

        // Find agent for this event
        const { data: agents, error: agentError } = await supabase
            .from("agents")
            .select("id")
            .eq("event_id", eventId)
            .limit(1);

        if (agentError) {
            console.error("[data/context] Error fetching agent:", agentError);
            return {
                data: null,
                error: `Failed to fetch agent: ${agentError.message}`,
            };
        }

        if (!agents || agents.length === 0) {
            return { data: null, error: "No agent found for this event" };
        }

        const agentId = agents[0].id;

        // Fetch blueprint for this agent
        const { data: blueprint, error: blueprintError } = await supabase
            .from("context_blueprints")
            .select("*")
            .eq("agent_id", agentId)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

        if (blueprintError) {
            if (blueprintError.code === "PGRST116") {
                return {
                    data: null,
                    message: "No blueprint found for this event",
                };
            }

            console.error(
                "[data/context] Error fetching blueprint:",
                blueprintError,
            );
            return {
                data: null,
                error: `Failed to fetch blueprint: ${blueprintError.message}`,
            };
        }

        return { data: blueprint };
    } catch (error: any) {
        console.error("[data/context] Unexpected error:", error);
        return { data: null, error: error?.message || "Internal server error" };
    }
}

/**
 * Fetch research results for an event directly from the database
 */
export async function getResearchForEvent(
    eventId: string,
    options: { search?: string; apiFilter?: string } = {},
): Promise<
    ContextDataResult<
        {
            results: any[];
            count: number;
            byApi: Record<string, number>;
            avgQualityScore: number;
        }
    >
> {
    try {
        const { search, apiFilter } = options;
        const supabase = await createServerClient();

        // Fetch active cycles
        const { data: activeCycles, error: cycleError } = await supabase
            .from("generation_cycles")
            .select("id")
            .eq("event_id", eventId)
            .neq("status", "superseded")
            .in("cycle_type", ["research"]);

        if (cycleError) {
            console.warn(
                "[data/context] Warning: Failed to fetch active cycles:",
                cycleError.message,
            );
        }

        const activeCycleIds: string[] = [];
        if (activeCycles && activeCycles.length > 0) {
            activeCycleIds.push(
                ...activeCycles.map((c: { id: string }) => c.id),
            );
        }

        let query = supabase
            .from("research_results")
            .select(
                "id, query, api, content, source_url, quality_score, metadata, created_at, generation_cycle_id",
            )
            .eq("event_id", eventId);

        if (activeCycleIds.length > 0) {
            query = query.or(
                `generation_cycle_id.is.null,generation_cycle_id.in.(${
                    activeCycleIds.join(",")
                })`,
            );
        } else {
            query = query.is("generation_cycle_id", null);
        }

        if (apiFilter && apiFilter.trim() !== "") {
            query = query.eq("api", apiFilter);
        }

        if (search && search.trim() !== "") {
            query = query.or(
                `query.ilike.%${search}%,content.ilike.%${search}%`,
            );
        }

        const { data: results, error } = await query
            .order("created_at", { ascending: false })
            .limit(200);

        if (error) {
            console.error(
                "[data/context] Error fetching research results:",
                error,
            );
            return {
                data: null,
                error: `Failed to fetch research results: ${error.message}`,
            };
        }

        // Calculate statistics
        const byApi: Record<string, number> = {};
        let totalQuality = 0;
        let qualityCount = 0;

        (results || []).forEach((result: any) => {
            byApi[result.api] = (byApi[result.api] || 0) + 1;
            if (result.quality_score !== null) {
                totalQuality += result.quality_score;
                qualityCount++;
            }
        });

        const avgQualityScore = qualityCount > 0
            ? totalQuality / qualityCount
            : 0;

        return {
            data: {
                results: results || [],
                count: (results || []).length,
                byApi,
                avgQualityScore,
            },
        };
    } catch (error: any) {
        console.error("[data/context] Unexpected error:", error);
        return { data: null, error: error?.message || "Internal server error" };
    }
}

/**
 * Fetch glossary terms for an event directly from the database
 */
export async function getGlossaryForEvent(
    eventId: string,
    options: { category?: string; search?: string } = {},
): Promise<
    ContextDataResult<
        {
            terms: any[];
            count: number;
            grouped_by_category: Record<string, any[]>;
        }
    >
> {
    try {
        const { category, search } = options;
        const supabase = await createServerClient();

        // Fetch active cycles
        const { data: activeCycles, error: cycleError } = await supabase
            .from("generation_cycles")
            .select("id")
            .eq("event_id", eventId)
            .neq("status", "superseded")
            .in("cycle_type", ["glossary"]);

        if (cycleError) {
            console.warn(
                "[data/context] Warning: Failed to fetch active cycles:",
                cycleError.message,
            );
        }

        const activeCycleIds: string[] = [];
        if (activeCycles && activeCycles.length > 0) {
            activeCycleIds.push(
                ...activeCycles.map((c: { id: string }) => c.id),
            );
        }

        let query = supabase
            .from("glossary_terms")
            .select(
                "id, term, definition, acronym_for, category, usage_examples, related_terms, confidence_score, source, source_url, created_at, generation_cycle_id, agent_utility",
            )
            .eq("event_id", eventId);

        if (activeCycleIds.length > 0) {
            query = query.or(
                `generation_cycle_id.is.null,generation_cycle_id.in.(${
                    activeCycleIds.join(",")
                })`,
            );
        } else {
            query = query.is("generation_cycle_id", null);
        }

        query = query.order("confidence_score", {
            ascending: false,
            nullsFirst: false,
        })
            .order("term", { ascending: true });

        if (category) {
            query = query.eq("category", category);
        }

        if (search && search.length > 0) {
            query = query.or(
                `term.ilike.%${search}%,definition.ilike.%${search}%,acronym_for.ilike.%${search}%`,
            );
        }

        const { data: terms, error } = await query.limit(200);

        if (error) {
            console.error("[data/context] Error fetching glossary:", error);
            return {
                data: null,
                error: `Failed to fetch glossary: ${error.message}`,
            };
        }

        let filteredTerms = terms || [];

        const groupedByCategory: Record<string, typeof filteredTerms> = {};
        filteredTerms = filteredTerms.map((term: any) => ({
            ...term,
            agent_utility: Array.isArray(term.agent_utility)
                ? term.agent_utility
                : [],
        }));

        filteredTerms.forEach((term: any) => {
            const cat = term.category || "uncategorized";
            if (!groupedByCategory[cat]) {
                groupedByCategory[cat] = [];
            }
            groupedByCategory[cat].push(term);
        });

        return {
            data: {
                terms: filteredTerms,
                count: filteredTerms.length,
                grouped_by_category: groupedByCategory,
            },
        };
    } catch (error: any) {
        console.error("[data/context] Unexpected error:", error);
        return { data: null, error: error?.message || "Internal server error" };
    }
}
