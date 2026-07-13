// Two-point GNSS bearing (CRESEARCH.md §2.3b) — the magnetometer-free, high-confidence
// bearing the app nudges investigators toward. Pure, no DOM.
//
// Stand at the indicator → take fix A → walk 15–30 m in the indicated direction → take
// fix B → the azimuth A→B is the bearing. It is immune to every magnetometer failure mode
// (hard/soft iron, tilt, local anomalies), which is why it's the PRIMARY path; the device
// compass (Stage 4) is only a caveated secondary.
//
// Geometry: at field scale a plane azimuth in the anchor's ENU tangent frame (reuse
// src/geo/enu.ts) equals the geodesic azimuth to <0.01°, so we use ENU; for very long
// baselines one could swap in a GeographicLib inverse. Uncertainty propagation: the two
// endpoint fixes each carry a horizontal accuracy, and a shorter baseline makes the same
// positional error subtend a larger angle — so sigmaAz ≈ atan(effAcc·√2 / baseline), which
// gives ~12° for a 20 m baseline with ~3 m fixes. Averaging stationary fixes at each end
// shrinks effAcc and tightens the bearing.

import type { LatLon } from "./enu";
import { enuFromLatLon } from "./enu";

const DEG = Math.PI / 180;

/** An endpoint fix: a position plus its horizontal accuracy (m). */
export interface FixPoint {
  lat: number;
  lon: number;
  hAccuracyM: number;
}

export interface TwoPointBearing {
  /** True-north azimuth A→B (deg, 0–360). */
  azimuthTrueDeg: number;
  /** Propagated 1σ angular uncertainty (deg). */
  sigmaDeg: number;
  /** Baseline length A→B (m). */
  baselineM: number;
  /** The effective per-endpoint horizontal accuracy used (m) — RMS of the two fixes. */
  effAccuracyM: number;
  /** True when the baseline is below the safe minimum (σ explodes — reject on commit). */
  belowMinBaseline: boolean;
}

export interface TwoPointOpts {
  /** Minimum safe baseline (m). Below this the bearing σ explodes; default 5 m. */
  minBaselineM?: number;
  /** ENU anchor. Defaults to fix A (so the frame is centered on the indicator). */
  anchor?: LatLon;
}

/**
 * Azimuth + propagated σ for a two-point GNSS bearing from A (at the indicator) to B (down
 * the indicated direction). Computed in the anchor's ENU plane; σ propagated from the
 * endpoint accuracies + baseline.
 */
export function twoPointBearing(a: FixPoint, b: FixPoint, opts: TwoPointOpts = {}): TwoPointBearing {
  const minBaselineM = opts.minBaselineM ?? 5;
  const anchor = opts.anchor ?? { lat: a.lat, lon: a.lon };

  const ea = enuFromLatLon(a.lat, a.lon, anchor);
  const eb = enuFromLatLon(b.lat, b.lon, anchor);
  const de = eb.e - ea.e;
  const dn = eb.n - ea.n;
  const baselineM = Math.hypot(de, dn);

  // Azimuth from the ENU convention d = (sin az, cos az): az = atan2(E, N).
  const azimuthTrueDeg = (((Math.atan2(de, dn) / DEG) % 360) + 360) % 360;

  // Effective endpoint accuracy = RMS of the two fixes (√2 in the formula covers both ends).
  const effAccuracyM = Math.sqrt((a.hAccuracyM * a.hAccuracyM + b.hAccuracyM * b.hAccuracyM) / 2);
  const safeBaseline = Math.max(baselineM, 1e-6);
  const sigmaDeg = Math.atan((effAccuracyM * Math.SQRT2) / safeBaseline) / DEG;

  return {
    azimuthTrueDeg,
    sigmaDeg,
    baselineM,
    effAccuracyM,
    belowMinBaseline: baselineM < minBaselineM,
  };
}

/**
 * Ellipsoidal geodesic forward azimuth A→B (deg, 0–360) via the Vincenty inverse solution on
 * WGS84 — the "GeographicLib-style" reference the ENU-plane azimuth is checked against. At
 * field scale the two agree to <0.01°, which is why ENU is used in the capture path; this is
 * only the cross-check. Not used in the live flow.
 */
export function geodesicAzimuthDeg(a: LatLon, b: LatLon): number {
  const f = 1 / 298.257223563;
  const φ1 = a.lat * DEG;
  const φ2 = b.lat * DEG;
  const L = (b.lon - a.lon) * DEG;
  const U1 = Math.atan((1 - f) * Math.tan(φ1));
  const U2 = Math.atan((1 - f) * Math.tan(φ2));
  const sinU1 = Math.sin(U1);
  const cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2);
  const cosU2 = Math.cos(U2);

  let λ = L;
  let sinσ = 0;
  let cosσ = 1;
  let cosSqα = 1;
  let cos2σm = 0;
  for (let i = 0; i < 100; i++) {
    const sinλ = Math.sin(λ);
    const cosλ = Math.cos(λ);
    sinσ = Math.hypot(cosU2 * sinλ, cosU1 * sinU2 - sinU1 * cosU2 * cosλ);
    if (sinσ === 0) return 0; // coincident points
    cosσ = sinU1 * sinU2 + cosU1 * cosU2 * cosλ;
    const σ = Math.atan2(sinσ, cosσ);
    const sinα = (cosU1 * cosU2 * sinλ) / sinσ;
    cosSqα = 1 - sinα * sinα;
    cos2σm = cosSqα !== 0 ? cosσ - (2 * sinU1 * sinU2) / cosSqα : 0;
    const C = (f / 16) * cosSqα * (4 + f * (4 - 3 * cosSqα));
    const λPrev = λ;
    λ =
      L +
      (1 - C) *
        f *
        sinα *
        (σ + C * sinσ * (cos2σm + C * cosσ * (-1 + 2 * cos2σm * cos2σm)));
    if (Math.abs(λ - λPrev) < 1e-12) break;
  }
  const α1 = Math.atan2(cosU2 * Math.sin(λ), cosU1 * sinU2 - sinU1 * cosU2 * Math.cos(λ));
  return (((α1 / DEG) % 360) + 360) % 360;
}
