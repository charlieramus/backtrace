// Prior field from macro constraints (CRESEARCH.md §4.1) — turn each region-shaped piece of
// evidence into a log-prior over the SAME ENU grid the posterior uses. Pure, no DOM.
//
// This is the structural half of the GOA→SOA Bayes: `log_post = log_prior + Σ log_likelihood`.
// A macro constraint is NEVER a ray — it's a soft region over the origin location:
//   • FIRST_REPORT_LOC — a 2-D Gaussian bump at the reported point (soft radius).
//   • WITNESS_CONE      — an angular sector from the observer along the first-smoke bearing ±
//                         spread; inside → high, outside → falls off.
//   • V_APEX            — a ridge near the apex oriented down the V axis (higher toward the
//                         interior; penalized behind the apex and off-axis).
//   • BURN_PERIMETER    — origin must lie INSIDE → ~0 inside, strongly negative outside.
//   • EXCLUSION_ZONE    — origin cannot lie inside → strongly negative inside, 0 outside.
// Each is scaled by its weight and summed additively in log space. With NO constraints the
// field is a constant (all zeros) — the flat-prior invariant Stage 3 relies on.

import type { PosteriorGrid } from "./posterior";
import { cellCenterEnu } from "./posterior";
import type { MacroConstraint, GeoPosition } from "../domain/macro";
import { enuFromLatLon, type Enu } from "./enu";

const DEG = Math.PI / 180;

/** A finite "excluded" penalty — large enough that softmax drives the cell's mass to ~0. */
const STRONG_NEG = 40;

export interface PriorOpts {
  /** Default soft radius (m) when a point/apex constraint omits one. */
  defaultRadiusM?: number;
  /** Angular softness (deg) at a witness cone's edge. */
  coneEdgeSoftDeg?: number;
}

/** Shortest absolute angular difference between two bearings (deg). */
function angDiffDeg(a: number, b: number): number {
  let d = Math.abs(((a - b) % 360 + 360) % 360);
  if (d > 180) d = 360 - d;
  return d;
}

function llToEnu(pos: GeoPosition, g: PosteriorGrid): Enu {
  // GeoJSON is [lon, lat].
  return enuFromLatLon(pos[1], pos[0], g.anchor);
}

/** Ray-cast point-in-polygon over an ENU ring. */
function pointInRing(e: number, n: number, ring: Enu[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ei = ring[i].e;
    const ni = ring[i].n;
    const ej = ring[j].e;
    const nj = ring[j].n;
    const hit = ni > n !== nj > n && e < ((ej - ei) * (n - ni)) / (nj - ni) + ei;
    if (hit) inside = !inside;
  }
  return inside;
}

interface CompiledPoint {
  kind: "FIRST_REPORT_LOC";
  at: Enu;
  radiusM: number;
  weight: number;
}
interface CompiledCone {
  kind: "WITNESS_CONE";
  at: Enu;
  bearingDeg: number;
  spreadDeg: number;
  weight: number;
}
interface CompiledApex {
  kind: "V_APEX";
  apex: Enu;
  axis: { e: number; n: number }; // unit vector apex→interior
  radiusM: number;
  weight: number;
}
interface CompiledPoly {
  kind: "BURN_PERIMETER" | "EXCLUSION_ZONE";
  ring: Enu[];
  weight: number;
}
type Compiled = CompiledPoint | CompiledCone | CompiledApex | CompiledPoly;

/** Convert a constraint's WGS84 geometry to ENU once (at the grid's anchor). Null if unusable. */
function compile(c: MacroConstraint, g: PosteriorGrid, opts: Required<PriorOpts>): Compiled | null {
  const w = c.weight ?? 1;
  if (c.kind === "FIRST_REPORT_LOC" && c.geometry.type === "Point") {
    return { kind: "FIRST_REPORT_LOC", at: llToEnu(c.geometry.coordinates, g), radiusM: c.radiusM ?? opts.defaultRadiusM, weight: w };
  }
  if (c.kind === "WITNESS_CONE" && c.geometry.type === "Point" && c.bearingDeg != null) {
    return { kind: "WITNESS_CONE", at: llToEnu(c.geometry.coordinates, g), bearingDeg: c.bearingDeg, spreadDeg: c.spreadDeg ?? 20, weight: w };
  }
  if (c.kind === "V_APEX" && c.geometry.type === "LineString" && c.geometry.coordinates.length >= 2) {
    const apex = llToEnu(c.geometry.coordinates[0], g);
    const interior = llToEnu(c.geometry.coordinates[1], g);
    const de = interior.e - apex.e;
    const dn = interior.n - apex.n;
    const len = Math.hypot(de, dn) || 1;
    return { kind: "V_APEX", apex, axis: { e: de / len, n: dn / len }, radiusM: c.radiusM ?? opts.defaultRadiusM, weight: w };
  }
  if ((c.kind === "BURN_PERIMETER" || c.kind === "EXCLUSION_ZONE") && c.geometry.type === "Polygon" && c.geometry.coordinates[0]?.length >= 3) {
    return { kind: c.kind, ring: c.geometry.coordinates[0].map((p) => llToEnu(p, g)), weight: w };
  }
  return null;
}

/** The log-prior contribution of one compiled constraint at ENU cell (e, n). */
function contribution(c: Compiled, e: number, n: number): number {
  if (c.kind === "FIRST_REPORT_LOC") {
    const d = Math.hypot(e - c.at.e, n - c.at.n);
    return -0.5 * (d / c.radiusM) ** 2;
  }
  if (c.kind === "WITNESS_CONE") {
    const bearing = (Math.atan2(e - c.at.e, n - c.at.n) / DEG + 360) % 360; // observer→cell, true-north
    const off = angDiffDeg(bearing, c.bearingDeg);
    if (off <= c.spreadDeg) return 0;
    return -0.5 * ((off - c.spreadDeg) / 8) ** 2; // soft edge (~8° scale)
  }
  if (c.kind === "V_APEX") {
    const re = e - c.apex.e;
    const rn = n - c.apex.n;
    const s = re * c.axis.e + rn * c.axis.n; // along-axis (interior positive)
    const p = re * -c.axis.n + rn * c.axis.e; // cross-axis (perpendicular)
    const perp = -0.5 * (p / c.radiusM) ** 2; // Gaussian across the axis
    const back = s < 0 ? -0.5 * (s / c.radiusM) ** 2 : 0; // penalize being behind the apex
    return perp + back;
  }
  // polygons
  const inside = pointInRing(e, n, c.ring);
  if (c.kind === "BURN_PERIMETER") return inside ? 0 : -STRONG_NEG; // origin must be inside
  return inside ? -STRONG_NEG : 0; // EXCLUSION_ZONE: origin cannot be inside
}

/**
 * Build a log-prior array aligned to the posterior grid (row-major iy*nx+ix). With no
 * constraints it is all zeros — a constant field, so fusing it changes nothing (the Stage 3
 * invariant). Each constraint is compiled to ENU once, then summed (× weight) per cell.
 */
export function buildLogPrior(constraints: MacroConstraint[], g: PosteriorGrid, opts: PriorOpts = {}): Float64Array {
  const resolved: Required<PriorOpts> = {
    defaultRadiusM: opts.defaultRadiusM ?? 400,
    coneEdgeSoftDeg: opts.coneEdgeSoftDeg ?? 8,
  };
  const out = new Float64Array(g.nx * g.ny);
  const compiled = constraints
    .map((c) => compile(c, g, resolved))
    .filter((c): c is Compiled => c !== null);
  if (compiled.length === 0) return out; // flat (constant) prior — invariance

  for (let iy = 0; iy < g.ny; iy++) {
    for (let ix = 0; ix < g.nx; ix++) {
      const { e, n } = cellCenterEnu(g, ix, iy);
      let acc = 0;
      for (const c of compiled) acc += c.weight * contribution(c, e, n);
      out[iy * g.nx + ix] = acc;
    }
  }
  return out;
}
