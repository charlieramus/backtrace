// Save files — the app's persistence + sharing mechanism (no accounts, no server).
//
// An investigation exports to a single validated JSON file and imports back. The shape
// mirrors CRESEARCH.md §3 lightly (incident header + nodes + provenance/version fields)
// so a future GeoPackage/GeoJSON export is a straight mapping. Import validates the
// format + version + every node's shape and fails LOUDLY on anything bad — never a silent
// partial load. The pure core (build / stringify / parse / apply) has no DOM so it's
// unit-testable; the browser download + file-picker wrappers sit at the bottom.

import type { InvestigationState, IncidentHeader, Store } from "../store";
import type { Node, SpreadType } from "../domain/node";
import { getIndicator, type IndicatorCode } from "../domain/indicators";

export const SAVE_FORMAT = "backtrace-investigation";
export const SAVE_FORMAT_VERSION = 1;
export const APP_VERSION = "0.1.0";
export const INDICATOR_TYPE_VERSION = 1;

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  formatVersion: number;
  appVersion: string;
  indicatorTypeVersion: number;
  exportedAtUtc: string;
  incident: IncidentHeader;
  nodes: Node[];
  /** Reserved for a future computed-origin export (posterior summary). */
  solution?: unknown;
}

export type ImportMode = "replace" | "merge";

/** Build the serializable save object from the current investigation state. */
export function buildSaveFile(state: InvestigationState): SaveFile {
  return {
    format: SAVE_FORMAT,
    formatVersion: SAVE_FORMAT_VERSION,
    appVersion: APP_VERSION,
    indicatorTypeVersion: INDICATOR_TYPE_VERSION,
    exportedAtUtc: new Date().toISOString(),
    incident: { ...state.incident },
    nodes: state.nodes.map((n) => ({ ...n })),
  };
}

export function saveFileToJson(sf: SaveFile): string {
  return JSON.stringify(sf, null, 2);
}

const SPREADS: SpreadType[] = ["ADVANCING", "LATERAL", "BACKING", "UNDETERMINED"];

function isNumOrNull(v: unknown): v is number | null {
  return v === null || (typeof v === "number" && Number.isFinite(v));
}

function validateNode(raw: unknown, i: number): { ok: true; node: Node } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: `node ${i} is not an object` };
  const n = raw as Record<string, unknown>;
  if (typeof n.id !== "string" || !n.id) return { ok: false, error: `node ${i} has no id` };
  if (typeof n.lat !== "number" || typeof n.lon !== "number")
    return { ok: false, error: `node ${i} has an invalid lat/lon` };
  if (typeof n.indicatorCode !== "string" || !getIndicator(n.indicatorCode as IndicatorCode))
    return { ok: false, error: `node ${i} has an unknown indicator "${String(n.indicatorCode)}"` };
  if (typeof n.spreadType !== "string" || !SPREADS.includes(n.spreadType as SpreadType))
    return { ok: false, error: `node ${i} has an invalid spread "${String(n.spreadType)}"` };
  if (!isNumOrNull(n.azimuthTrueDeg)) return { ok: false, error: `node ${i} has an invalid azimuth` };
  if (!isNumOrNull(n.sigmaDeg)) return { ok: false, error: `node ${i} has an invalid σ` };
  return {
    ok: true,
    node: {
      id: n.id,
      lat: n.lat,
      lon: n.lon,
      indicatorCode: n.indicatorCode as IndicatorCode,
      spreadType: n.spreadType as SpreadType,
      azimuthTrueDeg: n.azimuthTrueDeg as number | null,
      sigmaDeg: n.sigmaDeg as number | null,
      notes: typeof n.notes === "string" ? n.notes : "",
    },
  };
}

/** Parse + validate a save-file JSON string. Never throws; returns a typed result. */
export function parseSaveFile(text: string): { ok: true; data: SaveFile } | { ok: false; error: string } {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file isn't valid JSON." };
  }
  if (typeof obj !== "object" || obj === null) return { ok: false, error: "This file isn't a Backtrace investigation." };
  const o = obj as Record<string, unknown>;
  if (o.format !== SAVE_FORMAT) return { ok: false, error: "Unrecognized file — not a Backtrace investigation." };
  if (o.formatVersion !== SAVE_FORMAT_VERSION)
    return { ok: false, error: `Unsupported file version (${String(o.formatVersion)}); this build reads v${SAVE_FORMAT_VERSION}.` };

  const inc = o.incident as Record<string, unknown> | undefined;
  if (!inc || typeof inc.name !== "string" || typeof inc.id !== "string")
    return { ok: false, error: "The incident header is missing or malformed." };
  if (!isNumOrNull(inc.anchorLat) || !isNumOrNull(inc.anchorLon))
    return { ok: false, error: "The incident anchor is malformed." };

  if (!Array.isArray(o.nodes)) return { ok: false, error: "The nodes list is missing or malformed." };
  const nodes: Node[] = [];
  for (let i = 0; i < o.nodes.length; i++) {
    const r = validateNode(o.nodes[i], i);
    if (!r.ok) return { ok: false, error: r.error };
    nodes.push(r.node);
  }

  const incident: IncidentHeader = {
    id: inc.id,
    name: inc.name,
    createdAtUtc: typeof inc.createdAtUtc === "string" ? inc.createdAtUtc : new Date().toISOString(),
    anchorLat: inc.anchorLat as number | null,
    anchorLon: inc.anchorLon as number | null,
  };

  return {
    ok: true,
    data: {
      format: SAVE_FORMAT,
      formatVersion: SAVE_FORMAT_VERSION,
      appVersion: typeof o.appVersion === "string" ? o.appVersion : APP_VERSION,
      indicatorTypeVersion:
        typeof o.indicatorTypeVersion === "number" ? o.indicatorTypeVersion : INDICATOR_TYPE_VERSION,
      exportedAtUtc: typeof o.exportedAtUtc === "string" ? o.exportedAtUtc : new Date().toISOString(),
      incident,
      nodes,
      solution: o.solution,
    },
  };
}

/** Apply a validated save file to the store, replacing or merging. */
export function applySaveFile(store: Store, data: SaveFile, mode: ImportMode): void {
  if (mode === "replace") {
    store.load({ incident: data.incident, nodes: data.nodes });
    return;
  }
  // merge: append imported nodes with fresh ids so they can't collide; adopt the
  // imported anchor only if the current investigation has none yet.
  const inc = store.getIncident();
  if ((inc.anchorLat == null || inc.anchorLon == null) && data.incident.anchorLat != null && data.incident.anchorLon != null) {
    store.setAnchor(data.incident.anchorLat, data.incident.anchorLon);
  }
  for (const n of data.nodes) {
    const added = store.add({
      lat: n.lat,
      lon: n.lon,
      indicatorCode: n.indicatorCode,
      spreadType: n.spreadType,
      azimuthTrueDeg: n.azimuthTrueDeg,
      sigmaDeg: n.sigmaDeg,
      notes: n.notes,
    });
    // if the store still had no anchor before this node, fix it now
    const cur = store.getIncident();
    if (cur.anchorLat == null || cur.anchorLon == null) store.setAnchor(added.lat, added.lon);
  }
}

// --- DOM wrappers -----------------------------------------------------------

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "investigation";
}

/** Serialize the store and trigger a browser download of the JSON file. */
export function exportInvestigation(store: Store): void {
  const sf = buildSaveFile(store.getState());
  const json = saveFileToJson(sf);
  const date = sf.exportedAtUtc.slice(0, 10);
  const name = `backtrace-${slug(sf.incident.name)}-${date}.json`;
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Read a File, validate, and apply it. Returns an error string on failure (else null). */
export async function importInvestigationFile(
  store: Store,
  file: File,
  mode: ImportMode,
): Promise<string | null> {
  const text = await file.text();
  const parsed = parseSaveFile(text);
  if (!parsed.ok) return parsed.error;
  applySaveFile(store, parsed.data, mode);
  return null;
}
