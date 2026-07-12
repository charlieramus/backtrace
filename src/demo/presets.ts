// Demo presets — the thesis of the whole app, seeded (CRESEARCH.md §0, NOW.md demo).
//
// "Load demo" seeds a documented Colorado fire origin with a handful of indicator nodes
// whose bearings point back at it with the honest, LARGE Parker & Babrauskas σ. The
// resulting 95% credible region CONTAINS the real origin but is honestly BROAD — never a
// pinpoint. A second "conflicting" preset seeds contradictory indicators (two clusters) so
// the posterior goes bimodal and the readout says "two candidate origins" — the honest
// answer when the data supports both.
//
// Pure w.r.t. the store (no Leaflet/DOM); returns the seeded lat/lons + the cited origin so
// the caller can frame the map.

import type { IncidentHeader, Store } from "../store";
import type { Node, SpreadType } from "../domain/node";
import type { IndicatorCode } from "../domain/indicators";
import { projectAlong, type LatLon } from "../geo/enu";

interface NodeSpec {
  indicatorCode: IndicatorCode;
  spreadType: SpreadType;
  /** Compass direction of the node FROM the origin (deg). */
  dirFromOriginDeg: number;
  distM: number;
  /** Scatter added to the back-bearing (deg) — a little real-world disagreement. */
  azScatterDeg: number;
  sigmaDeg: number;
}

export interface DemoResult {
  /** The cited (documented / illustrative) origin the demo is built around. */
  origin: LatLon;
  /** Every seeded node's location — for map framing. */
  points: LatLon[];
}

function makeId(i: string): string {
  return `demo-${i}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Build nodes from specs around an origin; each node's azimuth points back at it. */
function seedNodes(origin: LatLon, specs: NodeSpec[]): Node[] {
  return specs.map((s, i) => {
    const at = projectAlong(origin, origin, s.dirFromOriginDeg, s.distM);
    const azimuthTrueDeg = ((s.dirFromOriginDeg + 180 + s.azScatterDeg) % 360 + 360) % 360;
    return {
      id: makeId(String(i)),
      lat: at.lat,
      lon: at.lon,
      indicatorCode: s.indicatorCode,
      spreadType: s.spreadType,
      azimuthTrueDeg,
      sigmaDeg: s.sigmaDeg,
      notes: "",
    };
  });
}

function loadInto(store: Store, name: string, origin: LatLon, nodes: Node[]): DemoResult {
  const incident: IncidentHeader = {
    id: makeId("incident"),
    name,
    createdAtUtc: new Date().toISOString(),
    anchorLat: nodes[0]?.lat ?? origin.lat,
    anchorLon: nodes[0]?.lon ?? origin.lon,
  };
  store.load({ incident, nodes });
  return { origin, points: nodes.map((n) => ({ lat: n.lat, lon: n.lon })) };
}

// Marshall Fire, Boulder County, CO — Dec 30, 2021. Illustrative published area of origin
// near Marshall/CO-93 (~39.9530, −105.2730); the official investigation identified two
// nearby ignition areas. Used here as a documented desk-demo target.
const MARSHALL_ORIGIN: LatLon = { lat: 39.953, lon: -105.273 };

const MARSHALL_SPECS: NodeSpec[] = [
  { indicatorCode: "ANGLE_OF_CHAR", spreadType: "ADVANCING", dirFromOriginDeg: 35, distM: 900, azScatterDeg: 10, sigmaDeg: 98 },
  { indicatorCode: "STAINING", spreadType: "LATERAL", dirFromOriginDeg: 110, distM: 1200, azScatterDeg: -14, sigmaDeg: 106 },
  { indicatorCode: "PROTECTION", spreadType: "BACKING", dirFromOriginDeg: 200, distM: 850, azScatterDeg: 8, sigmaDeg: 81 },
  { indicatorCode: "SOOTING", spreadType: "ADVANCING", dirFromOriginDeg: 275, distM: 1050, azScatterDeg: -8, sigmaDeg: 97 },
  { indicatorCode: "WHITE_ASH", spreadType: "LATERAL", dirFromOriginDeg: 340, distM: 700, azScatterDeg: 6, sigmaDeg: 81 },
];

/** Seed the honest Marshall demo: broad 95% region that contains the origin, one mode. */
export function loadMarshallDemo(store: Store): DemoResult {
  const nodes = seedNodes(MARSHALL_ORIGIN, MARSHALL_SPECS);
  return loadInto(store, "Marshall Fire — desk trace", MARSHALL_ORIGIN, nodes);
}

/** Seed a deliberately conflicting case: two clusters → a bimodal posterior. */
export function loadConflictingDemo(store: Store): DemoResult {
  const oA: LatLon = { lat: 39.953, lon: -105.273 };
  const oB = projectAlong(oA, oA, 95, 5200); // ~5.2 km ESE — a second candidate origin
  // Moderately tight σ so the two crossings resolve as distinct peaks (the point is the
  // shape of disagreement — the data supports two origins — not the individual σ).
  const specsA: NodeSpec[] = [
    { indicatorCode: "ANGLE_OF_CHAR", spreadType: "ADVANCING", dirFromOriginDeg: 25, distM: 650, azScatterDeg: 3, sigmaDeg: 20 },
    { indicatorCode: "PROTECTION", spreadType: "BACKING", dirFromOriginDeg: 155, distM: 650, azScatterDeg: -3, sigmaDeg: 20 },
  ];
  const specsB: NodeSpec[] = [
    { indicatorCode: "SOOTING", spreadType: "ADVANCING", dirFromOriginDeg: 25, distM: 650, azScatterDeg: -3, sigmaDeg: 20 },
    { indicatorCode: "STAINING", spreadType: "LATERAL", dirFromOriginDeg: 155, distM: 650, azScatterDeg: 3, sigmaDeg: 20 },
  ];
  const nodes = [...seedNodes(oA, specsA), ...seedNodes(oB, specsB)];
  // frame around the midpoint of the two origins
  const mid = projectAlong(oA, oA, 95, 2600);
  return loadInto(store, "Conflicting indicators — two origins", mid, nodes);
}
