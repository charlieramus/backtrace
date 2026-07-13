// WMM2025 magnetic declination, computed on-device (CRESEARCH.md §2.4) — the offline
// magnetic→true converter. Pure, no DOM/network.
//
// Field mode reads a MAGNETIC bearing (device compass) or works in true-north (two-point
// GNSS). To convert magnetic→true, and to DISPLAY the applied correction for defensibility,
// we need declination for the node's location + observation date. This evaluates the bundled
// official NOAA WMM2025 coefficients (src/geo/wmm2025cof.ts) with the standard DoD WMM
// spherical-harmonic algorithm (degree/order 12, Schmidt semi-normalized, with secular
// variation to the decimal year). No runtime network — the coefficients ship in the bundle.
//
// The algorithm is the published WMM/geomag reference (NOAA Satellite & Information Service);
// this port reproduces the NOAA calculator to <0.001° at test points (see wmm.test.ts).
//
// NOTE: WMM models the Earth's MAIN (core) field only. Local crustal anomalies of 3–4°
// (occasionally >10° over magnetite-bearing ground) are NOT captured here — they're budgeted
// as a separate sigmaDeclination in the field-capture uncertainty, and are exactly why the
// two-point GNSS bearing (magnetometer-free) is the primary path.

import { WMM2025_COF } from "./wmm2025cof";

const D2R = Math.PI / 180;
const MAXORD = 12;

// WGS84-ish ellipsoid + geomagnetic reference radius (km), per the WMM reference.
const A = 6378.137;
const B = 6356.7523142;
const RE = 6371.2;
const A2 = A * A;
const B2 = B * B;
const C2 = A2 - B2;
const A4 = A2 * A2;
const B4 = B2 * B2;
const C4 = A4 - B4;

/** Declination + the companion field values the capture UI + record use. Angles in degrees. */
export interface MagneticField {
  /** Magnetic declination (deg), east positive — the magnetic→true correction. */
  declinationDeg: number;
  /** Magnetic inclination / dip (deg), down positive. */
  inclinationDeg: number;
  /** Total field intensity (µT). */
  totalFieldUt: number;
  /** Horizontal field intensity (µT). */
  horizontalUt: number;
}

// --- one-time coefficient prep (Schmidt → unnormalized Gauss, per the WMM reference) ------

interface Prepared {
  epoch: number;
  c: number[][];
  cd: number[][];
  k: number[][];
}

function zero(): number[] {
  return new Array<number>(MAXORD + 1).fill(0);
}
function grid(): number[][] {
  return Array.from({ length: MAXORD + 1 }, zero);
}

function prepare(cofText: string): Prepared {
  const lines = cofText.split("\n").filter((l) => l.trim().length > 0);
  const epoch = parseFloat(lines[0].trim().split(/\s+/)[0]);
  const c = grid();
  const cd = grid();
  const k = grid();
  const snorm = grid();

  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].trim().split(/\s+/).map(Number);
    const n = p[0];
    const m = p[1];
    if (m > n || n > MAXORD) continue;
    c[m][n] = p[2]; // g
    cd[m][n] = p[4]; // dg/dt
    if (m !== 0) {
      c[n][m - 1] = p[3]; // h
      cd[n][m - 1] = p[5]; // dh/dt
    }
  }

  // Convert Schmidt semi-normalized coefficients to unnormalized (once).
  snorm[0][0] = 1;
  for (let n = 1; n <= MAXORD; n++) {
    snorm[0][n] = (snorm[0][n - 1] * (2 * n - 1)) / n;
    let j = 2;
    for (let m = 0, D2 = n - m + 1; D2 > 0; D2--, m++) {
      k[m][n] = ((n - 1) * (n - 1) - m * m) / ((2 * n - 1) * (2 * n - 3));
      if (m > 0) {
        const flnmj = ((n - m + 1) * j) / (n + m);
        snorm[m][n] = snorm[m - 1][n] * Math.sqrt(flnmj);
        j = 1;
        c[n][m - 1] *= snorm[m][n];
        cd[n][m - 1] *= snorm[m][n];
      }
      c[m][n] *= snorm[m][n];
      cd[m][n] *= snorm[m][n];
    }
  }
  k[1][1] = 0;
  return { epoch, c, cd, k };
}

const MODEL = prepare(WMM2025_COF);

/** The epoch year of the bundled model (2025.0) and its identifier — shown for defensibility. */
export const WMM_MODEL = "WMM2025";
export const WMM_MODEL_EPOCH = MODEL.epoch;

/** Fractional (decimal) year from a Date, UTC — the time the secular variation is applied at. */
export function decimalYear(date: Date): number {
  const year = date.getUTCFullYear();
  const leap = (year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0)) ? 1 : 0;
  const msInYear = (365 + leap) * 24 * 60 * 60 * 1000;
  return year + (date.getTime() - Date.UTC(year, 0, 1)) / msInYear;
}

const FN = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
const FM = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/**
 * Full geomagnetic field at a geodetic point + time via the WMM2025 spherical-harmonic
 * expansion. `altM` = ellipsoid height in metres; `time` = a Date or a decimal year.
 */
export function magneticField(
  lat: number,
  lon: number,
  altM = 0,
  time: Date | number = new Date(),
): MagneticField {
  const t = typeof time === "number" ? time : decimalYear(time);
  const dt = t - MODEL.epoch;
  const altKm = altM / 1000;
  const { c, cd, k } = MODEL;

  const p = grid();
  const dp = grid();
  const tc = grid();
  const sp = zero();
  const cp = zero();
  const pp = zero();
  p[0][0] = 1;
  pp[0] = 1;
  cp[0] = 1;

  const rlat = lat * D2R;
  const rlon = lon * D2R;
  const srlon = Math.sin(rlon);
  const srlat = Math.sin(rlat);
  const crlon = Math.cos(rlon);
  const crlat = Math.cos(rlat);
  const srlat2 = srlat * srlat;
  const crlat2 = crlat * crlat;
  sp[1] = srlon;
  cp[1] = crlon;

  // Geodetic → geocentric spherical.
  const q = Math.sqrt(A2 - C2 * srlat2);
  const q1 = altKm * q;
  const q2 = ((q1 + A2) / (q1 + B2)) ** 2;
  const ct = srlat / Math.sqrt(q2 * crlat2 + srlat2);
  const st = Math.sqrt(1 - ct * ct);
  const r = Math.sqrt(altKm * altKm + 2 * q1 + (A4 - C4 * srlat2) / (q * q));
  const d = Math.sqrt(A2 * crlat2 + B2 * srlat2);
  const ca = (altKm + d) / r;
  const sa = (C2 * crlat * srlat) / (r * d);

  for (let m = 2; m <= MAXORD; m++) {
    sp[m] = sp[1] * cp[m - 1] + cp[1] * sp[m - 1];
    cp[m] = cp[1] * cp[m - 1] - sp[1] * sp[m - 1];
  }

  const aor = RE / r;
  let ar = aor * aor;
  let br = 0;
  let bt = 0;
  let bp = 0;
  let bpp = 0;

  for (let n = 1; n <= MAXORD; n++) {
    ar *= aor;
    for (let m = 0, D4 = n + m + 1; D4 > 0; D4--, m++) {
      // Unnormalized associated Legendre polynomials + derivatives via recursion.
      if (n === m) {
        p[m][n] = st * p[m - 1][n - 1];
        dp[m][n] = st * dp[m - 1][n - 1] + ct * p[m - 1][n - 1];
      } else if (n === 1 && m === 0) {
        p[m][n] = ct * p[m][n - 1];
        dp[m][n] = ct * dp[m][n - 1] - st * p[m][n - 1];
      } else if (n > 1 && n !== m) {
        if (m > n - 2) {
          p[m][n - 2] = 0;
          dp[m][n - 2] = 0;
        }
        p[m][n] = ct * p[m][n - 1] - k[m][n] * p[m][n - 2];
        dp[m][n] = ct * dp[m][n - 1] - st * p[m][n - 1] - k[m][n] * dp[m][n - 2];
      }

      // Secular-variation-adjusted Gauss coefficients at the observation date.
      tc[m][n] = c[m][n] + dt * cd[m][n];
      if (m !== 0) tc[n][m - 1] = c[n][m - 1] + dt * cd[n][m - 1];

      const par = ar * p[m][n];
      let temp1: number;
      let temp2: number;
      if (m === 0) {
        temp1 = tc[m][n] * cp[m];
        temp2 = tc[m][n] * sp[m];
      } else {
        temp1 = tc[m][n] * cp[m] + tc[n][m - 1] * sp[m];
        temp2 = tc[m][n] * sp[m] - tc[n][m - 1] * cp[m];
      }
      bt -= ar * temp1 * dp[m][n];
      bp += FM[m] * temp2 * par;
      br += FN[n] * temp1 * par;

      // Geographic-pole special case (st === 0).
      if (st === 0 && m === 1) {
        pp[n] = n === 1 ? pp[n - 1] : ct * pp[n - 1] - k[m][n] * pp[n - 2];
        bpp += FM[m] * temp2 * ar * pp[n];
      }
    }
  }

  bp = st === 0 ? bpp : bp / st;

  // Spherical → geodetic field components (nT).
  const bx = -bt * ca - br * sa;
  const by = bp;
  const bz = bt * sa - br * ca;
  const bh = Math.hypot(bx, by);
  const ti = Math.hypot(bh, bz);

  return {
    declinationDeg: Math.atan2(by, bx) / D2R,
    inclinationDeg: Math.atan2(bz, bh) / D2R,
    totalFieldUt: ti / 1000, // nT → µT
    horizontalUt: bh / 1000,
  };
}

/**
 * Magnetic declination (deg, east positive) at a geodetic point + time — the number the
 * capture UI displays and stores to convert a magnetic bearing to true north. Uses the
 * OBSERVATION date when the caller supplies one (CRESEARCH.md §2.4), not necessarily now.
 */
export function declination(lat: number, lon: number, altM = 0, time: Date | number = new Date()): MagneticField {
  return magneticField(lat, lon, altM, time);
}

/** Convert a magnetic azimuth to true north with a declination (both degrees). */
export function magneticToTrue(azimuthMagneticDeg: number, declinationDeg: number): number {
  return ((azimuthMagneticDeg + declinationDeg) % 360 + 360) % 360;
}
