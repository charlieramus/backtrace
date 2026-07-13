// Device-orientation compass (V9 S4) — a fast SECONDARY bearing, honestly labelled as the
// lower-confidence path. Pure circular-statistics core + an injectable orientation subscription.
//
// The web platform can't do magnetic QC: a PWA cannot read magnetometer accuracy status,
// uncalibrated hard-iron bias, or raw field magnitude, so this path has NO anomaly detection
// and NO accuracy gate (disclosed in the UI banner). It is offered because it's fast, but the
// two-point GNSS bearing (Stage 3) is the path that matters. Over a ~2 s stability window we
// collect heading samples and reduce them to a circular mean + circular SD (CRESEARCH.md
// §2.3a) → azimuthTrue + azimuthSigmaDeg.
//
// Platform handling:
//  • iOS `webkitCompassHeading` is already TRUE north (the platform applies declination
//    opaquely) → record magneticModel 'PLATFORM_iOS', leave the raw magnetic null.
//  • elsewhere `deviceorientationabsolute` is treated as MAGNETIC + unreliable → apply the
//    Stage 2 WMM declination, storing raw magnetic + declination + true separately.

const DEG = Math.PI / 180;

/** Shortest signed angular difference a→b in degrees, in (−180, 180]. */
export function angleDeltaDeg(a: number, b: number): number {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/** Circular mean of a set of headings (deg, 0–360). */
export function circularMeanDeg(anglesDeg: number[]): number {
  let sx = 0;
  let sy = 0;
  for (const a of anglesDeg) {
    sx += Math.cos(a * DEG);
    sy += Math.sin(a * DEG);
  }
  const mean = Math.atan2(sy, sx) / DEG;
  return ((mean % 360) + 360) % 360;
}

/**
 * Mean resultant length R ∈ [0,1] of a set of headings: 1 = perfectly agreed, 0 = uniform.
 * The circular SD is derived from it.
 */
export function meanResultantLength(anglesDeg: number[]): number {
  if (anglesDeg.length === 0) return 0;
  let sx = 0;
  let sy = 0;
  for (const a of anglesDeg) {
    sx += Math.cos(a * DEG);
    sy += Math.sin(a * DEG);
  }
  return Math.hypot(sx, sy) / anglesDeg.length;
}

/** Circular standard deviation (deg): s = sqrt(−2 ln R), the CRESEARCH §2.3a spread. */
export function circularSdDeg(anglesDeg: number[]): number {
  const R = meanResultantLength(anglesDeg);
  if (R <= 0) return 180; // fully dispersed
  if (R >= 1) return 0;
  return Math.sqrt(-2 * Math.log(R)) / DEG;
}

/** The reduced reading from a stability window. */
export interface CompassReading {
  azimuthDeg: number;
  sigmaDeg: number;
  sampleCount: number;
}

/** Reduce a window of heading samples to a mean + circular-SD reading. */
export function reduceWindow(anglesDeg: number[]): CompassReading {
  return {
    azimuthDeg: circularMeanDeg(anglesDeg),
    sigmaDeg: circularSdDeg(anglesDeg),
    sampleCount: anglesDeg.length,
  };
}

/**
 * A >threshold° disagreement between a compass bearing and a two-point GNSS bearing at the
 * same node signals likely local magnetic interference (CRESEARCH.md §2.3b). Returns true when
 * the node should be flagged loudly; the two-point value is preferred for the record.
 */
export function exceedsInterferenceDelta(
  compassAzDeg: number,
  twoPointAzDeg: number,
  thresholdDeg = 15,
): boolean {
  return Math.abs(angleDeltaDeg(compassAzDeg, twoPointAzDeg)) > thresholdDeg;
}

// --- orientation subscription (browser side; injectable for tests) ----------

/** One raw orientation sample: a heading + optional tilt, and whether it's already true-north. */
export interface OrientationSample {
  headingDeg: number;
  /** True on iOS (webkitCompassHeading is true-north); false = treat as magnetic. */
  trueNorth: boolean;
  pitchDeg: number | null;
  rollDeg: number | null;
}

/** The DeviceOrientation surface we read, narrowed so a test can feed samples directly. */
export interface OrientationEventLike {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  webkitCompassHeading?: number;
  absolute?: boolean;
}

/** Map a raw DeviceOrientationEvent to our sample (pure). Returns null if it carries no heading. */
export function sampleFromEvent(e: OrientationEventLike): OrientationSample | null {
  // iOS: webkitCompassHeading is degrees clockwise from true north.
  if (typeof e.webkitCompassHeading === "number" && Number.isFinite(e.webkitCompassHeading)) {
    return { headingDeg: e.webkitCompassHeading, trueNorth: true, pitchDeg: e.beta, rollDeg: e.gamma };
  }
  // Others: alpha is degrees counter-clockwise from a reference; absolute alpha ≈ compass
  // heading = 360 − alpha. Treat as magnetic + unreliable.
  if (typeof e.alpha === "number" && Number.isFinite(e.alpha)) {
    const heading = ((360 - e.alpha) % 360 + 360) % 360;
    return { headingDeg: heading, trueNorth: false, pitchDeg: e.beta, rollDeg: e.gamma };
  }
  return null;
}

/** Ill-conditioned tilt: |pitch| > 70° makes the heading unreliable (CRESEARCH §2.5). */
export function pitchOutOfRange(pitchDeg: number | null, maxDeg = 70): boolean {
  return pitchDeg != null && Math.abs(pitchDeg) > maxDeg;
}

/** True if the platform exposes device orientation at all. */
export function orientationSupported(): boolean {
  return typeof globalThis !== "undefined" && "DeviceOrientationEvent" in globalThis;
}

interface DeviceOrientationEventCtorLike {
  requestPermission?: () => Promise<"granted" | "denied">;
}

/**
 * Request the iOS motion/orientation permission (a user-gesture requirement). Resolves true
 * on platforms that don't gate it. Must be called from a click handler on iOS.
 */
export async function requestOrientationPermission(): Promise<boolean> {
  const Ctor = (globalThis as { DeviceOrientationEvent?: DeviceOrientationEventCtorLike }).DeviceOrientationEvent;
  if (Ctor && typeof Ctor.requestPermission === "function") {
    try {
      return (await Ctor.requestPermission()) === "granted";
    } catch {
      return false;
    }
  }
  return true; // non-iOS: no gesture gate
}

export interface OrientationWatch {
  stop(): void;
}

/**
 * Subscribe to device orientation, delivering each mapped sample to `onSample`. Prefers the
 * absolute event (`deviceorientationabsolute`) where present, falling back to plain
 * `deviceorientation`. Returns a stop handle. Browser-only; harmless no-op elsewhere.
 */
export function watchOrientation(onSample: (s: OrientationSample) => void): OrientationWatch {
  const target = globalThis as unknown as {
    addEventListener?: (t: string, h: (e: OrientationEventLike) => void) => void;
    removeEventListener?: (t: string, h: (e: OrientationEventLike) => void) => void;
  };
  if (!target.addEventListener) return { stop() {} };
  const type = "ondeviceorientationabsolute" in globalThis ? "deviceorientationabsolute" : "deviceorientation";
  const handler = (e: OrientationEventLike): void => {
    const s = sampleFromEvent(e);
    if (s) onSample(s);
  };
  target.addEventListener(type, handler);
  return {
    stop() {
      target.removeEventListener?.(type, handler);
    },
  };
}
