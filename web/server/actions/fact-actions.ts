'use server';

import { createServerClient } from '@/shared/lib/supabase/server';
import { requireAuth, requireEventOwnership } from '@/shared/lib/auth';
import type { FactAuditLogEntry, FactAuditAction } from '@/shared/types/fact';

export async function updateFactActiveStatus(
  eventId: string,
  factKey: string,
  isActive: boolean,
  options?: { reason?: string; payloadBefore?: Record<string, unknown> | null; payloadAfter?: Record<string, unknown> | null }
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!factKey) {
      return { ok: false, error: 'Fact key is required' };
    }

    const supabase = await createServerClient();
    const user = await requireAuth(supabase);
    await requireEventOwnership(supabase, user.id, eventId);

    const { data: beforeRow, error: beforeError } = await supabase
      .from('facts')
      .select('fact_value, is_active')
      .eq('event_id', eventId)
      .eq('fact_key', factKey)
      .maybeSingle();

    if (beforeError) {
      return { ok: false, error: beforeError.message };
    }

    const { error } = await supabase
      .from('facts')
      .update({ is_active: isActive })
      .eq('event_id', eventId)
      .eq('fact_key', factKey);

    if (error) {
      return { ok: false, error: error.message };
    }

    const action: FactAuditAction = isActive ? 'reactivated' : 'deactivated';

    const { reason, payloadBefore, payloadAfter } = options ?? {};
    const inferredAfter = isActive ? beforeRow?.fact_value ?? null : null;

    const { error: auditError } = await supabase.from('facts_audit_log').insert({
      event_id: eventId,
      fact_key: factKey,
      action,
      actor_id: user.id,
      reason: reason ?? null,
      payload_before: payloadBefore ?? beforeRow?.fact_value ?? null,
      payload_after: payloadAfter ?? inferredAfter,
    });

    if (auditError) {
      console.error('[fact-actions] Failed to insert audit log entry', auditError);
    }

    return { ok: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { ok: false, error: errorMessage };
  }
}

export async function getFactAuditLog(
  eventId: string,
  factKey: string
): Promise<{ data: FactAuditLogEntry[] | null; error?: string }> {
  try {
    const supabase = await createServerClient();
    const user = await requireAuth(supabase);
    await requireEventOwnership(supabase, user.id, eventId);

    const { data, error } = await supabase
      .from('facts_audit_log')
      .select('id, event_id, fact_key, action, actor_id, reason, payload_before, payload_after, created_at')
      .eq('event_id', eventId)
      .eq('fact_key', factKey)
      .order('created_at', { ascending: false });

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: data ?? [], error: undefined };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return { data: null, error: errorMessage };
  }
}

