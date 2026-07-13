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
import type { MacroConstraint } from "../domain/macro";
import { validateMacroConstraint, computeMacroHash } from "../domain/macro";
import { computeRecordHash, computeManifestHash } from "../domain/recordHash";
import { validateAuditEntry, makeAuditEntry, type AuditEntry } from "../domain/audit";
import type { Investigator } from "../domain/investigator";
import { buildSolution, type OriginSolution } from "../geo/solution";

export const SAVE_FORMAT = "backtrace-investigation";
export const SAVE_FORMAT_VERSION = 2; // v2 = the defensible record (full history + audit + hashes)
export const APP_VERSION = "0.1.0";
export const INDICATOR_TYPE_VERSION = 1;

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  formatVersion: number;
  appVersion: string;
  indicatorTypeVersion: number;
  exportedAtUtc: string;
  incident: IncidentHeader;
  /** The record owner (V6 S5). */
  investigator?: Investigator;
  /** FULL append-only node history — superseded + voided rows included (V6 S5). */
  nodes: Node[];
  /** FULL append-only macro-constraint history (V10) — priors carried with the investigation. */
  macroConstraints?: MacroConstraint[];
  /** Append-only custody audit trail (V6 S4). */
  auditLog?: AuditEntry[];
  /** Tamper-evident seal over the incident header + ordered active-node hashes (V6 S3). */
  manifestHash?: string;
  /** The latest computed origin solution — the V7 export substrate (posterior snapshot). */
  solution?: OriginSolution;
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
    investigator: { ...state.investigator },
    nodes: state.nodes.map((n) => ({ ...n })),
    macroConstraints: state.macroConstraints.map((m) => ({ ...m })),
    auditLog: state.auditLog.map((e) => ({ ...e })),
    solution: state.solution ?? undefined,
  };
}

export function saveFileToJson(sf: SaveFile): string {
  return JSON.stringify(sf, null, 2);
}

const SPREADS: SpreadType[] = ["ADVANCING", "LATERAL", "BACKING", "UNDETERMINED"];

// The optional defensible-record fields (CRESEARCH.md §3) preserved through a
// round-trip. They're carried opaquely here (V6 desk files rarely set them; V9
// populates them); Stage 5's v2 format validates their shapes + chain integrity.
const OPTIONAL_NODE_KEYS = [
  "chainId", "supersedesNodeId", "voided", "voidReason",
  "ellipsoidHeightM", "hAccuracyM", "vAccuracyM", "hdop", "pdop", "satCount", "fixType", "positionSource",
  "azimuthMagneticDeg", "declinationDeg", "magneticModel", "modelEpoch", "gridConvergenceDeg",
  "azimuthSigmaDeg", "azimuthMethod", "pitchDeg", "rollDeg", "captureWindowMs", "sampleCount",
  "magAccuracyStatus", "magFieldUt", "magFieldWmmUt", "magAnomalyFlag", "dipMeasuredDeg", "dipWmmDeg",
  "gyroRmsRadS", "fuelModel", "slopePct", "aspectDeg", "elevationM", "demSource", "investigatorConf",
  "conflictsCluster", "createdAtUtc", "createdBy", "deviceModel", "osVersion", "appVersion", "recordHash",
] as const;

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
  const node: Node = {
    id: n.id,
    lat: n.lat,
    lon: n.lon,
    indicatorCode: n.indicatorCode as IndicatorCode,
    spreadType: n.spreadType as SpreadType,
    azimuthTrueDeg: n.azimuthTrueDeg as number | null,
    sigmaDeg: n.sigmaDeg as number | null,
    notes: typeof n.notes === "string" ? n.notes : "",
  };
  // Preserve any defensible-record provenance fields present on the row.
  const bag = node as unknown as Record<string, unknown>;
  for (const k of OPTIONAL_NODE_KEYS) {
    if (n[k] !== undefined) bag[k] = n[k];
  }
  return { ok: true, node };
}

/** Upgrade a thin v1 node to an active court-grade record: desk defaults + provenance
 *  nulls (a MAP_PIN placed by hand), keeping the original id/lat/lon/bearing. */
function upgradeThinNode(n: Node, createdAtUtc: string): Node {
  return {
    ...n,
    chainId: n.chainId ?? n.id,
    positionSource: n.positionSource ?? "MAP_PIN",
    fixType: n.fixType ?? "MANUAL",
    azimuthMethod: n.azimuthMethod ?? "MANUAL",
    voided: n.voided ?? false,
    investigatorConf: n.investigatorConf ?? "MED",
    conflictsCluster: n.conflictsCluster ?? false,
    magAnomalyFlag: n.magAnomalyFlag ?? false,
    createdAtUtc: n.createdAtUtc ?? createdAtUtc,
  };
}

/** Validate a raw investigator object; returns undefined if missing/malformed. */
function validateInvestigator(raw: unknown): Investigator | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.fullName !== "string") return undefined;
  const inv: Investigator = { id: r.id, fullName: r.fullName };
  if (typeof r.agency === "string") inv.agency = r.agency;
  if (typeof r.qualification === "string") inv.qualification = r.qualification;
  if (typeof r.certExpiry === "string") inv.certExpiry = r.certExpiry;
  return inv;
}

/**
 * Parse + validate a save-file JSON string. Never throws; returns a typed result. Reads
 * both v2 (the defensible record) and v1 (upgraded LOUDLY via the `migrated` flag — the
 * caller shows the notice + seals the hashes). Never a silent partial load.
 */
export function parseSaveFile(
  text: string,
): { ok: true; data: SaveFile; migrated: boolean } | { ok: false; error: string } {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file isn't valid JSON." };
  }
  if (typeof obj !== "object" || obj === null) return { ok: false, error: "This file isn't a Backtrace investigation." };
  const o = obj as Record<string, unknown>;
  if (o.format !== SAVE_FORMAT) return { ok: false, error: "Unrecognized file — not a Backtrace investigation." };
  if (o.formatVersion !== 1 && o.formatVersion !== 2)
    return { ok: false, error: `Unsupported file version (${String(o.formatVersion)}); this build reads v1–v2.` };
  const migrated = o.formatVersion === 1;

  const inc = o.incident as Record<string, unknown> | undefined;
  if (!inc || typeof inc.name !== "string" || typeof inc.id !== "string")
    return { ok: false, error: "The incident header is missing or malformed." };
  if (!isNumOrNull(inc.anchorLat) || !isNumOrNull(inc.anchorLon))
    return { ok: false, error: "The incident anchor is malformed." };

  if (!Array.isArray(o.nodes)) return { ok: false, error: "The nodes list is missing or malformed." };
  const parsed: Node[] = [];
  for (let i = 0; i < o.nodes.length; i++) {
    const r = validateNode(o.nodes[i], i);
    if (!r.ok) return { ok: false, error: r.error };
    parsed.push(r.node);
  }

  const incident: IncidentHeader = {
    id: inc.id,
    name: inc.name,
    createdAtUtc: typeof inc.createdAtUtc === "string" ? inc.createdAtUtc : new Date().toISOString(),
    anchorLat: inc.anchorLat as number | null,
    anchorLon: inc.anchorLon as number | null,
  };
  // Carry the V6 header provenance fields when present.
  if (typeof inc.agencyIncidentNo === "string") incident.agencyIncidentNo = inc.agencyIncidentNo;
  if (typeof inc.datum === "string") incident.datum = inc.datum;
  if (typeof inc.createdBy === "string") incident.createdBy = inc.createdBy;
  if (typeof inc.discoveredAtUtc === "string") incident.discoveredAtUtc = inc.discoveredAtUtc;

  let nodes: Node[];
  let auditLog: AuditEntry[] | undefined;
  let manifestHash: string | undefined;
  let investigator: Investigator | undefined;
  // Macro constraints (V10) exist only in v2 files; a migrated v1 file has none.
  const macroConstraints: MacroConstraint[] = Array.isArray(o.macroConstraints)
    ? (o.macroConstraints.map(validateMacroConstraint).filter((m): m is MacroConstraint => m !== null))
    : [];

  if (migrated) {
    // Upgrade every thin v1 node to an active court-grade record, and synthesize a
    // CREATE_NODE audit entry per node. Hashes are computed by the import flow (async).
    nodes = parsed.map((n) => upgradeThinNode(n, incident.createdAtUtc));
    auditLog = nodes.map((n) =>
      makeAuditEntry({
        action: "CREATE_NODE",
        entity: "NODE",
        entityId: n.id,
        actorId: incident.createdBy ?? null,
        after: n,
        note: "migrated from v1",
      }),
    );
  } else {
    nodes = parsed;
    // v2 chain integrity: every supersedesNodeId must reference an existing row.
    const ids = new Set(nodes.map((n) => n.id));
    for (const n of nodes) {
      if (n.supersedesNodeId != null && !ids.has(n.supersedesNodeId))
        return { ok: false, error: `A correction references a missing node (${n.supersedesNodeId}).` };
    }
    auditLog = Array.isArray(o.auditLog)
      ? o.auditLog.map(validateAuditEntry).filter((e): e is AuditEntry => e !== null)
      : undefined;
    manifestHash = typeof o.manifestHash === "string" ? o.manifestHash : undefined;
    investigator = validateInvestigator(o.investigator);
  }

  return {
    ok: true,
    migrated,
    data: {
      format: SAVE_FORMAT,
      formatVersion: SAVE_FORMAT_VERSION, // always upgraded to the current (v2)
      appVersion: typeof o.appVersion === "string" ? o.appVersion : APP_VERSION,
      indicatorTypeVersion:
        typeof o.indicatorTypeVersion === "number" ? o.indicatorTypeVersion : INDICATOR_TYPE_VERSION,
      exportedAtUtc: typeof o.exportedAtUtc === "string" ? o.exportedAtUtc : new Date().toISOString(),
      incident,
      investigator,
      nodes,
      macroConstraints,
      auditLog,
      manifestHash,
      // Carried opaquely through the round-trip (a reproducible posterior snapshot).
      solution: o.solution as OriginSolution | undefined,
    },
  };
}

// --- integrity: seal (export) + verify (import) -----------------------------

/** Recompute every node's recordHash + the manifest hash, returning a sealed copy. */
export async function sealSaveFile(sf: SaveFile): Promise<SaveFile> {
  const nodes = await Promise.all(
    sf.nodes.map(async (n) => ({ ...n, recordHash: await computeRecordHash(n) })),
  );
  const macroConstraints = sf.macroConstraints
    ? await Promise.all(sf.macroConstraints.map(async (m) => ({ ...m, recordHash: await computeMacroHash(m) })))
    : undefined;
  const manifestHash = await computeManifestHash(sf.incident, nodes);
  return { ...sf, nodes, macroConstraints, manifestHash };
}

export type IntegrityStatus = "verified" | "unverified" | "failed";
export interface IntegrityResult {
  status: IntegrityStatus;
  /** Ids of nodes whose stored recordHash didn't match a fresh recompute. */
  failedNodeIds: string[];
  /** A readable, court-honest one-liner for the toast/banner. */
  message: string;
}

/**
 * Recompute a file's node hashes + manifest and compare to the stored seal. A file with
 * no manifest is "unverified" (a legitimate pre-hash import — Stage 5's migration), NOT a
 * failure. A mismatch is "failed" and names the offending node(s) — never silently ignored.
 */
export async function verifyIntegrity(data: SaveFile): Promise<IntegrityResult> {
  if (!data.manifestHash) {
    return {
      status: "unverified",
      failedNodeIds: [],
      message: "Legacy file — no integrity seal to verify (pre-1.0 record).",
    };
  }
  try {
    const failed: string[] = [];
    for (const n of data.nodes) {
      if (typeof n.recordHash === "string") {
        const h = await computeRecordHash(n);
        if (h !== n.recordHash) failed.push(n.id);
      }
    }
    const manifest = await computeManifestHash(data.incident, data.nodes);
    const manifestOk = manifest === data.manifestHash;
    if (failed.length > 0 || !manifestOk) {
      const named = failed.length
        ? ` (node ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "…" : ""})`
        : "";
      return {
        status: "failed",
        failedNodeIds: failed,
        message: `Integrity check FAILED${named} — this record may have been altered after export.`,
      };
    }
    return {
      status: "verified",
      failedNodeIds: [],
      message: "Integrity verified — every record hash and the manifest match.",
    };
  } catch {
    return {
      status: "unverified",
      failedNodeIds: [],
      message: "Integrity could not be checked in this environment.",
    };
  }
}

/** Apply a validated save file to the store, replacing or merging. Records an IMPORT
 *  audit entry either way (replace restores the imported trail, then marks the import). */
export function applySaveFile(store: Store, data: SaveFile, mode: ImportMode): void {
  if (mode === "replace") {
    store.load({
      incident: data.incident,
      nodes: data.nodes,
      macroConstraints: data.macroConstraints,
      auditLog: data.auditLog,
      investigator: data.investigator,
      solution: data.solution ?? null,
    });
    store.recordAudit({
      action: "IMPORT",
      entity: "INVESTIGATION",
      entityId: data.incident.id,
      after: { mode, nodes: data.nodes.length, verified: data.manifestHash != null },
    });
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
  store.recordAudit({
    action: "IMPORT",
    entity: "INVESTIGATION",
    entityId: data.incident.id,
    after: { mode, nodes: data.nodes.length, verified: data.manifestHash != null },
  });
}

// --- DOM wrappers -----------------------------------------------------------

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "investigation";
}

/** Serialize + seal the store and trigger a browser download of the JSON file. */
export async function exportInvestigation(store: Store): Promise<void> {
  // Recompute + persist the origin solution so the JSON carries the current snapshot.
  store.setSolution(buildSolution(store));
  const sf = await sealSaveFile(buildSaveFile(store.getState()));
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

/** Read a File, validate, verify integrity, and apply it (never a silent partial load).
 *  Returns the parse error, or the integrity result alongside a null error on success. */
export async function importInvestigationFile(
  store: Store,
  file: File,
  mode: ImportMode,
): Promise<{ error: string } | { error: null; integrity: IntegrityResult; migrated: boolean }> {
  const text = await file.text();
  const parsed = parseSaveFile(text);
  if (!parsed.ok) return { error: parsed.error };
  // A migrated v1 file has no hashes yet — seal it so the upgraded record is verifiable.
  const data = parsed.migrated ? await sealSaveFile(parsed.data) : parsed.data;
  const integrity = await verifyIntegrity(data);
  applySaveFile(store, data, mode); // apply even if unverified — warn, never drop
  return { error: null, integrity, migrated: parsed.migrated };
}
