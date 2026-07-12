// Application store — the whole investigation state, in memory, framework-free.
//
// Holds the incident header, the placed nodes, the current selection, and the
// currently-"armed" indicator (what the next map click will place). Pure and
// synchronous with a tiny subscribe() fan-out so both the map and the panel can
// re-render from one source of truth.
//
// V6 chain of custody: nodes are APPEND-ONLY. `state.nodes` is the full history —
// every row ever created, including superseded + voided ones. A correction never
// mutates a row; it appends a new one carrying `supersedesNodeId` + the shared
// `chainId`. The working set the UI/posterior/export read is `activeNodes()` — the
// latest non-voided row per chain. A transient `draft` overlay carries an in-progress
// edit for smooth typing/dragging without spamming history; commitEdit() seals it.

import type { Node } from "./domain/node";
import { chainKeyOf, deriveActiveNodes } from "./domain/node";
import { computeRecordHash } from "./domain/recordHash";
import { makeAuditEntry, type AuditEntry, type AuditInput } from "./domain/audit";
import { makeLocalInvestigator, type Investigator } from "./domain/investigator";
import type { OriginSolution } from "./geo/solution";
import type { IndicatorCode } from "./domain/indicators";

/** Incident-level header. `anchor*` is the session ENU origin (set by v2's first
 *  placement, used by v3/v4 geometry); null until the first node lands. The
 *  provenance fields (V6) travel with the defensible record + court exports. */
export interface IncidentHeader {
  id: string;
  name: string;
  createdAtUtc: string;
  anchorLat: number | null;
  anchorLon: number | null;
  /** The agency's own incident/case number (court exports cite it). */
  agencyIncidentNo?: string | null;
  /** Geodetic datum for every coordinate in the record. Defaults to WGS84. */
  datum?: string;
  /** Investigator id who owns the case (nullable — single-user desk case). */
  createdBy?: string | null;
  /** When the fire/incident was discovered, distinct from record creation. */
  discoveredAtUtc?: string | null;
}

/** The complete serializable investigation state. */
export interface InvestigationState {
  incident: IncidentHeader;
  nodes: Node[];
  selectedNodeId: string | null;
  armedIndicatorCode: IndicatorCode;
  /** Append-only custody audit trail (V6 S4). */
  auditLog: AuditEntry[];
  /** Who owns this case (single-user desk default; V9 captures a real identity). */
  investigator: Investigator;
  /** The latest computed origin solution (V7 export substrate); null until computed. */
  solution: OriginSolution | null;
}

/** Fields a caller supplies when placing a node; the store fills id + desk
 *  defaults. The core fields are required-ish (lat/lon/indicator); every other
 *  Node field — including the V6 provenance columns V9 will populate — may be
 *  passed through optionally, so field capture reuses this one entry point. */
export type NodeInput = {
  lat: number;
  lon: number;
  indicatorCode: IndicatorCode;
} & Partial<Omit<Node, "id" | "lat" | "lon" | "indicatorCode">>;

export type StoreListener = (state: InvestigationState) => void;

/** A node change: any editable field except the immutable identity/chain columns. */
export type NodeChanges = Partial<
  Omit<Node, "id" | "chainId" | "supersedesNodeId" | "voided" | "voidReason" | "recordHash">
>;

export interface Store {
  getState(): InvestigationState;
  /** The current working set — latest non-voided row per chain (incl. a live draft). */
  getAll(): Node[];
  /** Alias of getAll(): the active working set the map/posterior/export read. */
  activeNodes(): Node[];
  /** The full ordered correction chain for a node's chain (superseded + voided rows). */
  historyOf(chainId: string): Node[];
  add(input: NodeInput): Node;
  /** Correct a node by appending a NEW superseding row; the original is never mutated. */
  supersede(nodeId: string, changes: NodeChanges): Node;
  /** Void a node (append a voided superseding row). Requires a non-empty reason. */
  void(nodeId: string, reason: string): Node;
  /** Live, un-sealed edit for smooth typing/dragging — updates the working row in a
   *  draft overlay WITHOUT appending history. Seal it with commitEdit(). */
  previewEdit(nodeId: string, changes: NodeChanges): void;
  /** Seal the current draft as one superseding row (no-op if nothing changed). */
  commitEdit(): Node | null;
  select(id: string | null): void;
  getSelected(): Node | null;
  setArmedIndicator(code: IndicatorCode): void;
  getArmedIndicator(): IndicatorCode;
  getIncident(): IncidentHeader;
  /** Set the session ENU anchor (the first placement's lat/lon). Used by v3/v4. */
  setAnchor(lat: number, lon: number): void;
  /** Set the incident's display name (v5 import/demo). */
  setIncidentName(name: string): void;
  /** The append-only custody audit trail. */
  getAuditLog(): AuditEntry[];
  /** Append one audit entry (IMPORT/EXPORT from the io layer; internal for mutations). */
  recordAudit(input: AuditInput): AuditEntry;
  /** The case's investigator (record owner). */
  getInvestigator(): Investigator;
  /** The latest computed origin solution (V7 export substrate), or null. */
  getSolution(): OriginSolution | null;
  /** Persist the latest computed origin solution (exporters read this). */
  setSolution(solution: OriginSolution | null): void;
  /** Replace the whole investigation (v5 import "replace" + demo). Clones inputs. */
  load(data: {
    incident: IncidentHeader;
    nodes: Node[];
    auditLog?: AuditEntry[];
    investigator?: Investigator;
    solution?: OriginSolution | null;
  }): void;
  /** Reset to a fresh, empty investigation (v5 "Clear"). */
  clear(): void;
  /** Subscribe to any state change. Returns an unsubscribe function. */
  subscribe(listener: StoreListener): () => void;
}

function makeId(): string {
  // crypto.randomUUID exists in browsers and Node 19+/jsdom; fall back defensively.
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return "n_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// The fields an interactive edit (dial / typed azimuth·σ / spread) may change on a
// working row — everything else on a superseding row is copied from its parent.
const EDITABLE_KEYS = ["azimuthTrueDeg", "sigmaDeg", "spreadType", "notes"] as const;

function pick<K extends keyof Node>(obj: Node, keys: readonly K[]): Pick<Node, K> {
  const out = {} as Pick<Node, K>;
  for (const k of keys) out[k] = obj[k];
  return out;
}

/** Create a fresh, isolated store (used per-test and as the app singleton below). */
export function createStore(): Store {
  const state: InvestigationState = {
    incident: {
      id: makeId(),
      name: "New investigation",
      createdAtUtc: new Date().toISOString(),
      anchorLat: null,
      anchorLon: null,
      datum: "WGS84",
    },
    nodes: [],
    selectedNodeId: null,
    armedIndicatorCode: "ANGLE_OF_CHAR",
    auditLog: [],
    investigator: makeLocalInvestigator(),
    solution: null,
  };

  const listeners = new Set<StoreListener>();
  function emit(): void {
    for (const l of listeners) l(state);
  }

  // A transient, un-sealed edit shadowing one chain's tip (never serialized).
  let draft: Node | null = null;

  // Seal a freshly-created row with its SHA-256 recordHash (async — Web Crypto). The
  // hash is derived metadata, not evidentiary content, so stamping it once after the row
  // lands doesn't violate append-only; nothing on a synchronous read path depends on it,
  // and export/import recompute hashes fresh regardless of this best-effort cache.
  function seal(node: Node): void {
    computeRecordHash(node)
      .then((h) => {
        node.recordHash = h;
      })
      .catch(() => {
        /* crypto.subtle unavailable — export/verify still recompute on demand */
      });
  }

  // Append one custody audit entry (no emit — the surrounding mutation emits once).
  function pushAudit(
    action: AuditInput["action"],
    entity: AuditInput["entity"],
    entityId: string,
    before?: unknown,
    after?: unknown,
  ): void {
    state.auditLog.push(
      makeAuditEntry({ actorId: state.incident.createdBy ?? null, action, entity, entityId, before, after }),
    );
  }

  /** The latest sealed row for a chain (its tip), or undefined if the chain is gone. */
  function tipForChain(chainId: string): Node | undefined {
    let tip: Node | undefined;
    for (const n of state.nodes) if (chainKeyOf(n) === chainId) tip = n; // last wins
    return tip;
  }
  /** Resolve any node id to its chain's tip (following the supersede chain). */
  function tipForId(id: string): Node | undefined {
    const n = state.nodes.find((x) => x.id === id);
    return n ? tipForChain(chainKeyOf(n)) : undefined;
  }
  /** The current working set: latest non-voided row per chain, draft-overlaid. */
  function computeActive(): Node[] {
    return deriveActiveNodes(state.nodes).map((tip) =>
      draft && chainKeyOf(draft) === chainKeyOf(tip) ? draft : tip,
    );
  }

  const store: Store = {
    getState: () => state,
    getAll: () => computeActive(),
    activeNodes: () => computeActive(),

    historyOf(chainId) {
      return state.nodes.filter((n) => chainKeyOf(n) === chainId);
    },

    add(input) {
      const id = makeId();
      const node: Node = {
        ...input,
        id,
        chainId: id, // a fresh root chain; supersessions inherit this
        spreadType: input.spreadType ?? "ADVANCING",
        azimuthTrueDeg: input.azimuthTrueDeg ?? null,
        sigmaDeg: input.sigmaDeg ?? null,
        notes: input.notes ?? "",
        // Desk defaults for the defensible record: a hand-placed node is a MAP_PIN
        // with a MANUAL fix + MANUAL bearing method, active (not voided), MED
        // confidence, no cluster conflict, stamped with a creation time. V9 supplies
        // real sensor provenance; here these fields are honest about being desk-entered.
        positionSource: input.positionSource ?? "MAP_PIN",
        fixType: input.fixType ?? "MANUAL",
        azimuthMethod: input.azimuthMethod ?? "MANUAL",
        voided: input.voided ?? false,
        investigatorConf: input.investigatorConf ?? "MED",
        conflictsCluster: input.conflictsCluster ?? false,
        magAnomalyFlag: input.magAnomalyFlag ?? false,
        createdAtUtc: input.createdAtUtc ?? new Date().toISOString(),
      };
      state.nodes.push(node);
      seal(node);
      pushAudit("CREATE_NODE", "NODE", node.id, undefined, node);
      emit();
      return node;
    },

    supersede(nodeId, changes) {
      const tip = tipForId(nodeId);
      if (!tip) throw new Error(`supersede: no node for id ${nodeId}`);
      const row: Node = {
        ...tip,
        ...changes,
        id: makeId(),
        chainId: chainKeyOf(tip),
        supersedesNodeId: tip.id,
        createdAtUtc: new Date().toISOString(),
      };
      state.nodes.push(row);
      seal(row);
      pushAudit("SUPERSEDE_NODE", "NODE", row.id, tip, row);
      // selection follows the chain head, not the row id
      if (state.selectedNodeId === tip.id) state.selectedNodeId = row.id;
      if (draft && chainKeyOf(draft) === chainKeyOf(tip)) draft = null;
      emit();
      return row;
    },

    void(nodeId, reason) {
      const clean = reason.trim();
      if (!clean) throw new Error("void requires a non-empty reason");
      const tip = tipForId(nodeId);
      if (!tip) throw new Error(`void: no node for id ${nodeId}`);
      const row: Node = {
        ...tip,
        id: makeId(),
        chainId: chainKeyOf(tip),
        supersedesNodeId: tip.id,
        voided: true,
        voidReason: clean,
        createdAtUtc: new Date().toISOString(),
      };
      state.nodes.push(row);
      seal(row);
      pushAudit("VOID_NODE", "NODE", row.id, tip, row);
      if (draft && chainKeyOf(draft) === chainKeyOf(tip)) draft = null;
      if (state.selectedNodeId === tip.id) state.selectedNodeId = null;
      emit();
      return row;
    },

    previewEdit(nodeId, changes) {
      const tip = tipForId(nodeId);
      if (!tip) return;
      // Accumulate onto an open draft for the same chain; else start one from the tip.
      // The draft keeps the tip's id so selection + marker identity stay stable.
      const base = draft && chainKeyOf(draft) === chainKeyOf(tip) ? draft : tip;
      draft = { ...base, ...changes };
      emit();
    },

    commitEdit() {
      if (!draft) return null;
      const d = draft;
      const tip = tipForChain(chainKeyOf(d));
      draft = null;
      if (!tip) {
        emit();
        return null;
      }
      // Only seal a real change; otherwise just drop the draft and revert to the tip.
      const changed = EDITABLE_KEYS.some((k) => d[k] !== tip[k]);
      if (!changed) {
        emit();
        return null;
      }
      const row: Node = {
        ...tip,
        ...pick(d, EDITABLE_KEYS),
        id: makeId(),
        chainId: chainKeyOf(tip),
        supersedesNodeId: tip.id,
        createdAtUtc: new Date().toISOString(),
      };
      state.nodes.push(row);
      seal(row);
      pushAudit("SUPERSEDE_NODE", "NODE", row.id, tip, row);
      if (state.selectedNodeId === tip.id) state.selectedNodeId = row.id;
      emit();
      return row;
    },

    select(id) {
      if (id === null) {
        if (state.selectedNodeId === null) return;
        state.selectedNodeId = null;
        emit();
        return;
      }
      const tip = tipForId(id);
      if (!tip || tip.voided) return; // ignore unknown/voided chains
      if (state.selectedNodeId === tip.id) return;
      state.selectedNodeId = tip.id;
      emit();
    },

    getSelected() {
      const id = state.selectedNodeId;
      if (id === null) return null;
      return computeActive().find((n) => n.id === id) ?? null;
    },

    setArmedIndicator(code) {
      if (state.armedIndicatorCode === code) return;
      state.armedIndicatorCode = code;
      emit();
    },

    getArmedIndicator: () => state.armedIndicatorCode,
    getIncident: () => state.incident,

    setAnchor(lat, lon) {
      const before = { anchorLat: state.incident.anchorLat, anchorLon: state.incident.anchorLon };
      state.incident.anchorLat = lat;
      state.incident.anchorLon = lon;
      pushAudit("EDIT_INCIDENT", "INCIDENT", state.incident.id, before, { anchorLat: lat, anchorLon: lon });
      emit();
    },

    setIncidentName(name) {
      const before = { name: state.incident.name };
      state.incident.name = name;
      pushAudit("EDIT_INCIDENT", "INCIDENT", state.incident.id, before, { name });
      emit();
    },

    getAuditLog: () => state.auditLog,
    getInvestigator: () => state.investigator,
    getSolution: () => state.solution,

    // No emit: a solution is a derived snapshot the exporters cache, not UI state —
    // emitting here would loop through the readout/map subscribers for no visual change.
    setSolution(solution) {
      state.solution = solution;
    },

    recordAudit(input) {
      const entry = makeAuditEntry({ actorId: state.incident.createdBy ?? null, ...input });
      state.auditLog.push(entry);
      emit();
      return entry;
    },

    load(data) {
      state.incident = { ...data.incident };
      state.nodes = data.nodes.map((n) => ({ ...n }));
      state.auditLog = (data.auditLog ?? []).map((e) => ({ ...e }));
      state.investigator = data.investigator ? { ...data.investigator } : makeLocalInvestigator();
      state.solution = data.solution ?? null;
      state.selectedNodeId = null;
      draft = null;
      emit();
    },

    clear() {
      state.incident = {
        id: makeId(),
        name: "New investigation",
        createdAtUtc: new Date().toISOString(),
        anchorLat: null,
        anchorLon: null,
        datum: "WGS84",
      };
      state.nodes = [];
      state.auditLog = [];
      state.investigator = makeLocalInvestigator();
      state.solution = null;
      state.selectedNodeId = null;
      draft = null;
      emit();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  return store;
}

/** The app-wide singleton store (UI + map both read/write this). */
export const store = createStore();
