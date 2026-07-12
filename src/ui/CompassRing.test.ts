import { describe, it, expect } from "vitest";
import { screenVectorToAzimuth } from "./CompassRing";

// The dial's drag geometry: a screen displacement from the dial center maps to a
// true-north azimuth (clockwise, y-down screen coords). This is the math a pointer
// drag runs, verified without a browser.
describe("compass drag geometry", () => {
  it("maps the four cardinals correctly (screen y grows downward)", () => {
    expect(screenVectorToAzimuth(0, -10)).toBe(0); // up -> North
    expect(screenVectorToAzimuth(10, 0)).toBe(90); // right -> East
    expect(screenVectorToAzimuth(0, 10)).toBe(180); // down -> South
    expect(screenVectorToAzimuth(-10, 0)).toBe(270); // left -> West
  });

  it("maps the diagonals to the ordinals", () => {
    expect(screenVectorToAzimuth(10, -10)).toBe(45); // up-right -> NE
    expect(screenVectorToAzimuth(10, 10)).toBe(135); // down-right -> SE
    expect(screenVectorToAzimuth(-10, 10)).toBe(225); // down-left -> SW
    expect(screenVectorToAzimuth(-10, -10)).toBe(315); // up-left -> NW
  });

  it("always returns a normalized 0–359 integer", () => {
    for (let i = 0; i < 360; i += 7) {
      const a = i * (Math.PI / 180);
      const az = screenVectorToAzimuth(Math.sin(a), -Math.cos(a));
      expect(az).toBeGreaterThanOrEqual(0);
      expect(az).toBeLessThan(360);
      expect(Number.isInteger(az)).toBe(true);
    }
  });
});
