// Node — one placed fire-pattern indicator on the map.
//
// A Node mirrors the mockup's NODES data ({ indicator, spread, sigma, lat/lon,
// color }) but keyed to the real domain: the color comes from the indicator type
// (not stored on the node), and it carries a real `azimuthTrueDeg` for v3's bearing
// work (null until the compass dial sets it). Shaped so v5's export can serialize
// the store's nodes directly.

import type { IndicatorCode } from "./indicators";
import { getIndicator } from "./indicators";

/**
 * How the fire was spreading where this sign was read. Drives the marker SHAPE
 * (advancing ▲, lateral ◆, backing ■, undetermined ●) — see the mockup's legend.
 */
export type SpreadType = "ADVANCING" | "LATERAL" | "BACKING" | "UNDETERMINED";

// --- Provenance enums (CRESEARCH.md §3) -------------------------------------
// How a position fix was obtained; how it reached the record.
export type FixType = "GNSS" | "RTK" | "FUSED" | "MANUAL";
export type PositionSource = "DEVICE" | "EXTERNAL_GNSS" | "MAP_PIN";
// How a bearing was determined (magnetometer, two GNSS points, or typed by hand).
export type AzimuthMethod = "MAGNETOMETER" | "TWO_POINT_GNSS" | "MANUAL";
// Magnetometer self-reported calibration quality (Android SensorManager-style).
export type MagAccuracy = "UNRELIABLE" | "LOW" | "MEDIUM" | "HIGH";
// The investigator's own confidence in this reading.
export type InvestigatorConf = "HIGH" | "MED" | "LOW";

/**
 * A Backtrace node — a single placed fire-pattern indicator AND its defensible
 * record (CRESEARCH.md §3). The first block (id…notes) is the live v0 data the
 * posterior + map read; everything after it is court-grade provenance, ALL
 * optional/nullable so a desk-entered node is valid with them unset. V9's live
 * sensor capture is what fills them; the exporters (V7) map straight off them.
 */
export interface Node {
  /** Stable id (also the selection key + serialized key). */
  id: string;
  lat: number;
  lon: number;
  /** Which indicator this is — supplies color, default sigma, MICRO/MACRO scale. */
  indicatorCode: IndicatorCode;
  /** Marker shape / spread direction class. */
  spreadType: SpreadType;
  /** True-north azimuth in degrees, set on the compass dial in v3. Null until then. */
  azimuthTrueDeg: number | null;
  /**
   * Angular uncertainty override in degrees. When null, effectiveSigma() falls back
   * to the indicator's Parker & Babrauskas prior. A non-null value wins.
   */
  sigmaDeg: number | null;
  /** Free-text field note. */
  notes: string;

  // --- identity / chain of custody (append-only, wired in Stage 2) ----------
  /** Logical chain id shared by every row of one correction chain (root's id). */
  chainId?: string;
  /** The node this row corrects/replaces; null/undefined for an original row. */
  supersedesNodeId?: string | null;
  /** True when this row voids its chain (a removal that never deletes). */
  voided?: boolean;
  /** Why the chain was voided — required by store.void(). */
  voidReason?: string | null;

  // --- position provenance (V9 fills from live GNSS) ------------------------
  ellipsoidHeightM?: number | null;
  hAccuracyM?: number | null;
  vAccuracyM?: number | null;
  hdop?: number | null;
  pdop?: number | null;
  satCount?: number | null;
  fixType?: FixType | null;
  positionSource?: PositionSource | null;

  // --- orientation provenance (V9 fills from the fused compass) -------------
  azimuthMagneticDeg?: number | null;
  declinationDeg?: number | null;
  magneticModel?: string | null;
  modelEpoch?: number | null;
  gridConvergenceDeg?: number | null;
  /** Captured mirror of the live σ, for the record (live value stays sigmaDeg). */
  azimuthSigmaDeg?: number | null;
  azimuthMethod?: AzimuthMethod | null;
  pitchDeg?: number | null;
  rollDeg?: number | null;
  captureWindowMs?: number | null;
  sampleCount?: number | null;

  // --- sensor QC (populated in V9; nullable here) ---------------------------
  magAccuracyStatus?: MagAccuracy | null;
  magFieldUt?: number | null;
  magFieldWmmUt?: number | null;
  magAnomalyFlag?: boolean;
  dipMeasuredDeg?: number | null;
  dipWmmDeg?: number | null;
  gyroRmsRadS?: number | null;

  // --- domain context -------------------------------------------------------
  fuelModel?: string | null;
  slopePct?: number | null;
  aspectDeg?: number | null;
  elevationM?: number | null;
  demSource?: string | null;
  investigatorConf?: InvestigatorConf;
  conflictsCluster?: boolean;

  // --- provenance / record ---------------------------------------------------
  createdAtUtc?: string;
  /** Investigator id (nullable — single-user desk case). */
  createdBy?: string | null;
  deviceModel?: string | null;
  osVersion?: string | null;
  appVersion?: string | null;
  /** SHA-256 seal over the evidentiary fields — filled in Stage 3. */
  recordHash?: string | null;
}

/** The logical chain key for a node: its chainId, or its own id for a root row. */
export function chainKeyOf(node: Node): string {
  return node.chainId ?? node.id;
}

/**
 * The active working set from a flat, append-only node history: the latest row per
 * chain (array order = creation order, so the last row wins), dropping voided chains.
 * Pure + shared by the store and the save-file integrity check so both agree on the
 * exact set + order the manifest hash is computed over.
 */
export function deriveActiveNodes(nodes: Node[]): Node[] {
  const tips = new Map<string, Node>();
  for (const n of nodes) tips.set(chainKeyOf(n), n); // last row per chain wins
  const active: Node[] = [];
  for (const tip of tips.values()) if (!tip.voided) active.push(tip);
  return active;
}

/**
 * The uncertainty (σ, degrees) actually in force for a node: an explicit override
 * wins; otherwise the indicator type's Parker & Babrauskas prior is used. Returns
 * null when neither exists (a macro indicator with no override).
 */
export function effectiveSigma(node: Node): number | null {
  if (node.sigmaDeg != null) return node.sigmaDeg;
  return getIndicator(node.indicatorCode)?.priorSigmaDeg ?? null;
}
