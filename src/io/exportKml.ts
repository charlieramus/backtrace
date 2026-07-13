// KML exporter — the same content as the GeoJSON, as OGC KML for Google Earth / GIS.
// A pure, DOM-free string builder. Node placemarks are styled by INDICATOR colour AND
// carry their SPREAD in the placemark name + ExtendedData + icon heading — spread is never
// conveyed by colour alone (CRESEARCH.md §4.5 colour-blind rule). The p50/p68/p95 credible
// regions are graded-opacity polygons (tightest = most opaque), and the Document
// description states the datum, algorithm + version, and the known ~103° indicator error
// rate. Geometry is read verbatim from solution.ts — the posterior is never recomputed.

import type { Store } from "../store";
import type { IncidentHeader } from "../store";
import type { Node } from "../domain/node";
import { effectiveSigma } from "../domain/node";
import type { MacroConstraint } from "../domain/macro";
import { getIndicator, indicatorHex } from "../domain/indicators";
import type { LatLon } from "../geo/enu";
import type { OriginSolution, MultiPolygon } from "../geo/solution";
import { APP_VERSION } from "./savefile";
import { KNOWN_ERROR_NOTE } from "./exportGeoJson";
import {
  ensureSolution,
  downloadBlob,
  exportFilename,
  recordExport,
  rayMeters,
  rayEnd,
} from "./exportUtil";

const REGION_FILL = "8b7bc4"; // the map's muted-purple field (--post-hi)
const REGION_ALPHA: Record<string, string> = { "0.5": "b0", "0.68": "70", "0.95": "38" };
const SPREAD_HEADING: Record<string, number> = {
  ADVANCING: 0,
  LATERAL: 90,
  BACKING: 180,
  UNDETERMINED: 270,
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** `#rrggbb` (+ alpha byte) → KML `aabbggrr`. */
function kmlColor(hex: string, alpha = "ff"): string {
  const h = hex.replace("#", "");
  const rr = h.slice(0, 2);
  const gg = h.slice(2, 4);
  const bb = h.slice(4, 6);
  return `${alpha}${bb}${gg}${rr}`;
}

function coordString(ring: number[][]): string {
  return ring.map(([lon, lat]) => `${lon},${lat},0`).join(" ");
}

/** A KML <MultiGeometry> of <Polygon>s (outer + inner boundaries) from a MultiPolygon. */
function multiPolygonKml(mp: MultiPolygon): string {
  const polys = mp.coordinates
    .map((poly) => {
      const outer = poly[0] ?? [];
      const holes = poly.slice(1);
      const inner = holes
        .map((h) => `<innerBoundaryIs><LinearRing><coordinates>${coordString(h)}</coordinates></LinearRing></innerBoundaryIs>`)
        .join("");
      return (
        `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordString(outer)}` +
        `</coordinates></LinearRing></outerBoundaryIs>${inner}</Polygon>`
      );
    })
    .join("");
  return `<MultiGeometry>${polys}</MultiGeometry>`;
}

function nodePlacemark(n: Node): string {
  const ind = getIndicator(n.indicatorCode);
  const label = ind?.label ?? n.indicatorCode;
  const color = kmlColor(indicatorHex(n.indicatorCode));
  const heading = SPREAD_HEADING[n.spreadType] ?? 0;
  const sigma = effectiveSigma(n);
  return (
    `<Placemark>` +
    `<name>${esc(`${label} — ${n.spreadType}`)}</name>` +
    `<Style><IconStyle><color>${color}</color><heading>${heading}</heading></IconStyle></Style>` +
    `<ExtendedData>` +
    `<Data name="indicatorCode"><value>${esc(n.indicatorCode)}</value></Data>` +
    `<Data name="spreadType"><value>${esc(n.spreadType)}</value></Data>` +
    `<Data name="azimuthTrueDeg"><value>${n.azimuthTrueDeg ?? ""}</value></Data>` +
    `<Data name="sigmaDeg"><value>${sigma ?? ""}</value></Data>` +
    `<Data name="azimuthMethod"><value>${esc(n.azimuthMethod ?? "")}</value></Data>` +
    `<Data name="positionSource"><value>${esc(n.positionSource ?? "")}</value></Data>` +
    `<Data name="investigatorConf"><value>${esc(n.investigatorConf ?? "")}</value></Data>` +
    `<Data name="recordHash"><value>${esc(n.recordHash ?? "")}</value></Data>` +
    `</ExtendedData>` +
    `<Point><coordinates>${n.lon},${n.lat},0</coordinates></Point>` +
    `</Placemark>`
  );
}

function rayPlacemark(n: Node, end: LatLon): string {
  const color = kmlColor(indicatorHex(n.indicatorCode));
  return (
    `<Placemark>` +
    `<name>${esc(`Bearing ${Math.round(n.azimuthTrueDeg as number)}°`)}</name>` +
    `<Style><LineStyle><color>${color}</color><width>2</width></LineStyle></Style>` +
    `<LineString><tessellate>1</tessellate><coordinates>` +
    `${n.lon},${n.lat},0 ${end.lon},${end.lat},0` +
    `</coordinates></LineString></Placemark>`
  );
}

function regionPlacemark(mp: MultiPolygon, level: number): string {
  const alpha = REGION_ALPHA[String(level)] ?? "40";
  const fill = kmlColor(`#${REGION_FILL}`, alpha);
  const line = kmlColor(`#${REGION_FILL}`, "cc");
  const pct = Math.round(level * 100);
  return (
    `<Placemark>` +
    `<name>${pct}% credible region</name>` +
    `<Style><LineStyle><color>${line}</color><width>1.4</width></LineStyle>` +
    `<PolyStyle><color>${fill}</color></PolyStyle></Style>` +
    multiPolygonKml(mp) +
    `</Placemark>`
  );
}

function modePlacemark(p: LatLon, i: number, sol: OriginSolution): string {
  return (
    `<Placemark>` +
    `<name>${esc(`Posterior mode ${i + 1} (95% region)`)}</name>` +
    `<description>${esc(
      `A mode of the 95% credible region — NOT a surveyed point of origin. ` +
        `${sol.algorithm} v${sol.algorithmVersion}, ${sol.nNodesUsed} nodes.`,
    )}</description>` +
    `<Point><coordinates>${p.lon},${p.lat},0</coordinates></Point>` +
    `</Placemark>`
  );
}

/** A KML placemark for a macro constraint — a prior over the origin, not a ray. */
function macroPlacemark(m: MacroConstraint): string {
  let geom = "";
  if (m.geometry.type === "Point") {
    geom = `<Point><coordinates>${m.geometry.coordinates[0]},${m.geometry.coordinates[1]},0</coordinates></Point>`;
  } else if (m.geometry.type === "LineString") {
    geom = `<LineString><tessellate>1</tessellate><coordinates>${coordString(m.geometry.coordinates)}</coordinates></LineString>`;
  } else {
    geom = `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordString(m.geometry.coordinates[0] ?? [])}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;
  }
  return (
    `<Placemark>` +
    `<name>${esc(`${m.kind} (${m.source})`)}</name>` +
    `<description>${esc("Bayesian prior over the origin (not a ray). " + (m.notes || ""))}</description>` +
    `<ExtendedData>` +
    `<Data name="macroKind"><value>${esc(m.kind)}</value></Data>` +
    `<Data name="source"><value>${esc(m.source)}</value></Data>` +
    `<Data name="weight"><value>${m.weight}</value></Data>` +
    `<Data name="bearingDeg"><value>${m.bearingDeg ?? ""}</value></Data>` +
    `<Data name="spreadDeg"><value>${m.spreadDeg ?? ""}</value></Data>` +
    `<Data name="radiusM"><value>${m.radiusM ?? ""}</value></Data>` +
    `</ExtendedData>${geom}</Placemark>`
  );
}

/** Build the KML string from a solution + the active nodes (pure, DOM-free). */
export function buildKml(
  sol: OriginSolution,
  nodes: Node[],
  incident: IncidentHeader,
  macros: MacroConstraint[] = [],
): string {
  const anchor: LatLon | null =
    incident.anchorLat != null && incident.anchorLon != null
      ? { lat: incident.anchorLat, lon: incident.anchorLon }
      : nodes[0]
        ? { lat: nodes[0].lat, lon: nodes[0].lon }
        : null;
  const bearingNodes = nodes.filter((n) => n.azimuthTrueDeg != null);
  const meters = anchor ? rayMeters(sol, nodes, anchor) : 2000;

  const nodeMarks = nodes.map(nodePlacemark).join("");
  const rayMarks =
    anchor
      ? bearingNodes
          .map((n) =>
            rayPlacemark(n, rayEnd(anchor, { lat: n.lat, lon: n.lon }, n.azimuthTrueDeg as number, meters)),
          )
          .join("")
      : "";
  const regionMarks =
    regionPlacemark(sol.regions.p50, 0.5) +
    regionPlacemark(sol.regions.p68, 0.68) +
    regionPlacemark(sol.regions.p95, 0.95);
  const modeMarks = sol.modePointsWgs84.map((p, i) => modePlacemark(p, i, sol)).join("");

  const desc =
    `Datum ${incident.datum ?? "WGS84"}. Algorithm ${sol.algorithm} v${sol.algorithmVersion}. ` +
    `Candidate area (95%) ${Math.round(sol.region95AreaM2).toLocaleString("en-US")} m². ` +
    `${sol.nModes} candidate origin${sol.nModes === 1 ? "" : "s"}, ${sol.nNodesUsed} nodes. ` +
    `Spread is shown in each placemark's name (colour-blind safe), colour = indicator. ` +
    KNOWN_ERROR_NOTE;

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<kml xmlns="http://www.opengis.net/kml/2.2"><Document>` +
    `<name>${esc(`Backtrace — ${incident.name}`)}</name>` +
    `<description>${esc(desc)}</description>` +
    `<atom:generator xmlns:atom="http://www.w3.org/2005/Atom">Backtrace ${esc(APP_VERSION)}</atom:generator>` +
    `<Folder><name>Macro constraints (priors)</name>${macros.map(macroPlacemark).join("")}</Folder>` +
    `<Folder><name>Indicator nodes</name>${nodeMarks}</Folder>` +
    `<Folder><name>Bearing rays</name>${rayMarks}</Folder>` +
    `<Folder><name>Credible regions</name>${regionMarks}</Folder>` +
    `<Folder><name>Posterior modes</name>${modeMarks}</Folder>` +
    `</Document></kml>`
  );
}

/** Export the current investigation as a downloaded `.kml` (offline). */
export function exportKml(store: Store): void {
  const sol = ensureSolution(store);
  const incident = store.getIncident();
  if (!sol) return;
  const kml = buildKml(sol, store.activeNodes(), incident, store.activeMacros());
  downloadBlob(kml, exportFilename(incident.name, "kml"), "application/vnd.google-earth.kml+xml");
  recordExport(store, "kml", sol);
}
