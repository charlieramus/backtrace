// ENU local tangent-plane geometry (CRESEARCH.md §1.1) — pure, no Leaflet/DOM.
//
// The whole app does its geometry in a local East-North-Up frame anchored at the
// session anchor (the first placed node), working in METERS, and converts back to
// lat/lon only at the display boundary. This keeps bearings, ray projection, and the
// v4 posterior grid in a flat metric space where trigonometry is honest and cheap.
//
// Convention (§1.1): a true-north azimuth's unit vector is d = (sin az, cos az), with
// sin on East and cos on North — so az=0 points +N, az=90 points +E, clockwise.
//
// DESK-SCALE LIMITATION: at v0 desk scale we treat map north as true north and ignore
// magnetic declination (WMM2025 is a v1 field-mode concern, see NOW.md / CRESEARCH.md
// §2). Azimuths here are true-north degrees; the field build stores raw azimuth +
// declination separately.

// --- WGS84 ellipsoid constants ----------------------------------------------
const WGS84_A = 6378137.0; // semi-major axis (m)
const WGS84_F = 1 / 298.257223563; // flattening
const WGS84_E2 = WGS84_F * (2 - WGS84_F); // first eccentricity squared

const DEG = Math.PI / 180;

/** A geographic point (WGS84 degrees, height in meters). */
export interface LatLon {
  lat: number;
  lon: number;
}

/** An ECEF position in meters. */
export interface Ecef {
  x: number;
  y: number;
  z: number;
}

/** A local East-North(-Up) offset in meters from the anchor. */
export interface Enu {
  e: number;
  n: number;
  u?: number;
}

/**
 * Geodetic (lat, lon, height) -> geocentric ECEF (x, y, z) in meters. Standard
 * closed-form WGS84 forward transform.
 */
export function geodeticToEcef(lat: number, lon: number, h = 0): Ecef {
  const phi = lat * DEG;
  const lam = lon * DEG;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinPhi * sinPhi);
  return {
    x: (N + h) * cosPhi * Math.cos(lam),
    y: (N + h) * cosPhi * Math.sin(lam),
    z: (N * (1 - WGS84_E2) + h) * sinPhi,
  };
}

/**
 * ECEF -> geodetic (lat, lon, height). Bowring-style fixed-point iteration; a
 * handful of passes converge to well under a millimeter at desk scale.
 */
export function ecefToGeodetic(p: Ecef): { lat: number; lon: number; h: number } {
  const lon = Math.atan2(p.y, p.x);
  const r = Math.hypot(p.x, p.y);
  let lat = Math.atan2(p.z, r * (1 - WGS84_E2));
  let N = WGS84_A;
  let h = 0;
  for (let i = 0; i < 6; i++) {
    const sinLat = Math.sin(lat);
    N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
    h = r / Math.cos(lat) - N;
    lat = Math.atan2(p.z, r * (1 - (WGS84_E2 * N) / (N + h)));
  }
  return { lat: lat / DEG, lon: lon / DEG, h };
}

/**
 * ECEF point `p` -> local ENU offset (meters) about tangent-plane origin `p0`, whose
 * geodetic latitude/longitude are `lat0`/`lon0` (degrees). Rotation only — the classic
 * ENU rotation matrix applied to (p − p0).
 */
export function ecefToEnu(p: Ecef, p0: Ecef, lat0: number, lon0: number): Enu {
  const phi = lat0 * DEG;
  const lam = lon0 * DEG;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const sinLam = Math.sin(lam);
  const cosLam = Math.cos(lam);
  const dx = p.x - p0.x;
  const dy = p.y - p0.y;
  const dz = p.z - p0.z;
  return {
    e: -sinLam * dx + cosLam * dy,
    n: -sinPhi * cosLam * dx - sinPhi * sinLam * dy + cosPhi * dz,
    u: cosPhi * cosLam * dx + cosPhi * sinLam * dy + sinPhi * dz,
  };
}

/**
 * Local ENU offset (meters) -> ECEF point, the inverse rotation about `p0` (whose
 * geodetic origin is `lat0`/`lon0`). `u` defaults to 0 (points live on the anchor's
 * tangent plane).
 */
export function enuToEcef(enu: Enu, p0: Ecef, lat0: number, lon0: number): Ecef {
  const phi = lat0 * DEG;
  const lam = lon0 * DEG;
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const sinLam = Math.sin(lam);
  const cosLam = Math.cos(lam);
  const { e, n } = enu;
  const u = enu.u ?? 0;
  return {
    x: p0.x - sinLam * e - sinPhi * cosLam * n + cosPhi * cosLam * u,
    y: p0.y + cosLam * e - sinPhi * sinLam * n + cosPhi * sinLam * u,
    z: p0.z + cosPhi * n + sinPhi * u,
  };
}

/** Convert a lat/lon to a local ENU offset (meters) about the session anchor. */
export function enuFromLatLon(lat: number, lon: number, anchor: LatLon): Enu {
  const p0 = geodeticToEcef(anchor.lat, anchor.lon, 0);
  const p = geodeticToEcef(lat, lon, 0);
  return ecefToEnu(p, p0, anchor.lat, anchor.lon);
}

/** Convert a local ENU offset (meters) about the session anchor back to lat/lon. */
export function enuToLatLon(e: number, n: number, anchor: LatLon): LatLon {
  const p0 = geodeticToEcef(anchor.lat, anchor.lon, 0);
  const p = enuToEcef({ e, n }, p0, anchor.lat, anchor.lon);
  const g = ecefToGeodetic(p);
  return { lat: g.lat, lon: g.lon };
}

/**
 * Unit vector in the ENU plane for a true-north azimuth (degrees, clockwise): per
 * §1.1, d = (sin az, cos az) — East = sin, North = cos. az=0 -> due North (0,1),
 * az=90 -> due East (1,0).
 */
export function azToUnitEnu(azDeg: number): { e: number; n: number } {
  const a = azDeg * DEG;
  return { e: Math.sin(a), n: Math.cos(a) };
}

/**
 * A point a fixed ground distance (`meters`) out from `fromLatLon` along a true-north
 * azimuth, returned as lat/lon — used to draw a bearing ray of a set length. Computed
 * in the anchor's ENU frame so the ray stays metric and geo-anchored.
 */
export function projectAlong(
  anchor: LatLon,
  fromLatLon: LatLon,
  azDeg: number,
  meters: number,
): LatLon {
  const base = enuFromLatLon(fromLatLon.lat, fromLatLon.lon, anchor);
  const d = azToUnitEnu(azDeg);
  return enuToLatLon(base.e + d.e * meters, base.n + d.n * meters, anchor);
}
