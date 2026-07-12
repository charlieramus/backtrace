import { describe, it, expect } from "vitest";
import { createStore } from "../store";
import { loadMarshallDemo } from "../demo/presets";
import { buildSolution } from "../geo/solution";
import { buildGeoJson } from "./exportGeoJson";
import { recordExport } from "./exportUtil";

function marshall() {
  const store = createStore();
  loadMarshallDemo(store);
  const sol = buildSolution(store)!;
  return { store, sol };
}

describe("GeoJSON export", () => {
  it("emits a valid WGS84 FeatureCollection with the expected layer counts", () => {
    const { store, sol } = marshall();
    const json = buildGeoJson(sol, store.activeNodes(), store.getIncident());
    const fc = JSON.parse(json); // parses as valid JSON

    expect(fc.type).toBe("FeatureCollection");
    expect(fc.properties.datum).toBe("WGS84");
    expect(fc.properties.algorithm).toBe("GRID_VONMISES_V1");
    expect(fc.properties.region95AreaM2).toBeCloseTo(sol.region95AreaM2, 6);

    const byKind = (k: string) => fc.features.filter((f: any) => f.properties.kind === k);
    expect(byKind("node")).toHaveLength(5); // five Marshall nodes
    expect(byKind("ray")).toHaveLength(5); // all five carry a bearing
    expect(byKind("region")).toHaveLength(3); // p50/p68/p95
    expect(byKind("mode")).toHaveLength(1); // one candidate origin
    expect(fc.features).toHaveLength(5 + 5 + 3 + 1);

    // the three regions carry a level property and are (Multi)Polygons
    const levels = byKind("region").map((f: any) => f.properties.level).sort();
    expect(levels).toEqual([0.5, 0.68, 0.95]);
  });

  it("lands the geometry on the Colorado demo origin with finite WGS84 coordinates", () => {
    const { store, sol } = marshall();
    const fc = JSON.parse(buildGeoJson(sol, store.activeNodes(), store.getIncident()));

    // every node point sits near the Marshall origin (~39.95, −105.27)
    for (const f of fc.features.filter((x: any) => x.properties.kind === "node")) {
      const [lon, lat] = f.geometry.coordinates;
      expect(lat).toBeGreaterThan(39.9);
      expect(lat).toBeLessThan(40.0);
      expect(lon).toBeGreaterThan(-105.35);
      expect(lon).toBeLessThan(-105.2);
    }
    // the p95 region ring coordinates are all finite
    const p95 = fc.features.find((f: any) => f.properties.level === 0.95);
    for (const poly of p95.geometry.coordinates)
      for (const ring of poly)
        for (const [lon, lat] of ring) {
          expect(Number.isFinite(lon)).toBe(true);
          expect(Number.isFinite(lat)).toBe(true);
        }
  });

  it("never emits a bare origin — a mode is labelled a mode of a credible region", () => {
    const { store, sol } = marshall();
    const fc = JSON.parse(buildGeoJson(sol, store.activeNodes(), store.getIncident()));
    const mode = fc.features.find((f: any) => f.properties.kind === "mode");
    expect(mode.properties.confidencePct).toBe(95);
    expect(mode.properties.label).toMatch(/mode of the 95% credible region/i);
    expect(mode.properties.nNodesUsed).toBe(5);
  });

  it("recordExport appends an EXPORT audit entry naming the format + solution", () => {
    const { store, sol } = marshall();
    recordExport(store, "geojson", sol);
    const last = store.getAuditLog().at(-1)!;
    expect(last.action).toBe("EXPORT");
    expect(last.afterJson).toContain("geojson");
    expect(last.afterJson).toContain(sol.id);
  });
});
