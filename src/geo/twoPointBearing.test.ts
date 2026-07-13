import { describe, it, expect } from "vitest";
import { twoPointBearing, geodesicAzimuthDeg, type FixPoint } from "./twoPointBearing";
import { projectAlong, type LatLon } from "./enu";

const A: LatLon = { lat: 39.953, lon: -105.273 };

/** Fix at a known bearing + distance from A (built with the ENU projector). */
function fixAt(azDeg: number, meters: number, acc = 3): FixPoint {
  const p = projectAlong(A, A, azDeg, meters);
  return { lat: p.lat, lon: p.lon, hAccuracyM: acc };
}
const fixA = (acc = 3): FixPoint => ({ lat: A.lat, lon: A.lon, hAccuracyM: acc });

describe("twoPointBearing azimuth", () => {
  const cases: [string, number][] = [
    ["north", 0],
    ["east", 90],
    ["south", 180],
    ["west", 270],
    ["north-east", 45],
    ["south-west", 225],
  ];
  for (const [name, az] of cases) {
    it(`recovers a ${name} baseline (${az}°)`, () => {
      const r = twoPointBearing(fixA(), fixAt(az, 20));
      expect(Math.abs(((r.azimuthTrueDeg - az + 540) % 360) - 180)).toBeLessThan(0.05);
      expect(r.baselineM).toBeCloseTo(20, 1);
    });
  }
});

describe("twoPointBearing sigma propagation", () => {
  it("gives ~12° for a 20 m baseline with ~3 m fixes (CRESEARCH §2.3b)", () => {
    const r = twoPointBearing(fixA(3), fixAt(30, 20, 3));
    expect(r.sigmaDeg).toBeGreaterThan(11);
    expect(r.sigmaDeg).toBeLessThan(13);
  });

  it("sigma grows as the baseline shrinks", () => {
    const long = twoPointBearing(fixA(3), fixAt(30, 30, 3)).sigmaDeg;
    const short = twoPointBearing(fixA(3), fixAt(30, 10, 3)).sigmaDeg;
    expect(short).toBeGreaterThan(long);
  });

  it("sigma grows as fix accuracy worsens", () => {
    const tight = twoPointBearing(fixA(2), fixAt(30, 20, 2)).sigmaDeg;
    const loose = twoPointBearing(fixA(8), fixAt(30, 20, 8)).sigmaDeg;
    expect(loose).toBeGreaterThan(tight);
  });

  it("flags a baseline below the minimum (σ explodes)", () => {
    const r = twoPointBearing(fixA(3), fixAt(30, 3, 3), { minBaselineM: 5 });
    expect(r.belowMinBaseline).toBe(true);
    const ok = twoPointBearing(fixA(3), fixAt(30, 20, 3), { minBaselineM: 5 });
    expect(ok.belowMinBaseline).toBe(false);
  });
});

describe("ENU vs geodesic agreement", () => {
  it("ENU-plane azimuth matches the great-circle bearing to <0.01° at 1 km", () => {
    for (const az of [0, 30, 90, 137, 200, 315]) {
      const b = projectAlong(A, A, az, 1000);
      const enuAz = twoPointBearing(fixA(), { lat: b.lat, lon: b.lon, hAccuracyM: 3 }).azimuthTrueDeg;
      const geo = geodesicAzimuthDeg(A, b);
      const delta = Math.abs(((enuAz - geo + 540) % 360) - 180);
      expect(delta).toBeLessThan(0.01);
    }
  });
});
