export type FactAuditAction = "deactivated" | "reactivated" | "updated";

export interface FactAuditLogEntry {
  id: string;
  event_id: string;
  fact_key: string;
  action: FactAuditAction;
  actor_id: string;
  reason: string | null;
  payload_before: Record<string, any> | null;
  payload_after: Record<string, any> | null;
  created_at: string;
}

