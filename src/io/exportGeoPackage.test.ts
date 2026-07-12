import { describe, it, expect } from "vitest";
import initSqlJs from "sql.js";
import { createStore } from "../store";
import { loadMarshallDemo } from "../demo/presets";
import { buildSolution } from "../geo/solution";
import { buildGeoPackage } from "./exportGeoPackage";

/** Read the point (lon,lat) out of a GeoPackageBinary blob (LE header, no envelope). */
function readGpkgPoint(blob: Uint8Array): { lon: number; lat: number } {
  // header: 'G','P',version,flags(0x01),srs_id(4 bytes) = 8 bytes; then WKB point.
  const dv = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const wkbStart = 8;
  // wkb: byteOrder(1) + type(4) + x(8) + y(8)
  const lon = dv.getFloat64(wkbStart + 1 + 4, true);
  const lat = dv.getFloat64(wkbStart + 1 + 4 + 8, true);
  return { lon, lat };
}

describe("GeoPackage export", () => {
  it("emits a valid GeoPackage that re-opens with the required tables + feature rows", async () => {
    const store = createStore();
    loadMarshallDemo(store);
    const sol = buildSolution(store)!;
    const SQL = await initSqlJs();

    const bytes = buildGeoPackage(SQL, sol, store.activeNodes(), store.getIncident());

    // it's a real SQLite file
    expect(String.fromCharCode(...bytes.slice(0, 6))).toBe("SQLite");

    const db = new SQL.Database(bytes);
    try {
      // GeoPackage magic + version
      expect(db.exec("PRAGMA application_id")[0].values[0][0]).toBe(1196444487);

      const tables = db
        .exec("SELECT name FROM sqlite_master WHERE type='table'")[0]
        .values.map((r) => r[0]);
      for (const t of [
        "gpkg_spatial_ref_sys",
        "gpkg_contents",
        "gpkg_geometry_columns",
        "nodes",
        "origin_regions",
      ]) {
        expect(tables).toContain(t);
      }

      // row counts: five nodes, three credible regions
      expect(db.exec("SELECT COUNT(*) FROM nodes")[0].values[0][0]).toBe(5);
      expect(db.exec("SELECT COUNT(*) FROM origin_regions")[0].values[0][0]).toBe(3);

      // gpkg_contents + geometry_columns register both feature tables in EPSG:4326
      expect(db.exec("SELECT COUNT(*) FROM gpkg_contents")[0].values[0][0]).toBe(2);
      const geomCols = db.exec("SELECT table_name, geometry_type_name, srs_id FROM gpkg_geometry_columns")[0];
      expect(geomCols.values).toContainEqual(["nodes", "POINT", 4326]);
      expect(geomCols.values).toContainEqual(["origin_regions", "MULTIPOLYGON", 4326]);

      // a node geometry blob parses back to the Colorado demo coordinates
      const blob = db.exec("SELECT geom FROM nodes LIMIT 1")[0].values[0][0] as Uint8Array;
      expect(String.fromCharCode(blob[0], blob[1])).toBe("GP"); // GeoPackageBinary magic
      const { lon, lat } = readGpkgPoint(blob);
      expect(lat).toBeGreaterThan(39.9);
      expect(lat).toBeLessThan(40.0);
      expect(lon).toBeGreaterThan(-105.35);
      expect(lon).toBeLessThan(-105.2);
    } finally {
      db.close();
    }
  });
});
