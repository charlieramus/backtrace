// HDR credible regions + posterior summaries (CRESEARCH.md §1.4–1.5). Pure, tested.
//
// From the normalized posterior grid this derives the honest readout numbers the mockup
// shows: the 50/68/95 highest-density regions (the smallest sets of cells holding that
// much probability mass) and their AREAS — the 95% area is the headline "candidate area"
// — plus the field's flatness (normalized entropy), how many candidate origins it really
// supports (mode count via connected high-density components), and whether the bearing
// geometry is well-conditioned enough to trust a crossing at all.

import type { PosteriorGrid } from "./posterior";
import type { Node } from "../domain/node";

const DEG = Math.PI / 180;

/** One highest-density credible region at a given mass level. */
export interface HdrRegion {
  level: number; // 0.5 / 0.68 / 0.95
  threshold: number; // density cutoff: cells with p >= threshold form the region
  cellCount: number;
  areaM2: number;
  mask: Uint8Array; // 1 where the cell is inside this (nested) region
}

/**
 * Highest-density regions for each mass level. Sorts cells by density descending and
 * accumulates until each level's mass is reached; the density at that point is the
 * threshold, and every cell at least that dense forms the (nested) region.
 */
export function hdrRegions(g: PosteriorGrid, levels: number[] = [0.5, 0.68, 0.95]): HdrRegion[] {
  const n = g.values.length;
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => g.values[b] - g.values[a]);
  const sorted = [...levels].sort((a, b) => a - b);

  const thresholds = new Array<number>(sorted.length).fill(0);
  let cum = 0;
  let li = 0;
  for (let k = 0; k < n && li < sorted.length; k++) {
    cum += g.values[order[k]];
    while (li < sorted.length && cum >= sorted[li]) {
      thresholds[li] = g.values[order[k]];
      li++;
    }
  }
  for (; li < sorted.length; li++) thresholds[li] = g.values[order[n - 1]];

  const cellArea = g.cellSizeM * g.cellSizeM;
  return sorted.map((level, i) => {
    const t = thresholds[i];
    const mask = new Uint8Array(n);
    let count = 0;
    for (let j = 0; j < n; j++) {
      if (g.values[j] >= t) {
        mask[j] = 1;
        count++;
      }
    }
    return { level, threshold: t, cellCount: count, areaM2: count * cellArea, mask };
  });
}

/** The 95% (or nearest) region's area in m² — the headline candidate area. */
export function candidateAreaM2(regions: HdrRegion[]): number {
  const r = regions.reduce((best, cur) =>
    Math.abs(cur.level - 0.95) < Math.abs(best.level - 0.95) ? cur : best,
  );
  return r.areaM2;
}

/** Normalized Shannon entropy of the grid: 0 = peaked (all mass one cell), 1 = uniform/flat. */
export function normalizedEntropy(g: PosteriorGrid): number {
  let H = 0;
  for (const p of g.values) if (p > 0) H -= p * Math.log(p);
  return H / Math.log(g.values.length);
}

/**
 * Number of candidate origins the field really supports: connected components of the
 * high-density mask (cells >= frac of the global max), 8-connected, ignoring single-cell
 * specks. Two separated clusters read as 2; one blob (or a broad flat field) as 1.
 */
export function modeCount(g: PosteriorGrid, frac = 0.4): number {
  const { nx, ny, values } = g;
  let max = 0;
  for (const v of values) if (v > max) max = v;
  if (max <= 0) return 0;
  const cut = frac * max;

  const seen = new Uint8Array(nx * ny);
  const stack: number[] = [];
  let count = 0;

  for (let start = 0; start < nx * ny; start++) {
    if (seen[start] || values[start] < cut) continue;
    // flood-fill this component
    let size = 0;
    stack.length = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const idx = stack.pop()!;
      size++;
      const x = idx % nx;
      const y = (idx - x) / nx;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nxp = x + dx;
          const nyp = y + dy;
          if (nxp < 0 || nyp < 0 || nxp >= nx || nyp >= ny) continue;
          const nIdx = nyp * nx + nxp;
          if (!seen[nIdx] && values[nIdx] >= cut) {
            seen[nIdx] = 1;
            stack.push(nIdx);
          }
        }
      }
    }
    if (size >= 2) count++; // ignore single-cell specks
  }
  return count;
}

export interface GeometryQuality {
  /** λmax/λmin of the bearing structure matrix; large = near-parallel / ill-conditioned. */
  condition: number;
  poor: boolean;
}

/**
 * Bearing-geometry conditioning (§1.5). Builds M = Σ nᵢnᵢᵀ from each bearing line's
 * normal nᵢ = (cos θ, −sin θ); a well-spread set gives a well-conditioned M (condition
 * near 1), while near-parallel bearings make one eigenvalue collapse (condition → ∞),
 * so a crossing there is untrustworthy.
 */
export function geometryQuality(nodes: Node[], threshold = 10): GeometryQuality {
  const bearings = nodes.filter((n) => n.azimuthTrueDeg != null);
  if (bearings.length < 2) return { condition: Infinity, poor: true };

  let a = 0;
  let b = 0;
  let c = 0;
  for (const n of bearings) {
    const th = (n.azimuthTrueDeg as number) * DEG;
    const nx = Math.cos(th);
    const ny = -Math.sin(th);
    a += nx * nx;
    b += nx * ny;
    c += ny * ny;
  }
  const tr = a + c;
  const det = a * c - b * b;
  const disc = Math.sqrt(Math.max(0, (tr / 2) ** 2 - det));
  const lMax = tr / 2 + disc;
  const lMin = tr / 2 - disc;
  const condition = lMin <= 1e-9 ? Infinity : lMax / lMin;
  return { condition, poor: condition > threshold };
}
