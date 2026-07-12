import { describe, it, expect } from "vitest";
import { effectiveSigma, type Node } from "./node";
import { INDICATOR_TYPES, getIndicator } from "./indicators";
import { createStore } from "../store";

function makeNode(over: Partial<Node> = {}): Node {
  return {
    id: "test",
    lat: 39.95,
    lon: -105.28,
    indicatorCode: "ANGLE_OF_CHAR",
    spreadType: "ADVANCING",
    azimuthTrueDeg: null,
    sigmaDeg: null,
    notes: "",
    ...over,
  };
}

describe("indicators", () => {
  it("maps the six primary micro indicators to the mockup's --ind-* colors + P&B sigmas", () => {
    const expected: Record<string, { color: string; sigma: number }> = {
      ANGLE_OF_CHAR: { color: "--ind-char", sigma: 98 },
      STAINING: { color: "--ind-stain", sigma: 106 },
      PROTECTION: { color: "--ind-prot", sigma: 81 },
      SOOTING: { color: "--ind-soot", sigma: 97 },
      WHITE_ASH: { color: "--ind-ash", sigma: 81 },
      GRASS_STEM: { color: "--ind-grass", sigma: 98 },
    };
    for (const [code, want] of Object.entries(expected)) {
      const t = getIndicator(code as Node["indicatorCode"]);
      expect(t, code).toBeDefined();
      expect(t!.scale).toBe("MICRO");
      expect(t!.color).toBe(want.color);
      expect(t!.priorSigmaDeg).toBe(want.sigma);
    }
  });

  it("seeds the five macro indicators with null sigma + null color", () => {
    const macro = INDICATOR_TYPES.filter((t) => t.scale === "MACRO");
    expect(macro.map((t) => t.code)).toEqual([
      "FOLIAGE_FREEZE",
      "CUPPING",
      "SPALLING",
      "CURLING",
      "V_U_PATTERN",
    ]);
    for (const t of macro) {
      expect(t.priorSigmaDeg).toBeNull();
      expect(t.color).toBeNull();
    }
  });
});

describe("effectiveSigma", () => {
  it("falls back to the indicator's prior when the node has no override", () => {
    expect(effectiveSigma(makeNode({ indicatorCode: "STAINING", sigmaDeg: null }))).toBe(106);
  });

  it("prefers an explicit override over the prior", () => {
    expect(effectiveSigma(makeNode({ indicatorCode: "STAINING", sigmaDeg: 42 }))).toBe(42);
  });

  it("is null for a macro indicator with no override", () => {
    expect(effectiveSigma(makeNode({ indicatorCode: "CUPPING", sigmaDeg: null }))).toBeNull();
  });
});

describe("store", () => {
  it("adds nodes with defaults and returns them via getAll", () => {
    const store = createStore();
    const n = store.add({ lat: 1, lon: 2, indicatorCode: "SOOTING" });
    expect(n.id).toBeTruthy();
    expect(n.spreadType).toBe("ADVANCING");
    expect(n.azimuthTrueDeg).toBeNull();
    expect(store.getAll()).toHaveLength(1);
    expect(store.getAll()[0]).toBe(n);
  });

  it("selects and deselects; getSelected tracks it", () => {
    const store = createStore();
    const n = store.add({ lat: 1, lon: 2, indicatorCode: "SOOTING" });
    expect(store.getSelected()).toBeNull();
    store.select(n.id);
    expect(store.getSelected()).toBe(n);
    store.select(null);
    expect(store.getSelected()).toBeNull();
  });

  it("voiding a node drops it from the active set and clears selection", () => {
    const store = createStore();
    const a = store.add({ lat: 1, lon: 2, indicatorCode: "SOOTING" });
    const b = store.add({ lat: 3, lon: 4, indicatorCode: "STAINING" });
    store.select(b.id);
    store.void(b.id, "duplicate reading");
    expect(store.getAll()).toEqual([a]); // b left the active working set
    expect(store.getSelected()).toBeNull();
  });

  it("notifies subscribers on add/select/void and stops after unsubscribe", () => {
    const store = createStore();
    let calls = 0;
    const unsub = store.subscribe(() => calls++);
    const n = store.add({ lat: 1, lon: 2, indicatorCode: "SOOTING" }); // 1
    store.select(n.id); // 2
    store.void(n.id, "test removal"); // 3
    expect(calls).toBe(3);
    unsub();
    store.add({ lat: 5, lon: 6, indicatorCode: "PROTECTION" });
    expect(calls).toBe(3);
  });

  it("setAnchor records the session ENU anchor on the incident header", () => {
    const store = createStore();
    expect(store.getIncident().anchorLat).toBeNull();
    expect(store.getIncident().anchorLon).toBeNull();
    let calls = 0;
    store.subscribe(() => calls++);
    store.setAnchor(39.9528, -105.284);
    expect(store.getIncident().anchorLat).toBe(39.9528);
    expect(store.getIncident().anchorLon).toBe(-105.284);
    expect(calls).toBe(1);
  });

  it("setArmedIndicator changes the armed code and notifies", () => {
    const store = createStore();
    expect(store.getArmedIndicator()).toBe("ANGLE_OF_CHAR");
    let calls = 0;
    store.subscribe(() => calls++);
    store.setArmedIndicator("WHITE_ASH");
    expect(store.getArmedIndicator()).toBe("WHITE_ASH");
    expect(calls).toBe(1);
  });
});
