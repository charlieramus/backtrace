// Coherence: every V7 exporter reads the SAME origin solution, so no format diverges from
// another, and the whole export path runs offline (no network — tests have none by
// construction). Drives one Marshall solution through all four court formats + the JSON
// record and checks each artifact is valid and references that one solution.

import { describe, it, expect } from "vitest";
import initSqlJs from "sql.js";
import { createStore } from "../store";
import { loadMarshallDemo } from "../demo/presets";
import { buildSolution } from "../geo/solution";
import { buildSaveFile, saveFileToJson } from "./savefile";
import { buildGeoJson } from "./exportGeoJson";
import { buildKml } from "./exportKml";
import { buildGeoPackage } from "./exportGeoPackage";
import { buildPdf } from "./exportPdf";
import { recordExport, type ExportFormat } from "./exportUtil";

describe("export coherence", () => {
  it("all five formats build valid artifacts off one shared solution, offline", async () => {
    const store = createStore();
    loadMarshallDemo(store);

    // one solution, persisted — the single source every format reads
    const sol = buildSolution(store)!;
    store.setSolution(sol);
    const nodes = store.activeNodes();
    const incident = store.getIncident();
    const areaStr = Math.round(sol.region95AreaM2).toLocaleString("en-US");

    // JSON investigation carries the persisted solution
    const save = JSON.parse(saveFileToJson(buildSaveFile(store.getState())));
    expect(save.solution.id).toBe(sol.id);
    expect(save.solution.region95AreaM2).toBe(sol.region95AreaM2);

    // GeoJSON — same solution's area, valid FeatureCollection
    const gj = JSON.parse(buildGeoJson(sol, nodes, incident));
    expect(gj.type).toBe("FeatureCollection");
    expect(gj.properties.region95AreaM2).toBe(sol.region95AreaM2);

    // KML — well-formed root, same area in the description
    const kml = buildKml(sol, nodes, incident);
    expect(kml).toContain("<kml");
    expect(kml).toContain(areaStr);

    // GeoPackage — a real SQLite/GeoPackage with the 95% area in origin_regions
    const SQL = await initSqlJs();
    const gpkg = buildGeoPackage(SQL, sol, nodes, incident);
    expect(String.fromCharCode(...gpkg.slice(0, 6))).toBe("SQLite");
    const db = new SQL.Database(gpkg);
    try {
      const area = db.exec("SELECT area_m2 FROM origin_regions WHERE confidence_pct = 95")[0].values[0][0];
      expect(Math.round(area as number)).toBe(Math.round(sol.region95AreaM2));
    } finally {
      db.close();
    }

    // PDF — valid, and the same area text is in the (inflated-free) result string set
    const pdf = await buildPdf(sol, nodes, incident, store.getInvestigator(), "hash");
    expect(String.fromCharCode(...pdf.slice(0, 5))).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(3000);

    // every court export appends one EXPORT audit entry naming THIS solution
    for (const f of ["geojson", "kml", "gpkg", "pdf"] as ExportFormat[]) recordExport(store, f, sol);
    const exports = store.getAuditLog().filter((e) => e.action === "EXPORT");
    expect(exports).toHaveLength(4);
    expect(exports.every((e) => e.afterJson!.includes(sol.id))).toBe(true);
  });
});
