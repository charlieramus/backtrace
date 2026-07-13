import { describe, it, expect } from "vitest";
import {
  declination,
  magneticField,
  magneticToTrue,
  decimalYear,
  WMM_MODEL,
  WMM_MODEL_EPOCH,
} from "./wmm";

// Expected declinations from the official NOAA WMM2025 model (cross-checked against the
// pygeomag 1.1.0 reference, which bundles the same WMM.COF). Bundled here so the test is
// self-contained + offline. Tolerance is a small fraction of a degree — the bundled evaluator
// reproduces the reference to well under 0.01°.
const KNOWN: { name: string; lat: number; lon: number; altM: number; year: number; decDeg: number }[] = [
  { name: "Boulder, CO", lat: 40.0, lon: -105.0, altM: 0, year: 2025.5, decDeg: 7.6269 },
  { name: "Marshall origin, CO", lat: 39.953, lon: -105.273, altM: 1740, year: 2025.5, decDeg: 7.76 },
  { name: "London", lat: 51.5, lon: -0.12, altM: 0, year: 2025.5, decDeg: 0.9945 },
  { name: "Sydney", lat: -33.87, lon: 151.21, altM: 0, year: 2025.5, decDeg: 12.8 },
  { name: "Null Island", lat: 0, lon: 0, altM: 0, year: 2025.0, decDeg: -4.0162 },
];

describe("WMM2025 declination vs the NOAA calculator", () => {
  it("bundles the 2025.0 epoch model", () => {
    expect(WMM_MODEL).toBe("WMM2025");
    expect(WMM_MODEL_EPOCH).toBeCloseTo(2025.0, 6);
  });

  for (const p of KNOWN) {
    it(`${p.name} matches NOAA within a fraction of a degree`, () => {
      const d = declination(p.lat, p.lon, p.altM, p.year).declinationDeg;
      expect(Math.abs(d - p.decDeg)).toBeLessThan(0.05);
    });
  }

  it("returns companion field components (inclination, total + horizontal field in µT)", () => {
    const f = magneticField(40.0, -105.0, 0, 2025.5);
    expect(f.inclinationDeg).toBeGreaterThan(60); // steep dip at Colorado mid-latitudes
    expect(f.inclinationDeg).toBeLessThan(70);
    expect(f.totalFieldUt).toBeGreaterThan(45); // ~51 µT
    expect(f.totalFieldUt).toBeLessThan(60);
    expect(f.horizontalUt).toBeLessThan(f.totalFieldUt);
  });
});

describe("magneticToTrue", () => {
  it("adds an east (positive) declination and wraps to 0–360", () => {
    expect(magneticToTrue(10, 7.76)).toBeCloseTo(17.76, 6);
    expect(magneticToTrue(355, 10)).toBeCloseTo(5, 6);
    expect(magneticToTrue(5, -10)).toBeCloseTo(355, 6);
  });
});

describe("decimalYear", () => {
  it("maps Jan 1 UTC to the integer year and mid-year to ~+0.5", () => {
    expect(decimalYear(new Date(Date.UTC(2026, 0, 1)))).toBeCloseTo(2026.0, 6);
    expect(decimalYear(new Date(Date.UTC(2026, 6, 2)))).toBeCloseTo(2026.5, 2);
  });
});
