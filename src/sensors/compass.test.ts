import { describe, it, expect } from "vitest";
import {
  circularMeanDeg,
  circularSdDeg,
  angleDeltaDeg,
  reduceWindow,
  exceedsInterferenceDelta,
  sampleFromEvent,
  pitchOutOfRange,
} from "./compass";

describe("circular statistics", () => {
  it("computes a circular mean that wraps across 0°", () => {
    expect(circularMeanDeg([350, 10])).toBeCloseTo(0, 4);
    expect(circularMeanDeg([10, 20, 30])).toBeCloseTo(20, 4);
  });

  it("gives ~0 SD for a tight window and a larger SD for a wide one", () => {
    const tight = circularSdDeg([90, 91, 89, 90, 90]);
    const wide = circularSdDeg([60, 90, 120, 80, 110]);
    expect(tight).toBeLessThan(2);
    expect(wide).toBeGreaterThan(tight);
    expect(wide).toBeGreaterThan(15);
  });

  it("angleDeltaDeg returns the shortest signed difference", () => {
    expect(angleDeltaDeg(350, 10)).toBeCloseTo(20, 6);
    expect(angleDeltaDeg(10, 350)).toBeCloseTo(-20, 6);
    expect(angleDeltaDeg(0, 180)).toBeCloseTo(180, 6);
  });

  it("reduceWindow returns mean + SD + count", () => {
    const r = reduceWindow([100, 102, 98, 101, 99]);
    expect(r.azimuthDeg).toBeCloseTo(100, 1);
    expect(r.sampleCount).toBe(5);
    expect(r.sigmaDeg).toBeLessThan(3);
  });
});

describe("two-point interference cross-check", () => {
  it("fires when a compass vs two-point delta exceeds 15°", () => {
    expect(exceedsInterferenceDelta(100, 130)).toBe(true); // 30° apart
    expect(exceedsInterferenceDelta(100, 108)).toBe(false); // 8° apart
    expect(exceedsInterferenceDelta(2, 350)).toBe(false); // 12° across 0°
    expect(exceedsInterferenceDelta(2, 340)).toBe(true); // 22° across 0°
  });
});

describe("orientation event mapping", () => {
  it("treats iOS webkitCompassHeading as true-north", () => {
    const s = sampleFromEvent({ alpha: 200, beta: 5, gamma: -3, webkitCompassHeading: 42 });
    expect(s).toMatchObject({ headingDeg: 42, trueNorth: true, pitchDeg: 5, rollDeg: -3 });
  });

  it("treats absolute alpha as magnetic heading = 360 − alpha", () => {
    const s = sampleFromEvent({ alpha: 90, beta: 0, gamma: 0, absolute: true });
    expect(s).toMatchObject({ headingDeg: 270, trueNorth: false });
  });

  it("returns null when no heading is present", () => {
    expect(sampleFromEvent({ alpha: null, beta: null, gamma: null })).toBeNull();
  });

  it("flags an ill-conditioned tilt (|pitch| > 70°)", () => {
    expect(pitchOutOfRange(80)).toBe(true);
    expect(pitchOutOfRange(-75)).toBe(true);
    expect(pitchOutOfRange(20)).toBe(false);
    expect(pitchOutOfRange(null)).toBe(false);
  });
});
