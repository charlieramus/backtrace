import { describe, it, expect } from "vitest";
import {
  hdrRegions,
  candidateAreaM2,
  normalizedEntropy,
  modeCount,
  geometryQuality,
} from "./hdr";
import { computePosterior } from "./posterior";
import { projectAlong, type LatLon } from "./enu";
import type { Node } from "../domain/node";

const O1: LatLon = { lat: 40.0, lon: -105.5 };

function nodeToward(
  origin: LatLon,
  dirDeg: number,
  dist: number,
  sigmaDeg: number,
  scatter = 0,
): Node {
  const at = projectAlong(origin, origin, dirDeg, dist);
  return {
    id: Math.random().toString(36).slice(2),
    lat: at.lat,
    lon: at.lon,
    indicatorCode: "ANGLE_OF_CHAR",
    spreadType: "ADVANCING",
    azimuthTrueDeg: ((dirDeg + 180 + scatter) % 360 + 360) % 360,
    sigmaDeg,
    notes: "",
  };
}

const agreeing = () => [
  nodeToward(O1, 30, 1000, 12),
  nodeToward(O1, 150, 1000, 12),
  nodeToward(O1, 270, 1000, 12),
];
const disagreeing = () => [
  nodeToward(O1, 30, 1000, 100, +85),
  nodeToward(O1, 150, 1000, 100, -70),
  nodeToward(O1, 270, 1000, 100, +110),
];

describe("HDR regions + summaries", () => {
  it("agreeing bearings -> small 95% area, low entropy, one mode, good geometry", () => {
    const nodes = agreeing();
    const g = computePosterior(nodes, { anchor: O1, resolution: 140 })!;
    const regions = hdrRegions(g);
    const area95 = candidateAreaM2(regions);
    const ent = normalizedEntropy(g);

    // nested: 50% region ⊆ 68% ⊆ 95%
    const [r50, r68, r95] = regions;
    expect(r50.areaM2).toBeLessThanOrEqual(r68.areaM2);
    expect(r68.areaM2).toBeLessThanOrEqual(r95.areaM2);

    expect(ent).toBeLessThan(0.7); // peaked
    expect(modeCount(g)).toBe(1);
    expect(geometryQuality(nodes).poor).toBe(false);
    // sanity: a tight crossing is a modest area, not the whole grid
    const gridArea = g.nx * g.ny * g.cellSizeM * g.cellSizeM;
    expect(area95).toBeLessThan(gridArea * 0.5);
  });

  it("disagreeing bearings -> much larger 95% area + higher entropy", () => {
    const gA = computePosterior(agreeing(), { anchor: O1, resolution: 140 })!;
    const gD = computePosterior(disagreeing(), { anchor: O1, resolution: 140 })!;
    const areaA = candidateAreaM2(hdrRegions(gA));
    const areaD = candidateAreaM2(hdrRegions(gD));
    expect(areaD).toBeGreaterThan(areaA * 3);
    expect(normalizedEntropy(gD)).toBeGreaterThan(normalizedEntropy(gA));
    expect(normalizedEntropy(gD)).toBeGreaterThan(0.9); // near-flat
  });

  it("two separated clusters -> mode count 2", () => {
    const O2 = projectAlong(O1, O1, 90, 5000);
    const nodes = [
      nodeToward(O1, 20, 700, 18),
      nodeToward(O1, 160, 700, 18),
      nodeToward(O2, 20, 700, 18),
      nodeToward(O2, 160, 700, 18),
    ];
    const g = computePosterior(nodes, { anchor: O1, resolution: 180 })!;
    expect(modeCount(g)).toBe(2);
  });

  it("near-parallel bearings -> poor geometry; well-spread -> good", () => {
    const nearParallel = [
      nodeToward(O1, 90, 1000, 20, 0),
      nodeToward(O1, 90, 1400, 20, 2),
      nodeToward(O1, 90, 800, 20, -2),
    ];
    expect(geometryQuality(nearParallel).poor).toBe(true);
    expect(geometryQuality(agreeing()).poor).toBe(false);
  });
});
