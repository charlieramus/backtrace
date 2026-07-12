// Origin solution — a versioned, reproducible snapshot of ONE posterior run
// (CRESEARCH.md §3 origin_solution). This is the substrate every V7 exporter reads:
// it captures the algorithm + params + inputs + the HDR 50/68/95 credible regions +
// the quality numbers the readout shows, converted to WGS84 once, at the export
// boundary, so nothing downstream recomputes geometry. It answers, months later,
// "what did the app say on this date, and why?".
//
// Pure + DOM-free. buildSolution(store) runs the existing posterior (posterior.ts) +
// HDR (hdr.ts) over activeNodes() and reuses enu.ts for the single ENU→WGS84 path.
// The court-defensibility rule holds: a region is always the CANDIDATE AREA (a
// MultiPolygon + a stated confidence + algorithm + node count) — never a bare point.

import type { Store } from "../store";
import type { LatLon, Enu } from "./enu";
import { enuToLatLon, enuFromLatLon } from "./enu";
import {
  computePosterior,
  kappaFromSigma,
  wrapPi,
  cellCenterLatLon,
  type PosteriorGrid,
} from "./posterior";
import {
  hdrRegions,
  candidateAreaM2,
  normalizedEntropy,
  modeCount,
  modePoints,
  geometryQuality,
} from "./hdr";
import { effectiveSigma } from "../domain/node";

const DEG = Math.PI / 180;

export const SOLUTION_ALGORITHM = "GRID_VONMISES_V1";
export const SOLUTION_ALGORITHM_VERSION = 1;

// --- minimal GeoJSON geometry (WGS84, [lon, lat] order) ---------------------
export type Position = [number, number];
export type LinearRing = Position[];
export type PolygonCoords = LinearRing[];
export interface MultiPolygon {
  type: "MultiPolygon";
  coordinates: PolygonCoords[];
}

/** The three HDR credible regions of a solution, as WGS84 MultiPolygons. */
export interface SolutionRegions {
  p50: MultiPolygon;
  p68: MultiPolygon;
  p95: MultiPolygon;
}

/** One node's contribution to the solution, for the audit + report. */
export interface SolutionInput {
  nodeId: string;
  /** Relative weight applied to this node (equal-weighting = 1 in GRID_VONMISES_V1). */
  weightUsed: number;
  /** The von Mises concentration κ derived from the node's effective σ. */
  kappaUsed: number;
  /** Residual (deg) between the node's azimuth and the bearing to the primary mode. */
  residualDeg: number;
}

/**
 * A versioned, reproducible snapshot of one posterior run. Persisted on the store and
 * carried in the v2 save file's `solution` slot; every exporter reads it verbatim.
 */
export interface OriginSolution {
  id: string;
  incidentId: string;
  computedUtc: string;
  algorithm: typeof SOLUTION_ALGORITHM;
  algorithmVersion: number;
  /** JSON string of the exact params (κ mapping, ε, grid geometry, prior) — reproducible. */
  paramsJson: string;
  regions: SolutionRegions;
  region95AreaM2: number;
  posteriorEntropy: number;
  nModes: number;
  /** Bearing-geometry condition number (λmax/λmin); high = ill-conditioned. */
  conditionNumber?: number;
  nNodesUsed: number;
  /** Posterior mode(s) as WGS84 — labelled downstream as modes of a credible region. */
  modePointsWgs84: LatLon[];
  solutionInputs: SolutionInput[];
}

// --- region mask → WGS84 MultiPolygon ---------------------------------------
//
// Trace the boundary of an HDR region's cell mask into closed rings (directed cell
// edges stitched corner-to-corner, filled interior kept on the LEFT → CCW outer rings,
// CW holes), classify holes by containment, and convert every corner ENU→WGS84 once.

interface Pt {
  e: number;
  n: number;
}

/** Signed area (m²) of a closed ENU ring; positive = CCW. */
function signedAreaEnu(ring: Pt[]): number {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i].e * ring[i + 1].n - ring[i + 1].e * ring[i].n;
  }
  return a / 2;
}

/** Ray-cast point-in-polygon on an ENU ring. */
function pointInRingEnu(p: Pt, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i].n;
    const yj = ring[j].n;
    const xi = ring[i].e;
    const xj = ring[j].e;
    const intersect =
      yi > p.n !== yj > p.n && p.e < ((xj - xi) * (p.n - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Trace a region mask into closed ENU rings (outer CCW, holes CW). */
function regionRingsEnu(g: PosteriorGrid, mask: Uint8Array): Pt[][] {
  const { nx, ny, cellSizeM, extent } = g;
  const K = nx + 1; // corners per row
  const filled = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < nx && y < ny && mask[y * nx + x] === 1;
  const ck = (x: number, y: number): number => y * K + x;

  // fromCornerKey -> list of toCornerKeys (a corner can host >1 out-edge at pinch points)
  const adj = new Map<number, number[]>();
  const push = (ax: number, ay: number, bx: number, by: number): void => {
    const fk = ck(ax, ay);
    const l = adj.get(fk);
    if (l) l.push(ck(bx, by));
    else adj.set(fk, [ck(bx, by)]);
  };

  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      if (!filled(x, y)) continue;
      // emit each boundary side directed so the filled cell stays on the left
      if (!filled(x + 1, y)) push(x + 1, y, x + 1, y + 1); // right edge, up
      if (!filled(x, y + 1)) push(x + 1, y + 1, x, y + 1); // top edge, left
      if (!filled(x - 1, y)) push(x, y + 1, x, y); // left edge, down
      if (!filled(x, y - 1)) push(x, y, x + 1, y); // bottom edge, right
    }
  }

  const cornerE = (kx: number): number => extent.minE + kx * cellSizeM;
  const cornerN = (ky: number): number => extent.minN + ky * cellSizeM;
  const rings: Pt[][] = [];
  for (const [startKey, list] of adj) {
    while (list.length) {
      const loop: number[] = [startKey];
      let cur = list.shift()!;
      loop.push(cur);
      let guard = 0;
      const maxSteps = (nx + 1) * (ny + 1) * 4 + 4;
      while (cur !== startKey && guard++ < maxSteps) {
        const outs = adj.get(cur);
        if (!outs || outs.length === 0) break; // open chain (shouldn't happen)
        const nxt = outs.shift()!;
        loop.push(nxt);
        cur = nxt;
      }
      if (loop.length >= 4 && loop[0] === loop[loop.length - 1]) {
        rings.push(loop.map((k) => ({ e: cornerE(k % K), n: cornerN(Math.floor(k / K)) })));
      }
    }
  }
  return rings;
}

/** Convert an HDR region mask to a WGS84 MultiPolygon (outer rings + their holes). */
export function regionMultiPolygon(g: PosteriorGrid, mask: Uint8Array): MultiPolygon {
  const rings = regionRingsEnu(g, mask);
  const outers: { ring: Pt[]; area: number; holes: Pt[][] }[] = [];
  const holes: Pt[][] = [];
  for (const r of rings) {
    if (signedAreaEnu(r) >= 0) outers.push({ ring: r, area: signedAreaEnu(r), holes: [] });
    else holes.push(r);
  }
  // assign each hole to the smallest-area outer ring that contains it
  for (const h of holes) {
    let best: { ring: Pt[]; area: number; holes: Pt[][] } | null = null;
    for (const o of outers) {
      if (pointInRingEnu(h[0], o.ring) && (best === null || o.area < best.area)) best = o;
    }
    (best ?? outers[0])?.holes.push(h);
  }

  const toLonLat = (ring: Pt[]): LinearRing =>
    ring.map((p) => {
      const ll = enuToLatLon(p.e, p.n, g.anchor);
      return [ll.lon, ll.lat] as Position;
    });

  const coordinates: PolygonCoords[] = outers.map((o) => [toLonLat(o.ring), ...o.holes.map(toLonLat)]);
  return { type: "MultiPolygon", coordinates };
}

// --- buildSolution ----------------------------------------------------------

function solutionId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return `sol-${c.randomUUID()}`;
  return "sol-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Build the origin solution for the current investigation: run the same posterior +
 * HDR the readout uses over the store's active nodes, snapshot the credible regions in
 * WGS84, and record the algorithm/params/inputs. Returns null when fewer than two
 * bearings exist (no crossing — same gate as the posterior/readout).
 */
export function buildSolution(store: Store): OriginSolution | null {
  const nodes = store.activeNodes();
  const inc = store.getIncident();
  const anchor: LatLon | undefined =
    inc.anchorLat != null && inc.anchorLon != null
      ? { lat: inc.anchorLat, lon: inc.anchorLon }
      : undefined;

  const eps = 0.15;
  const g = computePosterior(nodes, anchor ? { anchor, eps } : { eps });
  if (!g) return null;

  const regions = hdrRegions(g);
  const [p50, p68, p95] = regions;
  const region95AreaM2 = candidateAreaM2(regions);
  const posteriorEntropy = normalizedEntropy(g);
  const nModes = modeCount(g);
  const modePointsWgs84 = modePoints(g).map((m) => cellCenterLatLon(g, m.ix, m.iy));
  const geom = geometryQuality(nodes);

  // Residual of each bearing node against the bearing to the primary (highest) mode.
  const primary = modePointsWgs84[0];
  const primaryEnu: Enu | null = primary ? enuFromLatLon(primary.lat, primary.lon, g.anchor) : null;
  const bearingNodes = nodes.filter((n) => {
    const s = effectiveSigma(n);
    return n.azimuthTrueDeg != null && s != null && s > 0;
  });
  const solutionInputs: SolutionInput[] = bearingNodes.map((n) => {
    const sigmaRad = (effectiveSigma(n) as number) * DEG;
    let residualDeg = 0;
    if (primaryEnu) {
      const en = enuFromLatLon(n.lat, n.lon, g.anchor);
      const beta = Math.atan2(primaryEnu.e - en.e, primaryEnu.n - en.n); // node → mode
      residualDeg = (wrapPi((n.azimuthTrueDeg as number) * DEG - beta) / DEG);
    }
    return {
      nodeId: n.id,
      weightUsed: 1, // GRID_VONMISES_V1 weights every bearing equally
      kappaUsed: kappaFromSigma(sigmaRad),
      residualDeg,
    };
  });

  const params = {
    kappaMapping: "FISHER_1993_INVERSION",
    eps,
    marginFrac: 0.6,
    nx: g.nx,
    ny: g.ny,
    cellSizeM: g.cellSizeM,
    extent: g.extent,
    prior: "uniform spatial prior; per-indicator von Mises (Parker & Babrauskas 2024 σ)",
  };

  const sol: OriginSolution = {
    id: solutionId(),
    incidentId: inc.id,
    computedUtc: new Date().toISOString(),
    algorithm: SOLUTION_ALGORITHM,
    algorithmVersion: SOLUTION_ALGORITHM_VERSION,
    paramsJson: JSON.stringify(params),
    regions: {
      p50: regionMultiPolygon(g, p50.mask),
      p68: regionMultiPolygon(g, p68.mask),
      p95: regionMultiPolygon(g, p95.mask),
    },
    region95AreaM2,
    posteriorEntropy,
    nModes,
    conditionNumber: Number.isFinite(geom.condition) ? geom.condition : undefined,
    nNodesUsed: g.nodesUsed,
    modePointsWgs84,
    solutionInputs,
  };
  return sol;
}
