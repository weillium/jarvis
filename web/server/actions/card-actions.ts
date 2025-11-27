"use server";

import { createServerClient } from "@/shared/lib/supabase/server";
import { requireAuth, requireEventOwnership } from "@/shared/lib/auth";
import type {
  Card,
  CardAuditAction,
  CardAuditLogEntry,
} from "@/shared/types/card";

export async function getCardsByEventId(
  eventId: string,
): Promise<{ data: Card[] | null; error: string | null }> {
  try {
    const supabase = await createServerClient();
    const user = await requireAuth(supabase);
    await requireEventOwnership(supabase, user.id, eventId);

    // Fetch active cards from the canonical cards table
    const { data, error } = await supabase
      .from("cards")
      .select(
        "card_id, event_id, payload, last_seen_seq, created_at, updated_at, card_kind, card_type, is_active",
      )
      .eq("event_id", eventId)
      .eq("is_active", true)
      .order("last_seen_seq", { ascending: false });

    if (error) {
      console.error("[card-actions] Error fetching cards:", error);
      return { data: null, error: error.message };
    }

    // Map to Card type
    const cards: Card[] = (data || []).map((row) => {
      const payload = row?.payload && typeof row.payload === "object"
        ? (row.payload as Record<string, unknown>)
        : null;

      const emittedAt = typeof row.updated_at === "string"
        ? row.updated_at
        : typeof row.created_at === "string"
        ? row.created_at
        : new Date().toISOString();

      const templateLabel =
        payload && typeof payload.template_label === "string" &&
          payload.template_label.trim().length > 0
          ? payload.template_label
          : null;
      const kind =
        (typeof row.card_kind === "string" && row.card_kind.length > 0
          ? row.card_kind
          : templateLabel) ?? "Context";

      return {
        id: row.card_id,
        event_id: row.event_id,
        emitted_at: emittedAt,
        kind,
        payload,
        is_active: row.is_active !== false,
        card_type: typeof row.card_type === "string"
          ? (row.card_type as Card["card_type"])
          : null,
        updated_at: typeof row.updated_at === "string"
          ? row.updated_at
          : undefined,
        last_seen_seq: typeof row.last_seen_seq === "number"
          ? row.last_seen_seq
          : null,
      };
    });

    console.log(
      `[card-actions] Fetched ${cards.length} cards for event ${eventId}`,
    );
    return { data: cards, error: null };
  } catch (error) {
    const errorMessage = error instanceof Error
      ? error.message
      : "Unknown error";
    console.error(
      "[card-actions] Exception fetching cards:",
      errorMessage,
      error,
    );
    return { data: null, error: errorMessage };
  }
}

export async function updateCardActiveStatus(
  eventId: string,
  cardId: string,
  isActive: boolean,
  options?: {
    reason?: string;
    payloadBefore?: Record<string, unknown> | null;
    payloadAfter?: Record<string, unknown> | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!cardId) {
      return { ok: false, error: "Card ID is required" };
    }

    const supabase = await createServerClient();
    const user = await requireAuth(supabase);

    // Parallelize ownership check and fetching current state
    const [ownershipCheck, beforeRowResult] = await Promise.all([
      requireEventOwnership(supabase, user.id, eventId),
      supabase
        .from("cards")
        .select("payload, is_active")
        .eq("event_id", eventId)
        .eq("card_id", cardId)
        .maybeSingle(),
    ]);

    const { data: beforeRow, error: beforeError } = beforeRowResult;

    if (beforeError) {
      return { ok: false, error: beforeError.message };
    }

    const { error } = await supabase
      .from("cards")
      .update({ is_active: isActive })
      .eq("event_id", eventId)
      .eq("card_id", cardId);

    if (error) {
      return { ok: false, error: error.message };
    }

    const action: CardAuditAction = isActive ? "reactivated" : "deactivated";

    const { reason, payloadBefore, payloadAfter } = options ?? {};
    const inferredAfter = isActive ? beforeRow?.payload ?? null : null;

    const { error: auditError } = await supabase.from("cards_audit_log").insert(
      {
        event_id: eventId,
        card_id: cardId,
        action,
        actor_id: user.id,
        reason: reason ?? null,
        payload_before: payloadBefore ?? beforeRow?.payload ?? null,
        payload_after: payloadAfter ?? inferredAfter,
      },
    );

    if (auditError) {
      console.error(
        "[card-actions] Failed to insert audit log entry",
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

export async function getCardAuditLog(
  eventId: string,
  cardId: string,
): Promise<{ data: CardAuditLogEntry[] | null; error?: string }> {
  try {
    const supabase = await createServerClient();
    const user = await requireAuth(supabase);
    await requireEventOwnership(supabase, user.id, eventId);

    const { data, error } = await supabase
      .from("cards_audit_log")
      .select(
        "id, event_id, card_id, action, actor_id, reason, payload_before, payload_after, created_at",
      )
      .eq("event_id", eventId)
      .eq("card_id", cardId)
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
