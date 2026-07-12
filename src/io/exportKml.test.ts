import { describe, it, expect } from "vitest";
import { createStore } from "../store";
import { loadMarshallDemo } from "../demo/presets";
import { buildSolution } from "../geo/solution";
import { buildKml } from "./exportKml";

/** Dependency-free XML well-formedness check: tokenize tags and verify balanced nesting. */
function assertWellFormed(xml: string): void {
  const stack: string[] = [];
  const re = /<(\/?)([A-Za-z][\w:.-]*)([^>]*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const [, closing, name, , selfClose] = m;
    if (closing) {
      expect(stack.pop()).toBe(name); // close matches the most recent open
    } else if (!selfClose) {
      stack.push(name);
    }
  }
  expect(stack).toHaveLength(0); // every element closed
}

function marshall() {
  const store = createStore();
  loadMarshallDemo(store);
  const sol = buildSolution(store)!;
  return buildKml(sol, store.activeNodes(), store.getIncident());
}

describe("KML export", () => {
  it("is well-formed XML with the expected placemark counts", () => {
    const kml = marshall().replace(/^<\?xml[^>]*\?>\s*/, ""); // drop the PI for the checker
    assertWellFormed(kml);

    const placemarks = kml.match(/<Placemark>/g) ?? [];
    expect(placemarks).toHaveLength(5 + 5 + 3 + 1); // nodes + rays + regions + mode
    expect(kml.match(/<Point>/g) ?? []).toHaveLength(5 + 1); // node points + one mode
    expect(kml.match(/<LineString>/g) ?? []).toHaveLength(5); // five bearing rays
    expect(kml.match(/<Polygon>/g)?.length ?? 0).toBeGreaterThanOrEqual(3); // region polys
  });

  it("styles spread in the placemark NAME (colour-blind safe), not colour alone", () => {
    const kml = marshall();
    // the app's spreads all appear as words in placemark names
    expect(kml).toMatch(/<name>[^<]*ADVANCING<\/name>/);
    expect(kml).toMatch(/<name>[^<]*(LATERAL|BACKING)<\/name>/);
    // and each node also carries its indicator colour in an IconStyle
    expect(kml.match(/<IconStyle><color>/g)?.length ?? 0).toBe(5);
  });

  it("grades region opacity (tightest most opaque) and states the known error rate", () => {
    const kml = marshall();
    const polyColors = [...kml.matchAll(/<PolyStyle><color>([0-9a-f]{8})<\/color>/g)].map((x) => x[1]);
    expect(polyColors).toHaveLength(3);
    // alpha byte (first two hex chars) decreases 50 → 68 → 95
    const alphas = polyColors.map((c) => parseInt(c.slice(0, 2), 16));
    expect(alphas[0]).toBeGreaterThan(alphas[1]);
    expect(alphas[1]).toBeGreaterThan(alphas[2]);
    // the document description discloses the ~103° indicator error rate + datum + algorithm
    expect(kml).toMatch(/103/);
    expect(kml).toContain("WGS84");
    expect(kml).toContain("GRID_VONMISES_V1");
  });
});
