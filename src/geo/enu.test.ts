import { describe, it, expect } from "vitest";
import {
  enuFromLatLon,
  enuToLatLon,
  azToUnitEnu,
  projectAlong,
  type LatLon,
} from "./enu";

// Marshall Fire desk anchor from the mockup meta line.
const ANCHOR: LatLon = { lat: 39.9528, lon: -105.284 };

/** Great-circle-ish meter distance between two nearby points (haversine). */
function metersBetween(a: LatLon, b: LatLon): number {
  const R = 6371008.8;
  const dLat = (b.lat - a.lat) * (Math.PI / 180);
  const dLon = (b.lon - a.lon) * (Math.PI / 180);
  const lat1 = a.lat * (Math.PI / 180);
  const lat2 = b.lat * (Math.PI / 180);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

describe("ENU tangent-plane core", () => {
  it("round-trips a known lat/lon through ENU and back to sub-meter", () => {
    // A point roughly 1.5 km NE of the anchor.
    const pt: LatLon = { lat: 39.9612, lon: -105.271 };
    const enu = enuFromLatLon(pt.lat, pt.lon, ANCHOR);
    const back = enuToLatLon(enu.e, enu.n, ANCHOR);
    const err = metersBetween(pt, back);
    // Report-worthy: the observed round-trip error.
    expect(err).toBeLessThan(1); // sub-meter
  });

  it("round-trips the anchor itself to ~zero offset", () => {
    const enu = enuFromLatLon(ANCHOR.lat, ANCHOR.lon, ANCHOR);
    expect(Math.hypot(enu.e, enu.n)).toBeLessThan(1e-6);
  });

  it("azToUnitEnu points due-North for az=0 and due-East for az=90", () => {
    const north = azToUnitEnu(0);
    expect(north.e).toBeCloseTo(0, 12);
    expect(north.n).toBeCloseTo(1, 12);

    const east = azToUnitEnu(90);
    expect(east.e).toBeCloseTo(1, 12);
    expect(east.n).toBeCloseTo(0, 12);

    const south = azToUnitEnu(180);
    expect(south.n).toBeCloseTo(-1, 12);
    const west = azToUnitEnu(270);
    expect(west.e).toBeCloseTo(-1, 12);
  });

  it("projectAlong at az=90 moves due East (lon increases, lat ~unchanged)", () => {
    const out = projectAlong(ANCHOR, ANCHOR, 90, 1000);
    expect(out.lon).toBeGreaterThan(ANCHOR.lon); // eastward
    expect(Math.abs(out.lat - ANCHOR.lat)).toBeLessThan(1e-4); // stays ~on the parallel
    // Ground distance ~1000 m. The reference is a spherical haversine while the ENU
    // projection is WGS84-ellipsoidal, so allow a few meters of formula mismatch.
    const d = metersBetween(ANCHOR, out);
    expect(d).toBeGreaterThan(990);
    expect(d).toBeLessThan(1010);
  });

  it("projectAlong at az=0 moves due North (lat increases)", () => {
    const out = projectAlong(ANCHOR, ANCHOR, 0, 1000);
    expect(out.lat).toBeGreaterThan(ANCHOR.lat);
    expect(Math.abs(out.lon - ANCHOR.lon)).toBeLessThan(1e-4);
    const d = metersBetween(ANCHOR, out);
    expect(d).toBeGreaterThan(990);
    expect(d).toBeLessThan(1010);
  });
});
