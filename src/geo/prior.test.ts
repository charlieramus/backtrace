import { describe, it, expect } from "vitest";
import { buildLogPrior } from "./prior";
import type { PosteriorGrid } from "./posterior";
import { enuToLatLon, type LatLon } from "./enu";
import type { MacroConstraint, GeoPosition } from "../domain/macro";

const ANCHOR: LatLon = { lat: 39.953, lon: -105.273 };

/** A synthetic 2 km × 2 km ENU grid (50 m cells) centered on the anchor. */
function makeGrid(): PosteriorGrid {
  const cellSizeM = 50;
  const nx = 41;
  const ny = 41;
  const minE = -((nx * cellSizeM) / 2);
  const minN = -((ny * cellSizeM) / 2);
  return {
    values: new Float64Array(nx * ny),
    nx,
    ny,
    anchor: ANCHOR,
    cellSizeM,
    extent: { minE, minN, maxE: minE + nx * cellSizeM, maxN: minN + ny * cellSizeM },
    nodesUsed: 0,
  };
}

/** GeoJSON [lon, lat] at a given ENU offset (m) from the anchor. */
function pos(e: number, n: number): GeoPosition {
  const ll = enuToLatLon(e, n, ANCHOR);
  return [ll.lon, ll.lat];
}

/** Index of the cell containing an ENU point. */
function cellIndex(g: PosteriorGrid, e: number, n: number): number {
  const ix = Math.floor((e - g.extent.minE) / g.cellSizeM);
  const iy = Math.floor((n - g.extent.minN) / g.cellSizeM);
  return iy * g.nx + ix;
}

function macro(partial: Partial<MacroConstraint> & Pick<MacroConstraint, "kind" | "geometry">): MacroConstraint {
  return {
    id: "m1",
    incidentId: "i1",
    weight: 1,
    source: "INVESTIGATOR",
    notes: "",
    createdAtUtc: new Date().toISOString(),
    ...partial,
  };
}

describe("buildLogPrior", () => {
  it("returns a constant (all-zero) field with no constraints — the invariance case", () => {
    const g = makeGrid();
    const lp = buildLogPrior([], g);
    expect(lp).toHaveLength(g.nx * g.ny);
    expect(Array.from(lp).every((v) => v === 0)).toBe(true);
  });

  it("EXCLUSION_ZONE drives log-prior strongly negative inside, ~0 outside", () => {
    const g = makeGrid();
    // a 400 m box around ENU (+500, +500)
    const ring: GeoPosition[] = [pos(300, 300), pos(700, 300), pos(700, 700), pos(300, 700), pos(300, 300)];
    const lp = buildLogPrior([macro({ kind: "EXCLUSION_ZONE", geometry: { type: "Polygon", coordinates: [ring] } })], g);
    expect(lp[cellIndex(g, 500, 500)]).toBeLessThan(-30); // inside → excluded
    expect(lp[cellIndex(g, -500, -500)]).toBeCloseTo(0, 6); // outside → untouched
  });

  it("BURN_PERIMETER keeps mass inside (0) and strongly penalizes outside", () => {
    const g = makeGrid();
    const ring: GeoPosition[] = [pos(-300, -300), pos(300, -300), pos(300, 300), pos(-300, 300), pos(-300, -300)];
    const lp = buildLogPrior([macro({ kind: "BURN_PERIMETER", geometry: { type: "Polygon", coordinates: [ring] } })], g);
    expect(lp[cellIndex(g, 0, 0)]).toBeCloseTo(0, 6); // inside
    expect(lp[cellIndex(g, 800, 800)]).toBeLessThan(-30); // outside
  });

  it("WITNESS_CONE concentrates mass in the sector along the bearing", () => {
    const g = makeGrid();
    // observer at anchor origin, first-smoke bearing due north (0°), ±20°
    const c = macro({
      kind: "WITNESS_CONE",
      geometry: { type: "Point", coordinates: pos(0, 0) },
      bearingDeg: 0,
      spreadDeg: 20,
    });
    const lp = buildLogPrior([c], g);
    const inSector = lp[cellIndex(g, 0, 600)]; // due north
    const outSector = lp[cellIndex(g, 600, 0)]; // due east
    expect(inSector).toBeCloseTo(0, 6);
    expect(outSector).toBeLessThan(inSector);
  });

  it("FIRST_REPORT_LOC peaks at the reported point and falls off", () => {
    const g = makeGrid();
    const c = macro({
      kind: "FIRST_REPORT_LOC",
      geometry: { type: "Point", coordinates: pos(200, -200) },
      radiusM: 150,
    });
    const lp = buildLogPrior([c], g);
    const atPoint = lp[cellIndex(g, 200, -200)];
    const away = lp[cellIndex(g, -600, 600)];
    expect(atPoint).toBeGreaterThan(away);
    expect(atPoint).toBeCloseTo(0, 1); // peak ≈ 0
  });

  it("V_APEX favors the interior side of the apex over behind it", () => {
    const g = makeGrid();
    // apex at origin, axis pointing +N (interior northward)
    const c = macro({
      kind: "V_APEX",
      geometry: { type: "LineString", coordinates: [pos(0, 0), pos(0, 300)] },
      radiusM: 400,
    });
    const lp = buildLogPrior([c], g);
    const interior = lp[cellIndex(g, 0, 400)]; // ahead, on-axis
    const behind = lp[cellIndex(g, 0, -400)]; // behind the apex
    expect(interior).toBeGreaterThan(behind);
  });

  it("scales a constraint's influence by its weight", () => {
    const g = makeGrid();
    const base = macro({ kind: "FIRST_REPORT_LOC", geometry: { type: "Point", coordinates: pos(0, 0) }, radiusM: 300, weight: 1 });
    const heavy = { ...base, weight: 3 };
    const lp1 = buildLogPrior([base], g);
    const lp3 = buildLogPrior([heavy], g);
    const i = cellIndex(g, 600, 0);
    expect(lp3[i]).toBeCloseTo(3 * lp1[i], 6);
  });
});
