// GeoJSON exporter — the pure, dependency-free GIS export (CRESEARCH.md §5). One WGS84
// FeatureCollection carrying, as layers-by-property (`kind`): node points with their
// provenance, bearing rays as LineStrings, the p50/p68/p95 HDR credible regions as
// (Multi)Polygons with a `level`, and the posterior mode point(s). A top-level `properties`
// carries the datum, algorithm + version, and the region-95 area. It reads solution.ts
// geometry verbatim — it never recomputes the posterior — and it never emits a bare origin
// point: a mode is always labelled a mode of a stated credible region (CRESEARCH.md §4.5).

import type { Store } from "../store";
import type { IncidentHeader } from "../store";
import type { Node } from "../domain/node";
import { effectiveSigma } from "../domain/node";
import type { MacroConstraint } from "../domain/macro";
import type { LatLon } from "../geo/enu";
import type { OriginSolution, MultiPolygon } from "../geo/solution";
import { APP_VERSION } from "./savefile";
import {
  ensureSolution,
  downloadBlob,
  exportFilename,
  recordExport,
  rayMeters,
  rayEnd,
} from "./exportUtil";

export const KNOWN_ERROR_NOTE =
  "Underlying fire-pattern indicators carry large directional error (mean ~103°, Parker & " +
  "Babrauskas 2024). Credible regions reflect that; this is a candidate AREA, not a point.";

interface Feature {
  type: "Feature";
  geometry: unknown;
  properties: Record<string, unknown>;
}

function anchorOf(incident: IncidentHeader, nodes: Node[]): LatLon | null {
  if (incident.anchorLat != null && incident.anchorLon != null)
    return { lat: incident.anchorLat, lon: incident.anchorLon };
  const n = nodes[0];
  return n ? { lat: n.lat, lon: n.lon } : null;
}

function nodeFeature(n: Node): Feature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [n.lon, n.lat] },
    properties: {
      kind: "node",
      id: n.id,
      indicatorCode: n.indicatorCode,
      spreadType: n.spreadType,
      azimuthTrueDeg: n.azimuthTrueDeg,
      sigmaDeg: effectiveSigma(n),
      sigmaOverrideDeg: n.sigmaDeg,
      azimuthMethod: n.azimuthMethod ?? null,
      positionSource: n.positionSource ?? null,
      hAccuracyM: n.hAccuracyM ?? null,
      investigatorConf: n.investigatorConf ?? null,
      conflictsCluster: n.conflictsCluster ?? false,
      recordHash: n.recordHash ?? null,
    },
  };
}

function rayFeature(n: Node, end: LatLon): Feature {
  return {
    type: "Feature",
    geometry: { type: "LineString", coordinates: [[n.lon, n.lat], [end.lon, end.lat]] },
    properties: {
      kind: "ray",
      nodeId: n.id,
      indicatorCode: n.indicatorCode,
      azimuthTrueDeg: n.azimuthTrueDeg,
      sigmaDeg: effectiveSigma(n),
    },
  };
}

function regionFeature(mp: MultiPolygon, level: number, sol: OriginSolution): Feature {
  return {
    type: "Feature",
    geometry: mp,
    properties: {
      kind: "region",
      level,
      confidencePct: Math.round(level * 100),
      algorithm: sol.algorithm,
      algorithmVersion: sol.algorithmVersion,
      ...(level === 0.95 ? { areaM2: sol.region95AreaM2 } : {}),
    },
  };
}

function macroFeature(m: MacroConstraint): Feature {
  return {
    type: "Feature",
    geometry: m.geometry,
    properties: {
      kind: "macro",
      id: m.id,
      macroKind: m.kind,
      source: m.source,
      weight: m.weight,
      bearingDeg: m.bearingDeg ?? null,
      spreadDeg: m.spreadDeg ?? null,
      radiusM: m.radiusM ?? null,
      notes: m.notes,
      role: "Bayesian prior over the origin (not a ray) — fused as log_prior + Σ log_likelihood.",
      recordHash: m.recordHash ?? null,
    },
  };
}

function modeFeature(p: LatLon, i: number, sol: OriginSolution): Feature {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [p.lon, p.lat] },
    properties: {
      kind: "mode",
      index: i,
      label: "posterior mode of the 95% credible region",
      confidencePct: 95,
      algorithm: sol.algorithm,
      algorithmVersion: sol.algorithmVersion,
      nNodesUsed: sol.nNodesUsed,
      note: "A mode of a credible region — NOT a surveyed point of origin.",
    },
  };
}

/** Build the GeoJSON string from a solution + the active nodes (pure, DOM-free). */
export function buildGeoJson(
  sol: OriginSolution,
  nodes: Node[],
  incident: IncidentHeader,
  macros: MacroConstraint[] = [],
): string {
  const anchor = anchorOf(incident, nodes);
  const bearingNodes = nodes.filter((n) => n.azimuthTrueDeg != null);
  const meters = anchor ? rayMeters(sol, nodes, anchor) : 2000;

  const features: Feature[] = [];
  for (const n of nodes) features.push(nodeFeature(n));
  for (const m of macros) features.push(macroFeature(m));
  if (anchor) {
    for (const n of bearingNodes) {
      const end = rayEnd(anchor, { lat: n.lat, lon: n.lon }, n.azimuthTrueDeg as number, meters);
      features.push(rayFeature(n, end));
    }
  }
  features.push(regionFeature(sol.regions.p50, 0.5, sol));
  features.push(regionFeature(sol.regions.p68, 0.68, sol));
  features.push(regionFeature(sol.regions.p95, 0.95, sol));
  sol.modePointsWgs84.forEach((p, i) => features.push(modeFeature(p, i, sol)));

  const fc = {
    type: "FeatureCollection",
    properties: {
      generator: `Backtrace ${APP_VERSION}`,
      datum: incident.datum ?? "WGS84",
      incidentId: incident.id,
      incidentName: incident.name,
      agencyIncidentNo: incident.agencyIncidentNo ?? null,
      algorithm: sol.algorithm,
      algorithmVersion: sol.algorithmVersion,
      computedUtc: sol.computedUtc,
      region95AreaM2: sol.region95AreaM2,
      nModes: sol.nModes,
      nNodesUsed: sol.nNodesUsed,
      nMacroConstraints: macros.length,
      knownErrorNote: KNOWN_ERROR_NOTE,
    },
    features,
  };
  return JSON.stringify(fc, null, 2);
}

/** Export the current investigation as a downloaded `.geojson` (offline). */
export function exportGeoJson(store: Store): void {
  const sol = ensureSolution(store);
  const incident = store.getIncident();
  if (!sol) return; // caller gates on an empty/under-constrained store
  const json = buildGeoJson(sol, store.activeNodes(), incident, store.activeMacros());
  downloadBlob(json, exportFilename(incident.name, "geojson"), "application/geo+json");
  recordExport(store, "geojson", sol);
}
