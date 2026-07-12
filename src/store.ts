// Application store — the whole investigation state, in memory, framework-free.
//
// Holds the incident header, the placed nodes, the current selection, and the
// currently-"armed" indicator (what the next map click will place). Pure and
// synchronous with a tiny subscribe() fan-out so both the map and the panel can
// re-render from one source of truth. Shaped so v5 can serialize this object
// directly — no persistence here yet.

import type { Node } from "./domain/node";
import type { IndicatorCode } from "./domain/indicators";

/** Incident-level header. `anchor*` is the session ENU origin (set by v2's first
 *  placement, used by v3/v4 geometry); null until the first node lands. */
export interface IncidentHeader {
  id: string;
  name: string;
  createdAtUtc: string;
  anchorLat: number | null;
  anchorLon: number | null;
}

/** The complete serializable investigation state. */
export interface InvestigationState {
  incident: IncidentHeader;
  nodes: Node[];
  selectedNodeId: string | null;
  armedIndicatorCode: IndicatorCode;
}

/** Fields a caller supplies when placing a node; the store fills id + defaults. */
export interface NodeInput {
  lat: number;
  lon: number;
  indicatorCode: IndicatorCode;
  spreadType?: Node["spreadType"];
  azimuthTrueDeg?: number | null;
  sigmaDeg?: number | null;
  notes?: string;
}

export type StoreListener = (state: InvestigationState) => void;

export interface Store {
  getState(): InvestigationState;
  getAll(): Node[];
  add(input: NodeInput): Node;
  update(id: string, patch: Partial<Omit<Node, "id">>): Node | undefined;
  remove(id: string): void;
  select(id: string | null): void;
  getSelected(): Node | null;
  setArmedIndicator(code: IndicatorCode): void;
  getArmedIndicator(): IndicatorCode;
  getIncident(): IncidentHeader;
  /** Set the session ENU anchor (the first placement's lat/lon). Used by v3/v4. */
  setAnchor(lat: number, lon: number): void;
  /** Subscribe to any state change. Returns an unsubscribe function. */
  subscribe(listener: StoreListener): () => void;
}

function makeId(): string {
  // crypto.randomUUID exists in browsers and Node 19+/jsdom; fall back defensively.
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  return "n_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
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
    },
    nodes: [],
    selectedNodeId: null,
    armedIndicatorCode: "ANGLE_OF_CHAR",
  };

  const listeners = new Set<StoreListener>();
  function emit(): void {
    for (const l of listeners) l(state);
  }

  const store: Store = {
    getState: () => state,
    getAll: () => state.nodes,

    add(input) {
      const node: Node = {
        id: makeId(),
        lat: input.lat,
        lon: input.lon,
        indicatorCode: input.indicatorCode,
        spreadType: input.spreadType ?? "ADVANCING",
        azimuthTrueDeg: input.azimuthTrueDeg ?? null,
        sigmaDeg: input.sigmaDeg ?? null,
        notes: input.notes ?? "",
      };
      state.nodes.push(node);
      emit();
      return node;
    },

    update(id, patch) {
      const node = state.nodes.find((n) => n.id === id);
      if (!node) return undefined;
      Object.assign(node, patch);
      emit();
      return node;
    },

    remove(id) {
      const i = state.nodes.findIndex((n) => n.id === id);
      if (i === -1) return;
      state.nodes.splice(i, 1);
      if (state.selectedNodeId === id) state.selectedNodeId = null;
      emit();
    },

    select(id) {
      if (id !== null && !state.nodes.some((n) => n.id === id)) return;
      if (state.selectedNodeId === id) return;
      state.selectedNodeId = id;
      emit();
    },

    getSelected() {
      const id = state.selectedNodeId;
      if (id === null) return null;
      return state.nodes.find((n) => n.id === id) ?? null;
    },

    setArmedIndicator(code) {
      if (state.armedIndicatorCode === code) return;
      state.armedIndicatorCode = code;
      emit();
    },

    getArmedIndicator: () => state.armedIndicatorCode,
    getIncident: () => state.incident,

    setAnchor(lat, lon) {
      state.incident.anchorLat = lat;
      state.incident.anchorLon = lon;
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
