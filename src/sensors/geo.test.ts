import { describe, it, expect } from "vitest";
import {
  readingFromPosition,
  averageReadings,
  getCurrentReading,
  type GeolocationLike,
  type GeolocationPositionLike,
  type GeoReading,
} from "./geo";

function pos(
  lat: number,
  lon: number,
  accuracy: number,
  extra: Partial<GeolocationPositionLike["coords"]> = {},
  ts = Date.UTC(2026, 0, 2, 3, 4, 5),
): GeolocationPositionLike {
  return {
    coords: {
      latitude: lat,
      longitude: lon,
      altitude: null,
      accuracy,
      altitudeAccuracy: null,
      ...extra,
    },
    timestamp: ts,
  };
}

describe("readingFromPosition", () => {
  it("maps a GeolocationPosition to a typed reading incl. accuracy", () => {
    const r = readingFromPosition(pos(39.953, -105.273, 6, { altitude: 1740, altitudeAccuracy: 8 }));
    expect(r.lat).toBeCloseTo(39.953, 6);
    expect(r.lon).toBeCloseTo(-105.273, 6);
    expect(r.hAccuracyM).toBe(6);
    expect(r.altitude).toBe(1740);
    expect(r.vAccuracyM).toBe(8);
    expect(r.timestampUtc).toBe(new Date(Date.UTC(2026, 0, 2, 3, 4, 5)).toISOString());
    expect(r.sampleCount).toBe(1);
  });

  it("leaves altitude/vAccuracy null when the device omits them (never faked)", () => {
    const r = readingFromPosition(pos(39.953, -105.273, 6));
    expect(r.altitude).toBeNull();
    expect(r.vAccuracyM).toBeNull();
  });
});

describe("averageReadings", () => {
  const jitter = (): GeoReading[] =>
    [
      pos(39.9530, -105.2730, 10),
      pos(39.9531, -105.2729, 10),
      pos(39.9529, -105.2731, 10),
      pos(39.9530, -105.2730, 10),
      pos(39.9532, -105.2728, 10),
    ].map(readingFromPosition);

  it("reduces reported accuracy for jittered stationary fixes", () => {
    const avg = averageReadings(jitter());
    // √5 tightening of a 10 m mean accuracy ≈ 4.47 m — strictly better than one fix.
    expect(avg.hAccuracyM).toBeLessThan(10);
    expect(avg.hAccuracyM).toBeCloseTo(10 / Math.sqrt(5), 5);
    expect(avg.sampleCount).toBe(5);
  });

  it("keeps the averaged position within the spread of the fixes", () => {
    const avg = averageReadings(jitter());
    expect(avg.lat).toBeGreaterThan(39.9528);
    expect(avg.lat).toBeLessThan(39.9533);
    expect(avg.lon).toBeGreaterThan(-105.2732);
    expect(avg.lon).toBeLessThan(-105.2727);
  });

  it("returns a single fix unchanged (invents no precision)", () => {
    const one = readingFromPosition(pos(1, 2, 7));
    expect(averageReadings([one])).toBe(one);
  });
});

describe("getCurrentReading", () => {
  it("resolves a typed reading from an injected geolocation provider", async () => {
    const geo: GeolocationLike = {
      getCurrentPosition: (ok) => ok(pos(10, 20, 5)),
      watchPosition: () => 1,
      clearWatch: () => {},
    };
    const r = await getCurrentReading(undefined, geo);
    expect(r).toMatchObject({ lat: 10, lon: 20, hAccuracyM: 5 });
  });

  it("rejects honestly when permission is denied", async () => {
    const geo: GeolocationLike = {
      getCurrentPosition: (_ok, err) => err({ code: 1, message: "denied" }),
      watchPosition: () => 1,
      clearWatch: () => {},
    };
    await expect(getCurrentReading(undefined, geo)).rejects.toThrow(/permission denied/i);
  });

  it("rejects honestly when geolocation is unsupported (never spins)", async () => {
    await expect(getCurrentReading(undefined, null)).rejects.toThrow(/isn't available/i);
  });
});
