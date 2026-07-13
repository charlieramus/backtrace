import { describe, it, expect } from "vitest";
import { createStore } from "../store";
import { loadMarshallDemo, loadMarshallMacroDemo } from "./presets";
import { buildSolution } from "../geo/solution";
import { buildGeoJson } from "../io/exportGeoJson";
import { buildKml } from "../io/exportKml";

// V10 Stage 5 coherence: the macro-informed demo should HONESTLY tighten the 95% region
// relative to the micro-only demo (still a broad area, never a pinpoint), and its exports must
// carry the macro-constraints layer — while the micro-only path stays exactly the v0 result.

describe("macro demo coherence", () => {
  it("the macro-informed region is tighter than the micro-only region (still broad)", () => {
    const microStore = createStore();
    loadMarshallDemo(microStore);
    const micro = buildSolution(microStore)!;
    expect(micro).not.toBeNull();

    const macroStore = createStore();
    loadMarshallMacroDemo(macroStore);
    const informed = buildSolution(macroStore)!;
    expect(informed).not.toBeNull();

    // the prior shrinks the candidate area...
    expect(informed.region95AreaM2).toBeLessThan(micro.region95AreaM2);
    // ...but it stays an honest AREA, not a fabricated pinpoint
    expect(informed.region95AreaM2).toBeGreaterThan(100_000); // > 0.1 km²
  });

  it("exports carry the macro-constraints layer + the fused-prior note", () => {
    const store = createStore();
    loadMarshallMacroDemo(store);
    const sol = buildSolution(store)!;
    const macros = store.activeMacros();
    expect(macros.length).toBeGreaterThanOrEqual(2);

    const geojson = JSON.parse(buildGeoJson(sol, store.activeNodes(), store.getIncident(), macros));
    const macroFeatures = geojson.features.filter((f: { properties: { kind: string } }) => f.properties.kind === "macro");
    expect(macroFeatures.length).toBe(macros.length);
    expect(geojson.properties.nMacroConstraints).toBe(macros.length);

    const kml = buildKml(sol, store.activeNodes(), store.getIncident(), macros);
    expect(kml).toContain("Macro constraints (priors)");
    expect(kml).toContain("WITNESS_CONE");

    // the solution params disclose the fused prior×likelihood method
    expect(sol.paramsJson).toContain("log_prior");
  });

  it("the micro-only export carries no macro layer (no constraints => v0)", () => {
    const store = createStore();
    loadMarshallDemo(store);
    const sol = buildSolution(store)!;
    const geojson = JSON.parse(buildGeoJson(sol, store.activeNodes(), store.getIncident(), store.activeMacros()));
    const macroFeatures = geojson.features.filter((f: { properties: { kind: string } }) => f.properties.kind === "macro");
    expect(macroFeatures.length).toBe(0);
    expect(geojson.properties.nMacroConstraints).toBe(0);
  });
});
