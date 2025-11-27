"use server";

import { createServerClient } from "@/shared/lib/supabase/server";
import { requireAuth, requireEventOwnership } from "@/shared/lib/auth";
import type { FactAuditAction, FactAuditLogEntry } from "@/shared/types/fact";

export async function updateFactActiveStatus(
  eventId: string,
  factKey: string,
  isActive: boolean,
  options?: {
    reason?: string;
    payloadBefore?: Record<string, unknown> | null;
    payloadAfter?: Record<string, unknown> | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!factKey) {
      return { ok: false, error: "Fact key is required" };
    }

    const supabase = await createServerClient();
    const user = await requireAuth(supabase);

    // Parallelize ownership check and fetching current state
    const [ownershipCheck, beforeRowResult] = await Promise.all([
      requireEventOwnership(supabase, user.id, eventId),
      supabase
        .from("facts")
        .select("fact_value, is_active")
        .eq("event_id", eventId)
        .eq("fact_key", factKey)
        .maybeSingle(),
    ]);

    // Check if ownership check failed (it throws, so if we are here it passed, but good to be explicit if we change implementation)
    // requireEventOwnership throws on error, so we don't need to check result here.

    const { data: beforeRow, error: beforeError } = beforeRowResult;

    if (beforeError) {
      return { ok: false, error: beforeError.message };
    }

    // Perform update
    const { error } = await supabase
      .from("facts")
      .update({ is_active: isActive })
      .eq("event_id", eventId)
      .eq("fact_key", factKey);

    if (error) {
      return { ok: false, error: error.message };
    }

    // Log audit asynchronously (fire and forget from the perspective of the UI response,
    // but we await it to ensure it runs in the serverless function lifetime)
    // To speed up response, we could potentially not await this, but Vercel might kill the process.
    // However, the update is already done, so the UI can update.

    const action: FactAuditAction = isActive ? "reactivated" : "deactivated";
    const { reason, payloadBefore, payloadAfter } = options ?? {};
    const inferredAfter = isActive ? beforeRow?.fact_value ?? null : null;

    const { error: auditError } = await supabase.from("facts_audit_log").insert(
      {
        event_id: eventId,
        fact_key: factKey,
        action,
        actor_id: user.id,
        reason: reason ?? null,
        payload_before: payloadBefore ?? beforeRow?.fact_value ?? null,
        payload_after: payloadAfter ?? inferredAfter,
      },
    );

    if (auditError) {
      console.error(
        "[fact-actions] Failed to insert audit log entry",
        auditError,
      );
    }

    return { ok: true };
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message
      : "Unknown error";
    return { ok: false, error: errorMessage };
  }
}

export async function getFactAuditLog(
  eventId: string,
  factKey: string,
): Promise<{ data: FactAuditLogEntry[] | null; error?: string }> {
  try {
    const supabase = await createServerClient();
    const user = await requireAuth(supabase);
    await requireEventOwnership(supabase, user.id, eventId);

    const { data, error } = await supabase
      .from("facts_audit_log")
      .select(
        "id, event_id, fact_key, action, actor_id, reason, payload_before, payload_after, created_at",
      )
      .eq("event_id", eventId)
      .eq("fact_key", factKey)
      .order("created_at", { ascending: false });

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data ?? [], error: undefined };
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message
      : "Unknown error";
    return { data: null, error: errorMessage };
  }
}
