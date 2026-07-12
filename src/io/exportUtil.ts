// Shared plumbing for the V7 court-ready exporters (GeoJSON / KML / GeoPackage / PDF).
//
// Each exporter is a pure string/bytes builder plus a thin browser wrapper that (1) makes
// sure the store carries a fresh origin solution — the single source every format reads
// (Stage 1) — (2) triggers the download, and (3) appends an EXPORT audit entry (V6) so the
// custody trail records exactly which solution left the app, in which format.

import type { Store } from "../store";
import { buildSolution, type OriginSolution } from "../geo/solution";
import { projectAlong, enuFromLatLon, type LatLon } from "../geo/enu";
import type { Node } from "../domain/node";

export type ExportFormat = "geojson" | "kml" | "gpkg" | "pdf";

/** Recompute + persist the origin solution so every format serializes the SAME snapshot. */
export function ensureSolution(store: Store): OriginSolution | null {
  const sol = buildSolution(store);
  store.setSolution(sol);
  return sol;
}

/** A filename-safe slug (mirrors savefile.ts). */
export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "investigation";
}

/** `backtrace-<name>-<yyyy-mm-dd>.<ext>` for a downloaded artifact. */
export function exportFilename(name: string, ext: string, utc = new Date().toISOString()): string {
  return `backtrace-${slug(name)}-${utc.slice(0, 10)}.${ext}`;
}

/** Trigger a browser download of bytes/text under `filename` with the given MIME. */
export function downloadBlob(data: string | Uint8Array, filename: string, mime: string): void {
  // Cast: TS 5.9 types Uint8Array as Uint8Array<ArrayBufferLike>, which the DOM's
  // BlobPart won't accept, though a Uint8Array is a valid BlobPart at runtime.
  const blob = new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Append the EXPORT custody entry naming the format + the solution that left the app. */
export function recordExport(store: Store, format: ExportFormat, sol: OriginSolution | null): void {
  store.recordAudit({
    action: "EXPORT",
    entity: "INVESTIGATION",
    entityId: store.getIncident().id,
    after: {
      format,
      solutionId: sol?.id ?? null,
      algorithm: sol?.algorithm ?? null,
      region95AreaM2: sol?.region95AreaM2 ?? null,
      nNodesUsed: sol?.nNodesUsed ?? null,
    },
  });
}

/**
 * A reproducible bearing-ray ground length (m): far enough that every node's ray reaches
 * past the candidate area. Derived from the solution's primary mode (or a fixed fallback)
 * so an export is deterministic — unlike the map's view-scaled ray length.
 */
export function rayMeters(sol: OriginSolution | null, nodes: Node[], anchor: LatLon): number {
  const mode = sol?.modePointsWgs84[0];
  if (!mode) return 2000;
  const modeEnu = enuFromLatLon(mode.lat, mode.lon, anchor);
  let maxD = 0;
  for (const n of nodes) {
    if (n.azimuthTrueDeg == null) continue;
    const e = enuFromLatLon(n.lat, n.lon, anchor);
    const d = Math.hypot(modeEnu.e - e.e, modeEnu.n - e.n);
    if (d > maxD) maxD = d;
  }
  return Math.max(500, maxD * 1.15);
}

/** The endpoint (WGS84) of a node's bearing ray, projected `meters` out along its azimuth. */
export function rayEnd(anchor: LatLon, from: LatLon, azDeg: number, meters: number): LatLon {
  return projectAlong(anchor, from, azDeg, meters);
}
