// Macro constraints — region-shaped evidence consumed as a Bayesian PRIOR over the origin
// (CRESEARCH.md §3 macro_constraint, §4.1). Pure, DOM-free.
//
// NWCG doctrine works outside-in: macro evidence (the burn's overall shape, a V/U apex, a
// witness's first-smoke bearing, the dispatch first-report location, an exclusion zone) gets
// you to the GENERAL origin area (GOA); micro indicators refine it to the SPECIFIC origin area
// (SOA). Per §0/§4.1 the micro rays carry less information than anyone wants — so most of the
// real information lives in the macro prior. A macro constraint is therefore NOT a ray: it's a
// region-shaped prior. This is the structural type the model was missing.
//
// Append-only, exactly like nodes (V6 discipline): a correction appends a new row carrying
// `supersedesId` + the shared `chainId`; a removal appends a `voided` row with a reason; rows
// are never mutated. The store hashes each row + audits every mutation; they ride in the v2
// save file + exports.

import { sha256Hex } from "./recordHash";

/** The five region-shaped evidence kinds (CRESEARCH.md §4.1). */
export type MacroKind =
  | "V_APEX"
  | "BURN_PERIMETER"
  | "WITNESS_CONE"
  | "FIRST_REPORT_LOC"
  | "EXCLUSION_ZONE";

/** Where the evidence came from (for the record + export provenance). */
export type MacroSource = "INVESTIGATOR" | "IR_FLIGHT" | "WITNESS" | "DISPATCH";

// --- minimal WGS84 GeoJSON geometry ([lon, lat] order) ----------------------
export type GeoPosition = [number, number];
export interface GeoPoint {
  type: "Point";
  coordinates: GeoPosition;
}
export interface GeoLineString {
  type: "LineString";
  coordinates: GeoPosition[];
}
export interface GeoPolygon {
  type: "Polygon";
  coordinates: GeoPosition[][];
}
export type MacroGeometry = GeoPoint | GeoLineString | GeoPolygon;

/**
 * A macro constraint — one region-shaped piece of evidence, an append-only court-grade record.
 * `geometry` is the drawn shape (WGS84 GeoJSON); the semantic params below carry the extra
 * numbers a shape alone can't (a cone's bearing/spread, a point's soft radius).
 */
export interface MacroConstraint {
  id: string;
  incidentId: string;
  kind: MacroKind;
  /** The drawn WGS84 geometry: Point (cone observer / first-report), LineString (V axis:
   *  apex→interior), or Polygon (burn perimeter / exclusion zone). */
  geometry: MacroGeometry;
  /** Relative influence of this constraint on the prior. Default 1.0. */
  weight: number;
  source: MacroSource;
  notes: string;

  // --- kind-specific parameters (nullable; only the relevant kinds set them) --------------
  /** WITNESS_CONE: reported first-smoke bearing from the observer (true-north deg). */
  bearingDeg?: number | null;
  /** WITNESS_CONE: half-angle spread of the cone (deg). */
  spreadDeg?: number | null;
  /** FIRST_REPORT_LOC / V_APEX: the soft 1σ radius of influence (m). */
  radiusM?: number | null;

  // --- append-only chain of custody (V6 discipline) ---------------------------------------
  /** Logical chain id shared by every row of one correction chain (root's id). */
  chainId?: string;
  /** The constraint this row supersedes; null/undefined for an original row. */
  supersedesId?: string | null;
  voided?: boolean;
  voidReason?: string | null;

  createdAtUtc: string;
  /** SHA-256 seal over the evidentiary fields — filled by the store on write. */
  recordHash?: string | null;
}

/** The logical chain key for a constraint: its chainId, or its own id for a root row. */
export function macroChainKeyOf(m: MacroConstraint): string {
  return m.chainId ?? m.id;
}

/**
 * The active working set from a flat, append-only macro history: the latest row per chain
 * (array order = creation order, last row wins), dropping voided chains. Pure + shared by the
 * store and the prior/export so they agree on the exact active set.
 */
export function deriveActiveMacros(macros: MacroConstraint[]): MacroConstraint[] {
  const tips = new Map<string, MacroConstraint>();
  for (const m of macros) tips.set(macroChainKeyOf(m), m);
  const active: MacroConstraint[] = [];
  for (const tip of tips.values()) if (!tip.voided) active.push(tip);
  return active;
}

/** The evidentiary fields sealed into a macro constraint's recordHash, in canonical order. */
const MACRO_EVIDENTIARY_KEYS: readonly (keyof MacroConstraint)[] = [
  "id",
  "incidentId",
  "kind",
  "weight",
  "source",
  "notes",
  "bearingDeg",
  "spreadDeg",
  "radiusM",
  "supersedesId",
  "voided",
  "voidReason",
  "createdAtUtc",
];

/** Canonical evidentiary serialization of a macro constraint (excludes recordHash; geometry
 *  is folded in as a stable JSON string so a moved vertex changes the seal). */
export function canonicalizeMacro(m: MacroConstraint): string {
  const obj = m as unknown as Record<string, unknown>;
  const present = (MACRO_EVIDENTIARY_KEYS as readonly string[]).filter((k) => obj[k] !== undefined).sort();
  const picked: Record<string, unknown> = {};
  for (const k of present) picked[k] = obj[k] ?? null;
  picked["geometry"] = JSON.stringify(m.geometry);
  const keys = [...present, "geometry"];
  return JSON.stringify(picked, keys);
}

/** SHA-256 seal over a macro constraint's evidentiary fields + geometry. */
export function computeMacroHash(m: MacroConstraint): Promise<string> {
  return sha256Hex(canonicalizeMacro(m));
}

const KINDS: MacroKind[] = ["V_APEX", "BURN_PERIMETER", "WITNESS_CONE", "FIRST_REPORT_LOC", "EXCLUSION_ZONE"];
const SOURCES: MacroSource[] = ["INVESTIGATOR", "IR_FLIGHT", "WITNESS", "DISPATCH"];

function isGeometry(g: unknown): g is MacroGeometry {
  if (typeof g !== "object" || g === null) return false;
  const t = (g as { type?: unknown }).type;
  return (t === "Point" || t === "LineString" || t === "Polygon") && Array.isArray((g as { coordinates?: unknown }).coordinates);
}

/** Validate a raw macro constraint from a save file; returns null if malformed. */
export function validateMacroConstraint(raw: unknown): MacroConstraint | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.incidentId !== "string") return null;
  if (!KINDS.includes(r.kind as MacroKind)) return null;
  if (!isGeometry(r.geometry)) return null;
  if (!SOURCES.includes(r.source as MacroSource)) return null;
  const m: MacroConstraint = {
    id: r.id,
    incidentId: r.incidentId,
    kind: r.kind as MacroKind,
    geometry: r.geometry as MacroGeometry,
    weight: typeof r.weight === "number" && Number.isFinite(r.weight) ? r.weight : 1,
    source: r.source as MacroSource,
    notes: typeof r.notes === "string" ? r.notes : "",
    createdAtUtc: typeof r.createdAtUtc === "string" ? r.createdAtUtc : new Date().toISOString(),
  };
  const numOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  if (r.bearingDeg !== undefined) m.bearingDeg = numOrNull(r.bearingDeg);
  if (r.spreadDeg !== undefined) m.spreadDeg = numOrNull(r.spreadDeg);
  if (r.radiusM !== undefined) m.radiusM = numOrNull(r.radiusM);
  if (typeof r.chainId === "string") m.chainId = r.chainId;
  if (typeof r.supersedesId === "string") m.supersedesId = r.supersedesId;
  if (typeof r.voided === "boolean") m.voided = r.voided;
  if (typeof r.voidReason === "string") m.voidReason = r.voidReason;
  if (typeof r.recordHash === "string") m.recordHash = r.recordHash;
  return m;
}
