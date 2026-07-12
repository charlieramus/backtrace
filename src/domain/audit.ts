// Audit log — an append-only record of every custody-relevant action (CRESEARCH.md §3
// audit_log). Answers "who did what, when" over the whole investigation, alongside the
// per-node chain of custody. Pure + DOM-free; the store owns the list and appends to it,
// and it rides along in the save file (Stage 5) so the trail survives a round-trip.

/** The custody-relevant actions worth recording. EXPORT is appended by V7's exporters. */
export type AuditAction =
  | "CREATE_NODE"
  | "SUPERSEDE_NODE"
  | "VOID_NODE"
  | "EDIT_INCIDENT"
  | "IMPORT"
  | "EXPORT";

/** What an entry is about. */
export type AuditEntity = "NODE" | "INCIDENT" | "INVESTIGATION";

/** One immutable audit row. `beforeJson`/`afterJson` capture the change where it applies. */
export interface AuditEntry {
  id: string;
  atUtc: string;
  /** Investigator id responsible, or null on a single-user desk case. */
  actorId: string | null;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  beforeJson?: string;
  afterJson?: string;
  deviceId?: string;
  /** Human-readable note (e.g. "migrated from v1"). */
  note?: string;
}

export interface AuditInput {
  actorId?: string | null;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  /** Snapshotted and JSON-stringified into beforeJson/afterJson. */
  before?: unknown;
  after?: unknown;
  deviceId?: string;
  note?: string;
}

function auditId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return "aud_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Build a stamped audit entry (id + atUtc auto-filled). */
export function makeAuditEntry(input: AuditInput): AuditEntry {
  const e: AuditEntry = {
    id: auditId(),
    atUtc: new Date().toISOString(),
    actorId: input.actorId ?? null,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
  };
  if (input.before !== undefined) e.beforeJson = JSON.stringify(input.before);
  if (input.after !== undefined) e.afterJson = JSON.stringify(input.after);
  if (input.deviceId !== undefined) e.deviceId = input.deviceId;
  if (input.note !== undefined) e.note = input.note;
  return e;
}

const ACTIONS: AuditAction[] = [
  "CREATE_NODE", "SUPERSEDE_NODE", "VOID_NODE", "EDIT_INCIDENT", "IMPORT", "EXPORT",
];
const ENTITIES: AuditEntity[] = ["NODE", "INCIDENT", "INVESTIGATION"];

/** Validate one raw audit row from a save file; returns null if it's malformed. */
export function validateAuditEntry(raw: unknown): AuditEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.atUtc !== "string") return null;
  if (!ACTIONS.includes(r.action as AuditAction)) return null;
  if (!ENTITIES.includes(r.entity as AuditEntity)) return null;
  if (typeof r.entityId !== "string") return null;
  const e: AuditEntry = {
    id: r.id,
    atUtc: r.atUtc,
    actorId: typeof r.actorId === "string" ? r.actorId : null,
    action: r.action as AuditAction,
    entity: r.entity as AuditEntity,
    entityId: r.entityId,
  };
  if (typeof r.beforeJson === "string") e.beforeJson = r.beforeJson;
  if (typeof r.afterJson === "string") e.afterJson = r.afterJson;
  if (typeof r.deviceId === "string") e.deviceId = r.deviceId;
  if (typeof r.note === "string") e.note = r.note;
  return e;
}
