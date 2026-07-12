import { describe, it, expect } from "vitest";
import { createStore } from "../store";
import { loadMarshallDemo, loadConflictingDemo } from "../demo/presets";
import { buildSolution, SOLUTION_ALGORITHM } from "./solution";
import { computePosterior } from "./posterior";
import { hdrRegions, candidateAreaM2, modeCount } from "./hdr";

/** The area (m²) the live readout would show for a store's active nodes. */
function readoutArea(store: ReturnType<typeof createStore>): number {
  const inc = store.getIncident();
  const anchor =
    inc.anchorLat != null && inc.anchorLon != null
      ? { lat: inc.anchorLat, lon: inc.anchorLon }
      : undefined;
  const g = computePosterior(store.activeNodes(), anchor ? { anchor } : {})!;
  return candidateAreaM2(hdrRegions(g));
}

describe("buildSolution", () => {
  it("Marshall demo: p95 region matches the readout area (~19M m²), one mode, five nodes", () => {
    const store = createStore();
    loadMarshallDemo(store);
    const sol = buildSolution(store)!;

    expect(sol).not.toBeNull();
    expect(sol.algorithm).toBe(SOLUTION_ALGORITHM);
    expect(sol.nNodesUsed).toBe(5);
    expect(sol.nModes).toBe(1);

    // the persisted region-95 area is the SAME number the readout shows (single source)
    expect(sol.region95AreaM2).toBeCloseTo(readoutArea(store), 6);
    // and it's the honest, broad Marshall region — order ~19M m²
    expect(sol.region95AreaM2).toBeGreaterThan(5_000_000);
    expect(sol.region95AreaM2).toBeLessThan(60_000_000);

    // the p95 MultiPolygon is real WGS84 geometry (non-empty, finite coords)
    expect(sol.regions.p95.type).toBe("MultiPolygon");
    expect(sol.regions.p95.coordinates.length).toBeGreaterThan(0);
    for (const poly of sol.regions.p95.coordinates) {
      for (const ring of poly) {
        expect(ring.length).toBeGreaterThanOrEqual(4);
        for (const [lon, lat] of ring) {
          expect(Number.isFinite(lon)).toBe(true);
          expect(Number.isFinite(lat)).toBe(true);
          expect(lat).toBeGreaterThan(38);
          expect(lat).toBeLessThan(42);
          expect(lon).toBeGreaterThan(-107);
          expect(lon).toBeLessThan(-103);
        }
      }
    }

    // one persisted mode point, five equal-weighted bearing inputs
    expect(sol.modePointsWgs84).toHaveLength(1);
    expect(sol.solutionInputs).toHaveLength(5);
    expect(sol.solutionInputs.every((i) => i.weightUsed === 1 && i.kappaUsed > 0)).toBe(true);
  });

  it("conflicting demo: the field is bimodal (two candidate origins)", () => {
    const store = createStore();
    loadConflictingDemo(store);
    const sol = buildSolution(store)!;

    expect(sol.nModes).toBe(2);
    expect(sol.nModes).toBe(modeCount(computePosterior(store.activeNodes())!));
    expect(sol.modePointsWgs84).toHaveLength(2);
    // nested credible regions: p50 ⊆ p68 ⊆ p95, so p95 is the widest
    expect(sol.regions.p95.coordinates.length).toBeGreaterThan(0);
  });

  it("returns null below two crossing bearings (same gate as the posterior)", () => {
    const store = createStore();
    store.add({ lat: 39.95, lon: -105.28, indicatorCode: "ANGLE_OF_CHAR", azimuthTrueDeg: 90, sigmaDeg: 40 });
    expect(buildSolution(store)).toBeNull();
  });
});
