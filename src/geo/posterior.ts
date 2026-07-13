// The honest posterior — a von Mises grid over the origin location (CRESEARCH.md §1.3).
// Pure, tested, no Leaflet/DOM. The mockup's purple field is a RENDER of this grid.
//
// Model: each node reads an indicator that points, with large angular uncertainty σ,
// toward the origin. For a candidate cell x, node i's bearing-to-x is β = atan2(ΔE, ΔN);
// the residual δ = wrap(θ_i − β) between the node's azimuth θ_i and β feeds a von Mises
// likelihood L_i = (1−ε)·vM(δ; κ_i) + ε/2π (an outlier mixture, ε≈0.15, so one wild sign
// can't veto a cell). κ_i comes from σ_i via the Fisher (1993) inversion. Log-likelihoods
// accumulate across nodes; a softmax normalizes to a posterior grid. With σ ~80–106°
// (Parker & Babrauskas 2024) κ is small and the field stays honestly broad — that's the
// whole point. "Behind the observer" needs no special case: vM handles the full circle.

import type { LatLon } from "./enu";
import { enuFromLatLon, enuToLatLon } from "./enu";
import type { Node } from "../domain/node";
import { effectiveSigma } from "../domain/node";
import type { MacroConstraint } from "../domain/macro";
import { buildLogPrior } from "./prior";

const DEG = Math.PI / 180;
const TWO_PI = 2 * Math.PI;
const LOG_2PI = Math.log(TWO_PI);
const EMPTY = new Float64Array(0); // placeholder `values` for the grid-metadata passed to the prior

/** Wrap an angle (radians) to (−π, π]. */
export function wrapPi(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/**
 * κ from the circular standard deviation σ (radians) via mean resultant length
 * R = exp(−σ²/2) and Fisher's (1993) three-branch inversion. Small R → κ≈0 (flat);
 * R→1 → large κ (tight).
 */
export function kappaFromSigma(sigmaRad: number): number {
  const R = Math.exp(-(sigmaRad * sigmaRad) / 2);
  if (R < 0.53) return 2 * R + R * R * R + (5 * R ** 5) / 6;
  if (R < 0.85) return -0.4 + 1.39 * R + 0.43 / (1 - R);
  return 1 / (R ** 3 - 4 * R ** 2 + 3 * R);
}

/** log I₀(x) — series for moderate x, asymptotic expansion for large x (stable for tight σ). */
export function logBesselI0(x: number): number {
  const ax = Math.abs(x);
  if (ax < 15) {
    const y = (ax * ax) / 4;
    let term = 1;
    let sum = 1;
    for (let k = 1; k < 60; k++) {
      term *= y / (k * k);
      sum += term;
      if (term < 1e-14 * sum) break;
    }
    return Math.log(sum);
  }
  const inv = 1 / ax;
  return ax - 0.5 * Math.log(TWO_PI * ax) + Math.log(1 + inv / 8 + (9 * inv * inv) / 128);
}

/** Numerically stable log(e^a + e^b). */
function logSumExp(a: number, b: number): number {
  const m = Math.max(a, b);
  if (!Number.isFinite(m)) return m;
  return m + Math.log(Math.exp(a - m) + Math.exp(b - m));
}

export interface Extent {
  minE: number;
  minN: number;
  maxE: number;
  maxN: number;
}

/** A normalized posterior over an ENU grid (row-major, iy*nx+ix; Σ values = 1). */
export interface PosteriorGrid {
  values: Float64Array;
  nx: number;
  ny: number;
  anchor: LatLon;
  cellSizeM: number;
  extent: Extent;
  nodesUsed: number;
}

export interface PosteriorOpts {
  /** ENU session anchor. Defaults to the first usable node's lat/lon. */
  anchor?: LatLon;
  /** Target cells along the longer axis (grid resolution). Default 180. */
  resolution?: number;
  /** Extra margin as a fraction of the node span, each side. Default 0.6. */
  marginFrac?: number;
  /** Outlier-mixture weight ε. Default 0.15. */
  eps?: number;
  /**
   * Active macro constraints (V10) fused in as a Bayesian log-prior:
   * `log_post = log_prior + Σ log_likelihood`. Omitted or empty ⇒ a flat (constant) prior ⇒
   * the output is byte-for-byte the pre-V10 v0 result (a hard invariant).
   */
  constraints?: MacroConstraint[];
}

interface UsableNode {
  e: number;
  n: number;
  theta: number; // azimuth, radians
  kappa: number;
  logNorm: number; // −log(2π) − log I₀(κ): the von Mises normalizer (constant per node)
}

/** ENU center (meters) of grid cell (ix, iy). */
export function cellCenterEnu(g: PosteriorGrid, ix: number, iy: number): { e: number; n: number } {
  return {
    e: g.extent.minE + (ix + 0.5) * g.cellSizeM,
    n: g.extent.minN + (iy + 0.5) * g.cellSizeM,
  };
}

/** Lat/lon of grid cell (ix, iy)'s center. */
export function cellCenterLatLon(g: PosteriorGrid, ix: number, iy: number): LatLon {
  const { e, n } = cellCenterEnu(g, ix, iy);
  return enuToLatLon(e, n, g.anchor);
}

/**
 * Compute the von Mises grid posterior over candidate origin locations. Returns null
 * when fewer than two nodes carry a usable bearing (< 2 constraints = no crossing).
 */
export function computePosterior(nodes: Node[], opts: PosteriorOpts = {}): PosteriorGrid | null {
  const eps = opts.eps ?? 0.15;
  const resolution = Math.max(16, Math.floor(opts.resolution ?? 180));
  const marginFrac = opts.marginFrac ?? 0.6;

  const bearing = nodes.filter((n) => {
    const s = effectiveSigma(n);
    return n.azimuthTrueDeg != null && s != null && s > 0;
  });
  if (bearing.length < 2) return null;

  const anchor: LatLon = opts.anchor ?? { lat: bearing[0].lat, lon: bearing[0].lon };

  const usable: UsableNode[] = bearing.map((n) => {
    const enu = enuFromLatLon(n.lat, n.lon, anchor);
    const sigmaRad = (effectiveSigma(n) as number) * DEG;
    const kappa = kappaFromSigma(sigmaRad);
    return {
      e: enu.e,
      n: enu.n,
      theta: (n.azimuthTrueDeg as number) * DEG,
      kappa,
      logNorm: -LOG_2PI - logBesselI0(kappa),
    };
  });

  // Bounding box of the nodes in ENU, expanded by a margin so the crossing is captured.
  let minE = Infinity;
  let maxE = -Infinity;
  let minN = Infinity;
  let maxN = -Infinity;
  for (const u of usable) {
    if (u.e < minE) minE = u.e;
    if (u.e > maxE) maxE = u.e;
    if (u.n < minN) minN = u.n;
    if (u.n > maxN) maxN = u.n;
  }
  const spanE = maxE - minE;
  const spanN = maxN - minN;
  const span = Math.max(spanE, spanN, 200); // floor avoids a zero-area box
  const margin = marginFrac * span + 100;
  minE -= margin;
  maxE += margin;
  minN -= margin;
  maxN += margin;

  const fullE = maxE - minE;
  const fullN = maxN - minN;
  const cellSizeM = Math.max(fullE, fullN) / resolution;
  const nx = Math.max(2, Math.min(resolution + 2, Math.ceil(fullE / cellSizeM)));
  const ny = Math.max(2, Math.min(resolution + 2, Math.ceil(fullN / cellSizeM)));
  const extent: Extent = { minE, minN, maxE: minE + nx * cellSizeM, maxN: minN + ny * cellSizeM };

  const logEps = Math.log(eps / TWO_PI);
  const log1mEps = Math.log(1 - eps);

  // The macro log-prior over this exact grid (CRESEARCH.md §4.1). With no constraints it's a
  // constant zero field, so adding it leaves the posterior byte-for-byte the v0 result.
  const gridMeta: PosteriorGrid = { values: EMPTY, nx, ny, anchor, cellSizeM, extent, nodesUsed: usable.length };
  const logPrior = buildLogPrior(opts.constraints ?? [], gridMeta);

  const logGrid = new Float64Array(nx * ny);
  let logMax = -Infinity;

  for (let iy = 0; iy < ny; iy++) {
    const cn = extent.minN + (iy + 0.5) * cellSizeM;
    for (let ix = 0; ix < nx; ix++) {
      const idx = iy * nx + ix;
      const ce = extent.minE + (ix + 0.5) * cellSizeM;
      let logAcc = logPrior[idx]; // log_prior term
      for (const u of usable) {
        const beta = Math.atan2(ce - u.e, cn - u.n); // bearing node -> cell
        const delta = wrapPi(u.theta - beta);
        const logVm = u.kappa * Math.cos(delta) + u.logNorm; // von Mises log-density
        logAcc += logSumExp(log1mEps + logVm, logEps);
      }
      logGrid[idx] = logAcc;
      if (logAcc > logMax) logMax = logAcc;
    }
  }

  // softmax normalize
  const values = new Float64Array(nx * ny);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    const v = Math.exp(logGrid[i] - logMax);
    values[i] = v;
    sum += v;
  }
  if (sum > 0) for (let i = 0; i < values.length; i++) values[i] /= sum;

  return { values, nx, ny, anchor, cellSizeM, extent, nodesUsed: usable.length };
}
