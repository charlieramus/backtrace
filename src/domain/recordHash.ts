// Record hashing — the tamper-evident seal on every defensible record (CRESEARCH.md §3).
//
// Each node's evidentiary fields are canonicalized into a stable, key-ordered string and
// SHA-256'd (Web Crypto) into `recordHash`. The whole investigation gets a manifest hash
// over the ordered active-node hashes + the incident header. On import we recompute both
// and flag any mismatch — a Daubert/cross-examination shield: "has this record changed?"
//
// What's sealed: the substantive claim — id, position (+ position provenance), the bearing
// + orientation provenance, the domain context, spread, indicator, when it was recorded,
// who by, and the chain links (supersedes / voided / reason). What's NOT sealed: `recordHash`
// itself, the `chainId` routing key, and the raw magnetometer/gyro TELEMETRY (sensor-QC
// diagnostics that describe how a reading was taken, not the asserted reading) — so a
// diagnostic value can differ without breaking the seal.

import type { Node } from "./node";
import { deriveActiveNodes } from "./node";
import type { IncidentHeader } from "../store";

/** The evidentiary fields sealed into a node's recordHash, in canonical order. */
export const EVIDENTIARY_KEYS: readonly (keyof Node)[] = [
  "id",
  "lat",
  "lon",
  "indicatorCode",
  "spreadType",
  "azimuthTrueDeg",
  "sigmaDeg",
  // position provenance
  "ellipsoidHeightM", "hAccuracyM", "vAccuracyM", "hdop", "pdop", "satCount", "fixType", "positionSource",
  // orientation provenance
  "azimuthMagneticDeg", "declinationDeg", "magneticModel", "modelEpoch", "gridConvergenceDeg",
  "azimuthSigmaDeg", "azimuthMethod", "pitchDeg", "rollDeg", "captureWindowMs", "sampleCount",
  // domain context
  "fuelModel", "slopePct", "aspectDeg", "elevationM", "demSource", "investigatorConf", "conflictsCluster",
  // record identity / provenance
  "createdAtUtc", "createdBy", "deviceModel", "osVersion", "appVersion",
  // chain of custody
  "supersedesNodeId", "voided", "voidReason",
  "notes",
];

const INCIDENT_KEYS: readonly (keyof IncidentHeader)[] = [
  "id", "name", "createdAtUtc", "anchorLat", "anchorLon",
  "agencyIncidentNo", "datum", "createdBy", "discoveredAtUtc",
];

/** Canonicalize a value to a stable string: allowlisted keys, sorted, JSON-encoded. */
function canonicalize(obj: Record<string, unknown>, keys: readonly string[]): string {
  const present = keys.filter((k) => obj[k] !== undefined).sort();
  const picked: Record<string, unknown> = {};
  for (const k of present) picked[k] = obj[k] ?? null;
  return JSON.stringify(picked, present);
}

/** The canonical evidentiary serialization of a node (excludes recordHash). */
export function canonicalizeNode(node: Node): string {
  return canonicalize(node as unknown as Record<string, unknown>, EVIDENTIARY_KEYS as readonly string[]);
}

function subtle(): SubtleCrypto {
  const c = globalThis.crypto;
  if (!c || !c.subtle) throw new Error("Web Crypto (crypto.subtle) is unavailable");
  return c.subtle;
}

/** SHA-256 of a UTF-8 string → lowercase hex. */
export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await subtle().digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** SHA-256 seal over a node's evidentiary fields. */
export function computeRecordHash(node: Node): Promise<string> {
  return sha256Hex(canonicalizeNode(node));
}

/**
 * The investigation's manifest hash: a seal over the incident header + the ordered
 * hashes of the ACTIVE nodes (latest non-voided per chain). Recomputes node hashes fresh
 * so it never trusts a possibly-stale stored value.
 */
export async function computeManifestHash(
  incident: IncidentHeader,
  nodes: Node[],
): Promise<string> {
  const active = deriveActiveNodes(nodes);
  const hashes = await Promise.all(active.map(computeRecordHash));
  const header = canonicalize(incident as unknown as Record<string, unknown>, INCIDENT_KEYS as readonly string[]);
  return sha256Hex(`${header}\n${hashes.join(",")}`);
}
