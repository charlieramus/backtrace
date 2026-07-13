// GeoPackage exporter — an OGC GeoPackage (a SQLite database, CRESEARCH.md §3.1) so an
// agency GIS analyst opens the investigation natively in QGIS / ArcGIS Pro. Built entirely
// in memory with sql.js (SQLite compiled to wasm, bundled same-origin as
// `public/sql-wasm.wasm` — never fetched from a CDN, works offline once the app shell is
// cached). It writes the required OGC tables (gpkg_spatial_ref_sys, gpkg_contents,
// gpkg_geometry_columns) plus two feature tables — `nodes` (points) and `origin_regions`
// (the p50/p68/p95 credible-region polygons) — with GeoPackageBinary geometry in EPSG:4326.
//
// The pure builder `buildGeoPackage(SQL, …)` takes an already-initialized sql.js so it is
// testable in Node; the browser wrapper loads the wasm via locateFile.

import type { Store, IncidentHeader } from "../store";
import type { Node } from "../domain/node";
import { effectiveSigma } from "../domain/node";
import type { MacroConstraint, MacroGeometry } from "../domain/macro";
import type { OriginSolution, MultiPolygon } from "../geo/solution";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import { ensureSolution, downloadBlob, exportFilename, recordExport } from "./exportUtil";

const GPKG_APPLICATION_ID = 1196444487; // 'GPKG' — GeoPackage 1.2+ magic
const GPKG_USER_VERSION = 10200; // 1.2.0
const SRS_WGS84 = 4326;

// EPSG:4326 WKT for gpkg_spatial_ref_sys.definition.
const WGS84_WKT =
  'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,' +
  'AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],PRIMEM["Greenwich",0,' +
  'AUTHORITY["EPSG","8901"]],UNIT["degree",0.0174532925199433,' +
  'AUTHORITY["EPSG","9122"]],AUTHORITY["EPSG","4326"]]';

// --- little-endian WKB + GeoPackageBinary geometry --------------------------

function u32le(n: number): number[] {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return Array.from(b);
}
function f64le(n: number): number[] {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setFloat64(0, n, true);
  return Array.from(b);
}

/** GeoPackageBinary header: 'GP', version 0, flags 0x01 (LE, no envelope), srs_id. */
function gpkgHeader(srsId = SRS_WGS84): number[] {
  return [0x47, 0x50, 0x00, 0x01, ...u32le(srsId)];
}

function pointWkb(lon: number, lat: number): number[] {
  return [0x01, ...u32le(1), ...f64le(lon), ...f64le(lat)];
}

function ringWkb(ring: number[][]): number[] {
  const out: number[] = [...u32le(ring.length)];
  for (const [lon, lat] of ring) out.push(...f64le(lon), ...f64le(lat));
  return out;
}

function polygonWkb(rings: number[][][]): number[] {
  const out: number[] = [0x01, ...u32le(3), ...u32le(rings.length)];
  for (const r of rings) out.push(...ringWkb(r));
  return out;
}

function multiPolygonWkb(mp: MultiPolygon): number[] {
  const out: number[] = [0x01, ...u32le(6), ...u32le(mp.coordinates.length)];
  for (const poly of mp.coordinates) out.push(...polygonWkb(poly));
  return out;
}

function lineStringWkb(coords: number[][]): number[] {
  const out: number[] = [0x01, ...u32le(2), ...u32le(coords.length)];
  for (const [lon, lat] of coords) out.push(...f64le(lon), ...f64le(lat));
  return out;
}

/** WKB for a macro constraint's WGS84 GeoJSON geometry (Point/LineString/Polygon). */
function macroWkb(g: MacroGeometry): number[] {
  if (g.type === "Point") return pointWkb(g.coordinates[0], g.coordinates[1]);
  if (g.type === "LineString") return lineStringWkb(g.coordinates);
  return polygonWkb(g.coordinates);
}

function gpkgGeom(wkb: number[]): Uint8Array {
  return Uint8Array.from([...gpkgHeader(), ...wkb]);
}

// --- bounding box for gpkg_contents -----------------------------------------

interface Bbox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
function emptyBbox(): Bbox {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}
function grow(b: Bbox, lon: number, lat: number): void {
  if (lon < b.minX) b.minX = lon;
  if (lon > b.maxX) b.maxX = lon;
  if (lat < b.minY) b.minY = lat;
  if (lat > b.maxY) b.maxY = lat;
}
function growMulti(b: Bbox, mp: MultiPolygon): void {
  for (const poly of mp.coordinates) for (const ring of poly) for (const [lon, lat] of ring) grow(b, lon, lat);
}

// --- builder ----------------------------------------------------------------

/**
 * Build a valid GeoPackage (SQLite bytes) from a solution + the active nodes. `SQL` is an
 * initialized sql.js module (injected so this stays Node-testable). Never recomputes the
 * posterior — geometry is read verbatim from the solution.
 */
export function buildGeoPackage(
  SQL: SqlJsStatic,
  sol: OriginSolution,
  nodes: Node[],
  incident: IncidentHeader,
  macros: MacroConstraint[] = [],
): Uint8Array {
  const db = new SQL.Database();
  try {
    db.run(`PRAGMA application_id = ${GPKG_APPLICATION_ID};`);
    db.run(`PRAGMA user_version = ${GPKG_USER_VERSION};`);

    db.run(
      `CREATE TABLE gpkg_spatial_ref_sys (
        srs_name TEXT NOT NULL, srs_id INTEGER NOT NULL PRIMARY KEY,
        organization TEXT NOT NULL, organization_coordsys_id INTEGER NOT NULL,
        definition TEXT NOT NULL, description TEXT);`,
    );
    const srs: Array<[string, number, string, number, string, string]> = [
      ["Undefined cartesian SRS", -1, "NONE", -1, "undefined", "undefined cartesian coordinate reference system"],
      ["Undefined geographic SRS", 0, "NONE", 0, "undefined", "undefined geographic coordinate reference system"],
      ["WGS 84 geodetic", SRS_WGS84, "EPSG", 4326, WGS84_WKT, "longitude/latitude coordinates in decimal degrees on the WGS 84 ellipsoid"],
    ];
    for (const r of srs)
      db.run(
        `INSERT INTO gpkg_spatial_ref_sys VALUES (?,?,?,?,?,?);`,
        r as unknown as (string | number)[],
      );

    db.run(
      `CREATE TABLE gpkg_contents (
        table_name TEXT NOT NULL PRIMARY KEY, data_type TEXT NOT NULL,
        identifier TEXT UNIQUE, description TEXT DEFAULT '', last_change TEXT NOT NULL,
        min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER);`,
    );
    db.run(
      `CREATE TABLE gpkg_geometry_columns (
        table_name TEXT NOT NULL, column_name TEXT NOT NULL, geometry_type_name TEXT NOT NULL,
        srs_id INTEGER NOT NULL, z TINYINT NOT NULL, m TINYINT NOT NULL,
        CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name));`,
    );

    // feature tables
    db.run(
      `CREATE TABLE nodes (
        fid INTEGER PRIMARY KEY AUTOINCREMENT, geom BLOB, node_id TEXT,
        indicator_code TEXT, spread_type TEXT, azimuth_true_deg REAL, sigma_deg REAL,
        azimuth_method TEXT, position_source TEXT, h_accuracy_m REAL,
        investigator_conf TEXT, record_hash TEXT);`,
    );
    db.run(
      `CREATE TABLE origin_regions (
        fid INTEGER PRIMARY KEY AUTOINCREMENT, geom BLOB, level REAL,
        confidence_pct INTEGER, algorithm TEXT, area_m2 REAL);`,
    );

    const nodesBbox = emptyBbox();
    for (const n of nodes) {
      grow(nodesBbox, n.lon, n.lat);
      db.run(
        `INSERT INTO nodes
          (geom, node_id, indicator_code, spread_type, azimuth_true_deg, sigma_deg,
           azimuth_method, position_source, h_accuracy_m, investigator_conf, record_hash)
         VALUES (?,?,?,?,?,?,?,?,?,?,?);`,
        [
          gpkgGeom(pointWkb(n.lon, n.lat)),
          n.id,
          n.indicatorCode,
          n.spreadType,
          n.azimuthTrueDeg,
          effectiveSigma(n),
          n.azimuthMethod ?? null,
          n.positionSource ?? null,
          n.hAccuracyM ?? null,
          n.investigatorConf ?? null,
          n.recordHash ?? null,
        ],
      );
    }

    const regionsBbox = emptyBbox();
    const regionRows: Array<[MultiPolygon, number]> = [
      [sol.regions.p50, 0.5],
      [sol.regions.p68, 0.68],
      [sol.regions.p95, 0.95],
    ];
    for (const [mp, level] of regionRows) {
      growMulti(regionsBbox, mp);
      db.run(
        `INSERT INTO origin_regions (geom, level, confidence_pct, algorithm, area_m2)
         VALUES (?,?,?,?,?);`,
        [
          gpkgGeom(multiPolygonWkb(mp)),
          level,
          Math.round(level * 100),
          sol.algorithm,
          level === 0.95 ? sol.region95AreaM2 : null,
        ],
      );
    }

    // Macro constraints (V10) — priors over the origin, mixed geometry (GEOMETRY type).
    const macroBbox = emptyBbox();
    if (macros.length > 0) {
      db.run(
        `CREATE TABLE macro_constraints (
          fid INTEGER PRIMARY KEY AUTOINCREMENT, geom BLOB, macro_id TEXT, kind TEXT,
          source TEXT, weight REAL, bearing_deg REAL, spread_deg REAL, radius_m REAL,
          notes TEXT, record_hash TEXT);`,
      );
      for (const m of macros) {
        // grow the bbox from the geometry's coordinates
        const g = m.geometry;
        if (g.type === "Point") grow(macroBbox, g.coordinates[0], g.coordinates[1]);
        else if (g.type === "LineString") for (const [lo, la] of g.coordinates) grow(macroBbox, lo, la);
        else for (const ring of g.coordinates) for (const [lo, la] of ring) grow(macroBbox, lo, la);
        db.run(
          `INSERT INTO macro_constraints
            (geom, macro_id, kind, source, weight, bearing_deg, spread_deg, radius_m, notes, record_hash)
           VALUES (?,?,?,?,?,?,?,?,?,?);`,
          [
            gpkgGeom(macroWkb(m.geometry)),
            m.id, m.kind, m.source, m.weight,
            m.bearingDeg ?? null, m.spreadDeg ?? null, m.radiusM ?? null,
            m.notes, m.recordHash ?? null,
          ],
        );
      }
    }

    const now = new Date().toISOString();
    const contents: Array<[string, string, string, string, Bbox]> = [
      ["nodes", "features", `${incident.name} — indicator nodes`, "Placed fire-pattern indicator nodes", nodesBbox],
      ["origin_regions", "features", `${incident.name} — credible regions`, "HDR 50/68/95 candidate-origin regions", regionsBbox],
    ];
    if (macros.length > 0)
      contents.push(["macro_constraints", "features", `${incident.name} — macro priors`, "Macro constraints consumed as a Bayesian prior over the origin", macroBbox]);
    for (const [table, type, ident, desc, bb] of contents) {
      const finite = Number.isFinite(bb.minX);
      db.run(
        `INSERT INTO gpkg_contents
          (table_name, data_type, identifier, description, last_change, min_x, min_y, max_x, max_y, srs_id)
         VALUES (?,?,?,?,?,?,?,?,?,?);`,
        [
          table, type, ident, desc, now,
          finite ? bb.minX : null, finite ? bb.minY : null,
          finite ? bb.maxX : null, finite ? bb.maxY : null,
          SRS_WGS84,
        ],
      );
    }

    db.run(
      `INSERT INTO gpkg_geometry_columns VALUES
        ('nodes','geom','POINT',?,0,0),
        ('origin_regions','geom','MULTIPOLYGON',?,0,0);`,
      [SRS_WGS84, SRS_WGS84],
    );
    if (macros.length > 0)
      db.run(`INSERT INTO gpkg_geometry_columns VALUES ('macro_constraints','geom','GEOMETRY',?,0,0);`, [SRS_WGS84]);

    return db.export();
  } finally {
    db.close();
  }
}

// --- browser loader + wrapper -----------------------------------------------

let sqlPromise: Promise<SqlJsStatic> | null = null;
/** Load sql.js with the same-origin bundled wasm (offline; never a CDN fetch). */
export function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({
      locateFile: () => `${import.meta.env.BASE_URL}sql-wasm.wasm`,
    });
  }
  return sqlPromise;
}

/** Export the current investigation as a downloaded `.gpkg` (offline). */
export async function exportGeoPackage(store: Store): Promise<void> {
  const sol = ensureSolution(store);
  const incident = store.getIncident();
  if (!sol) return;
  const SQL = await loadSqlJs();
  const bytes = buildGeoPackage(SQL, sol, store.activeNodes(), incident, store.activeMacros());
  downloadBlob(bytes, exportFilename(incident.name, "gpkg"), "application/geopackage+sqlite3");
  recordExport(store, "gpkg", sol);
}
