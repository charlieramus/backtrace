import { describe, it, expect } from "vitest";
import { ABOUT_SECTIONS, ABOUT_SOURCES, INDICATOR_ERROR_DEG } from "./About";
import { APP_VERSION } from "../io/savefile";

const byId = (id: string): string => ABOUT_SECTIONS.find((s) => s.id === id)?.body ?? "";

// The overlay's DOM open/close is exercised in the browser (there's no jsdom in this
// node test env). What we can lock here is the content contract: the six sections the
// scaffold promises, in order, each with a heading and a non-empty body.
describe("About content", () => {
  it("has the six scaffold sections in order", () => {
    expect(ABOUT_SECTIONS.map((s) => s.id)).toEqual([
      "what",
      "why",
      "math",
      "honesty",
      "sources",
      "author",
    ]);
  });

  it("gives every section a title and a body", () => {
    for (const s of ABOUT_SECTIONS) {
      expect(s.title.trim().length).toBeGreaterThan(0);
      expect(s.body.trim().length).toBeGreaterThan(0);
    }
  });

  // The ~103° figure is the number the PDF appendix and CRESEARCH.md use — the copy must
  // not drift from it. It appears in both the "why" and "honesty" sections.
  it("states the ~103° indicator error rate consistently with the exports", () => {
    expect(INDICATOR_ERROR_DEG).toBe(103);
    expect(byId("why")).toContain(`${INDICATOR_ERROR_DEG}°`);
    expect(byId("why")).toMatch(/Parker\s*&amp;\s*Babrauskas/);
    expect(byId("honesty")).toContain(`${INDICATOR_ERROR_DEG}°`);
  });

  // The math section must describe the estimator the app actually runs (src/geo/posterior.ts
  // + hdr.ts), not an invented one, and cite the CRESEARCH sections.
  it("describes the real estimator and cites its sections", () => {
    const math = byId("math");
    for (const claim of ["ENU", "von Mises", "κ", "15%", "highest-density", "Kalman"]) {
      expect(math).toContain(claim);
    }
    for (const cite of ["§1.1", "§1.3", "§1.4"]) {
      expect(math).toContain(cite);
    }
  });

  it("lists Parker & Babrauskas first, with its DOI, then the doctrine + geodesy sources", () => {
    expect(ABOUT_SOURCES[0].primary).toBe(true);
    expect(ABOUT_SOURCES[0].cite).toMatch(/Parker/);
    expect(ABOUT_SOURCES[0].href).toContain("10.3390/fire7010005");
    const all = ABOUT_SOURCES.map((s) => s.cite).join(" ");
    for (const name of ["PMS 412", "NFPA 921", "World Magnetic Model 2025", "Karney", "Rothermel", "Fisher"]) {
      expect(all).toContain(name);
    }
    // Exactly one primary source, and external links open safely (new tab, noopener).
    expect(ABOUT_SOURCES.filter((s) => s.primary)).toHaveLength(1);
    expect(byId("sources")).toContain('target="_blank" rel="noopener noreferrer"');
  });

  it("credits the author with the Boulder Reporting Lab link and the real app version", () => {
    const author = byId("author");
    expect(author).toContain("Charlie Ramus");
    expect(author).toContain("boulderreportinglab.org");
    expect(author).toContain(`Backtrace v${APP_VERSION}`);
  });
});
