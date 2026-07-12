import { describe, it, expect } from "vitest";
import { computePosterior, cellCenterLatLon, type PosteriorGrid } from "./posterior";
import { enuFromLatLon, projectAlong, type LatLon } from "./enu";
import type { Node } from "../domain/node";

const O1: LatLon = { lat: 40.0, lon: -105.5 };

/**
 * A node placed `dist` m from `origin` in compass direction `dirDeg`, whose indicator
 * azimuth points back toward the origin (dir+180) plus optional scatter.
 */
function nodeToward(
  origin: LatLon,
  dirDeg: number,
  dist: number,
  sigmaDeg: number,
  scatter = 0,
  id = Math.random().toString(36).slice(2),
): Node {
  const at = projectAlong(origin, origin, dirDeg, dist);
  const azimuthTrueDeg = ((dirDeg + 180 + scatter) % 360 + 360) % 360;
  return {
    id,
    lat: at.lat,
    lon: at.lon,
    indicatorCode: "ANGLE_OF_CHAR",
    spreadType: "ADVANCING",
    azimuthTrueDeg,
    sigmaDeg,
    notes: "",
  };
}

function metersBetween(a: LatLon, b: LatLon): number {
  const R = 6371008.8;
  const d = Math.PI / 180;
  const dLat = (b.lat - a.lat) * d;
  const dLon = (b.lon - a.lon) * d;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * d) * Math.cos(b.lat * d) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function peak(g: PosteriorGrid): { value: number; ix: number; iy: number } {
  let value = -1;
  let ix = 0;
  let iy = 0;
  for (let y = 0; y < g.ny; y++) {
    for (let x = 0; x < g.nx; x++) {
      const v = g.values[y * g.nx + x];
      if (v > value) {
        value = v;
        ix = x;
        iy = y;
      }
    }
  }
  return { value, ix, iy };
}

function nearestCell(g: PosteriorGrid, target: LatLon): { ix: number; iy: number } {
  const enu = enuFromLatLon(target.lat, target.lon, g.anchor);
  const ix = Math.min(g.nx - 1, Math.max(0, Math.round((enu.e - g.extent.minE) / g.cellSizeM - 0.5)));
  const iy = Math.min(g.ny - 1, Math.max(0, Math.round((enu.n - g.extent.minN) / g.cellSizeM - 0.5)));
  return { ix, iy };
}

describe("von Mises grid posterior", () => {
  it("(a) three tight, agreeing bearings -> mass near the true crossing", () => {
    const nodes = [
      nodeToward(O1, 30, 1000, 12),
      nodeToward(O1, 150, 1000, 12),
      nodeToward(O1, 270, 1000, 12),
    ];
    const g = computePosterior(nodes, { anchor: O1, resolution: 120 })!;
    expect(g).not.toBeNull();
    const p = peak(g);
    const uniform = 1 / (g.nx * g.ny);
    // strongly concentrated
    expect(p.value).toBeGreaterThan(uniform * 20);
    // and the mode sits near the true origin
    const modeLatLon = cellCenterLatLon(g, p.ix, p.iy);
    expect(metersBetween(modeLatLon, O1)).toBeLessThan(3 * g.cellSizeM);
  });

  it("(b) three wildly disagreeing bearings (σ~100°) -> near-flat posterior", () => {
    const nodes = [
      nodeToward(O1, 30, 1000, 100, +85),
      nodeToward(O1, 150, 1000, 100, -70),
      nodeToward(O1, 270, 1000, 100, +110),
    ];
    const g = computePosterior(nodes, { anchor: O1, resolution: 120 })!;
    const p = peak(g);
    const uniform = 1 / (g.nx * g.ny);
    // flat: the peak is only marginally above uniform
    expect(p.value).toBeLessThan(uniform * 6);

    // and dramatically flatter than the agreeing case
    const tight = computePosterior(
      [nodeToward(O1, 30, 1000, 12), nodeToward(O1, 150, 1000, 12), nodeToward(O1, 270, 1000, 12)],
      { anchor: O1, resolution: 120 },
    )!;
    expect(peak(tight).value).toBeGreaterThan(p.value * 5);
  });

  it("(c) two separated clusters -> a bimodal posterior (two peaks, a valley between)", () => {
    const O2 = projectAlong(O1, O1, 90, 5000); // 5 km due east
    const nodes = [
      nodeToward(O1, 20, 700, 18),
      nodeToward(O1, 160, 700, 18),
      nodeToward(O2, 20, 700, 18),
      nodeToward(O2, 160, 700, 18),
    ];
    const g = computePosterior(nodes, { anchor: O1, resolution: 160 })!;

    const c1 = nearestCell(g, O1);
    const c2 = nearestCell(g, O2);
    const mid = projectAlong(O1, O1, 90, 2500); // between the two origins
    const cm = nearestCell(g, mid);

    const v1 = g.values[c1.iy * g.nx + c1.ix];
    const v2 = g.values[c2.iy * g.nx + c2.ix];
    const vm = g.values[cm.iy * g.nx + cm.ix];
    const uniform = 1 / (g.nx * g.ny);

    // both origins carry real mass...
    expect(v1).toBeGreaterThan(uniform * 5);
    expect(v2).toBeGreaterThan(uniform * 5);
    // ...separated by a genuine valley
    expect(vm).toBeLessThan(Math.min(v1, v2) * 0.5);
  });

  it("(d) fewer than two bearings -> null", () => {
    expect(computePosterior([], { anchor: O1 })).toBeNull();
    const one = nodeToward(O1, 30, 1000, 12);
    expect(computePosterior([one], { anchor: O1 })).toBeNull();
    // a node without an azimuth doesn't count as a bearing
    const noAz: Node = { ...nodeToward(O1, 150, 1000, 12), azimuthTrueDeg: null };
    expect(computePosterior([one, noAz], { anchor: O1 })).toBeNull();
  });
});
