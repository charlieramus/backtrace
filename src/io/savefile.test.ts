import { describe, it, expect } from "vitest";
import {
  buildSaveFile,
  saveFileToJson,
  parseSaveFile,
  applySaveFile,
} from "./savefile";
import { createStore } from "../store";

function seed() {
  const store = createStore();
  store.setIncidentName("Marshall Fire — desk trace");
  const a = store.add({
    lat: 39.95,
    lon: -105.28,
    indicatorCode: "ANGLE_OF_CHAR",
    spreadType: "ADVANCING",
    azimuthTrueDeg: 284,
    sigmaDeg: 98,
    notes: "char on the fence line",
  });
  store.setAnchor(a.lat, a.lon);
  store.add({
    lat: 39.96,
    lon: -105.27,
    indicatorCode: "STAINING",
    spreadType: "LATERAL",
    azimuthTrueDeg: 12,
    sigmaDeg: 106,
  });
  store.add({
    lat: 39.94,
    lon: -105.3,
    indicatorCode: "PROTECTION",
    spreadType: "BACKING",
    azimuthTrueDeg: null,
    sigmaDeg: null,
  });
  return store;
}

describe("save files", () => {
  it("round-trips an investigation: export -> JSON -> import into a fresh store", () => {
    const src = seed();
    const json = saveFileToJson(buildSaveFile(src.getState()));

    const parsed = parseSaveFile(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const fresh = createStore();
    applySaveFile(fresh, parsed.data, "replace");

    // deep equality of nodes + incident
    expect(fresh.getAll()).toEqual(src.getAll());
    expect(fresh.getIncident()).toEqual(src.getIncident());
    // azimuth + σ + spread survived intact
    const n0 = fresh.getAll()[0];
    expect(n0.azimuthTrueDeg).toBe(284);
    expect(n0.sigmaDeg).toBe(98);
    expect(fresh.getIncident().anchorLat).toBe(39.95);
  });

  it("merge appends imported nodes and keeps the existing ones", () => {
    const src = seed();
    const json = saveFileToJson(buildSaveFile(src.getState()));
    const parsed = parseSaveFile(json);
    if (!parsed.ok) throw new Error(parsed.error);

    const existing = createStore();
    existing.add({ lat: 40, lon: -105, indicatorCode: "SOOTING" });
    applySaveFile(existing, parsed.data, "merge");
    expect(existing.getAll()).toHaveLength(1 + 3);
  });

  it("rejects bad files loudly with a readable message (never a silent load)", () => {
    expect(parseSaveFile("{ not json").ok).toBe(false);

    const notOurs = parseSaveFile(JSON.stringify({ hello: "world" }));
    expect(notOurs.ok).toBe(false);
    if (!notOurs.ok) expect(notOurs.error).toMatch(/not a Backtrace/i);

    const badVersion = parseSaveFile(
      JSON.stringify({ format: "backtrace-investigation", formatVersion: 99, incident: {}, nodes: [] }),
    );
    expect(badVersion.ok).toBe(false);
    if (!badVersion.ok) expect(badVersion.error).toMatch(/version/i);

    const badNode = parseSaveFile(
      JSON.stringify({
        format: "backtrace-investigation",
        formatVersion: 1,
        incident: { id: "x", name: "n", anchorLat: null, anchorLon: null },
        nodes: [{ id: "a", lat: 1, lon: 2, indicatorCode: "NOPE", spreadType: "ADVANCING" }],
      }),
    );
    expect(badNode.ok).toBe(false);
    if (!badNode.ok) expect(badNode.error).toMatch(/unknown indicator/i);
  });
});
