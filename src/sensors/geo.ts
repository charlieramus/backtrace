// Live geolocation capture (CRESEARCH.md §2.3b) — a thin, honest wrapper over the
// Geolocation API, plus a pure core the tests exercise without a browser.
//
// Field mode starts here: a node's POSITION comes from a real GPS fix, with its accuracy
// MEASURED (navigator reports ±metres), not guessed. The web Geolocation API does not
// expose DOP or satellite count, so those record fields stay null (never faked). An
// optional averaging pass takes several stationary fixes and returns a tighter position
// with a smaller reported accuracy (CRESEARCH.md §2.3b), the honest way to sharpen a fix
// while standing still.
//
// The DOM/permission-touching parts are the watch/one-shot wrappers at the bottom; the
// mapping (`readingFromPosition`) and averaging (`averageReadings`) are pure so the store
// and the tests can rely on them directly.

/** A typed, honest position reading. Fields the web API can't give us are null. */
export interface GeoReading {
  lat: number;
  lon: number;
  /** Ellipsoid height (m), or null when the device omits altitude. */
  altitude: number | null;
  /** Horizontal accuracy (m, 1σ-ish per the spec's "95% confidence" note). Always present. */
  hAccuracyM: number;
  /** Vertical accuracy (m), or null when altitude is unavailable. */
  vAccuracyM: number | null;
  /** Device wall-clock time of the fix (UTC ISO). */
  timestampUtc: string;
  /** How many raw fixes were folded into this reading (1 = a single fix). */
  sampleCount: number;
}

/** The subset of a browser GeolocationPosition the wrapper reads — so tests can mock it. */
export interface GeolocationPositionLike {
  coords: {
    latitude: number;
    longitude: number;
    altitude: number | null;
    accuracy: number;
    altitudeAccuracy: number | null;
  };
  timestamp: number;
}

/** The Geolocation API surface we use, narrowed so it can be dependency-injected in tests. */
export interface GeolocationLike {
  getCurrentPosition(
    success: (p: GeolocationPositionLike) => void,
    error: (e: { code: number; message: string }) => void,
    options?: PositionOptions,
  ): void;
  watchPosition(
    success: (p: GeolocationPositionLike) => void,
    error: (e: { code: number; message: string }) => void,
    options?: PositionOptions,
  ): number;
  clearWatch(id: number): void;
}

/** Map a raw GeolocationPosition to our typed reading (pure). DOP/satCount aren't exposed. */
export function readingFromPosition(p: GeolocationPositionLike): GeoReading {
  const c = p.coords;
  return {
    lat: c.latitude,
    lon: c.longitude,
    altitude: c.altitude ?? null,
    hAccuracyM: c.accuracy,
    vAccuracyM: c.altitudeAccuracy ?? null,
    timestampUtc: new Date(p.timestamp).toISOString(),
    sampleCount: 1,
  };
}

/**
 * Fold several stationary fixes into one tighter reading (CRESEARCH.md §2.3b). Position is
 * the accuracy-weighted mean; the combined horizontal accuracy shrinks with the count of
 * independent fixes (≈ mean accuracy / √N), which is why standing still and averaging pays
 * off. Altitude/vAccuracy average over the fixes that carry them. Never invents precision:
 * with one fix it returns that fix unchanged.
 */
export function averageReadings(readings: GeoReading[]): GeoReading {
  if (readings.length === 0) throw new Error("averageReadings: no readings");
  if (readings.length === 1) return readings[0];

  let wSum = 0;
  let latSum = 0;
  let lonSum = 0;
  let accSum = 0;
  let altSum = 0;
  let altN = 0;
  let vAccSum = 0;
  let vAccN = 0;
  let lastTs = 0;
  for (const r of readings) {
    const w = 1 / Math.max(1e-6, r.hAccuracyM * r.hAccuracyM); // inverse-variance weight
    wSum += w;
    latSum += r.lat * w;
    lonSum += r.lon * w;
    accSum += r.hAccuracyM;
    if (r.altitude != null) {
      altSum += r.altitude;
      altN++;
    }
    if (r.vAccuracyM != null) {
      vAccSum += r.vAccuracyM;
      vAccN++;
    }
    lastTs = Math.max(lastTs, new Date(r.timestampUtc).getTime());
  }
  const meanAcc = accSum / readings.length;
  return {
    lat: latSum / wSum,
    lon: lonSum / wSum,
    altitude: altN > 0 ? altSum / altN : null,
    // √N tightening from N independent stationary fixes, floored at 1 m of honesty.
    hAccuracyM: Math.max(1, meanAcc / Math.sqrt(readings.length)),
    vAccuracyM: vAccN > 0 ? vAccSum / vAccN : null,
    timestampUtc: new Date(lastTs).toISOString(),
    sampleCount: readings.length,
  };
}

/** Availability of live geolocation, reported honestly (never spun forever). */
export type GeoAvailability = "available" | "unavailable" | "denied";

function nav(): GeolocationLike | null {
  const n = (globalThis as { navigator?: { geolocation?: GeolocationLike } }).navigator;
  return n?.geolocation ?? null;
}

/** True when the platform exposes a Geolocation API at all. */
export function geolocationSupported(geo: GeolocationLike | null = nav()): boolean {
  return geo != null && typeof geo.getCurrentPosition === "function";
}

/** One live fix as a Promise. Rejects with an honest reason (denied / unavailable / timeout). */
export function getCurrentReading(
  options: PositionOptions = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
  geo: GeolocationLike | null = nav(),
): Promise<GeoReading> {
  return new Promise((resolve, reject) => {
    if (!geolocationSupported(geo)) {
      reject(new Error("Geolocation isn't available on this device."));
      return;
    }
    geo!.getCurrentPosition(
      (p) => resolve(readingFromPosition(p)),
      (e) => reject(geoError(e)),
      options,
    );
  });
}

/** PositionError.code 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT. */
function geoError(e: { code: number; message: string }): Error {
  if (e.code === 1) return Object.assign(new Error("Location permission denied."), { availability: "denied" });
  if (e.code === 2) return Object.assign(new Error("Location is unavailable right now."), { availability: "unavailable" });
  if (e.code === 3) return new Error("Timed out getting a location fix.");
  return new Error(e.message || "Location error.");
}

/** A live watch handle — call stop() to release the underlying watchPosition. */
export interface GeoWatch {
  stop(): void;
}

/**
 * Watch the live fix, delivering each reading to `onReading` (and any error to `onError`).
 * Reflects real permission/availability state — an error is surfaced once, honestly, and
 * the caller decides what to render; nothing blocks on the network. Returns a stop handle.
 */
export function watchReadings(
  onReading: (r: GeoReading) => void,
  onError: (e: Error) => void,
  options: PositionOptions = { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
  geo: GeolocationLike | null = nav(),
): GeoWatch {
  if (!geolocationSupported(geo)) {
    onError(new Error("Geolocation isn't available on this device."));
    return { stop() {} };
  }
  const id = geo!.watchPosition(
    (p) => onReading(readingFromPosition(p)),
    (e) => onError(geoError(e)),
    options,
  );
  return {
    stop() {
      geo!.clearWatch(id);
    },
  };
}

/**
 * Collect up to `count` stationary fixes over the live watch, then resolve with the
 * averaged reading (CRESEARCH.md §2.3b). Resolves early with what it has if the caller
 * aborts; rejects only if the very first fix errors (so a transient later error still
 * yields a usable average). Pure of any UI.
 */
export function averageCurrentReading(
  count = 5,
  options?: PositionOptions,
  geo: GeolocationLike | null = nav(),
): { promise: Promise<GeoReading>; cancel(): void } {
  const collected: GeoReading[] = [];
  let watch: GeoWatch | null = null;
  let settle: ((r: GeoReading) => void) | null = null;
  let fail: ((e: Error) => void) | null = null;

  const promise = new Promise<GeoReading>((resolve, reject) => {
    settle = resolve;
    fail = reject;
    watch = watchReadings(
      (r) => {
        collected.push(r);
        if (collected.length >= count) {
          watch?.stop();
          resolve(averageReadings(collected));
        }
      },
      (e) => {
        if (collected.length === 0) {
          watch?.stop();
          reject(e);
        }
        // else: keep whatever we've gathered; a later cancel/completion averages them
      },
      options,
      geo,
    );
  });

  return {
    promise,
    cancel() {
      watch?.stop();
      if (collected.length > 0) settle?.(averageReadings(collected));
      else fail?.(new Error("Cancelled before any fix."));
    },
  };
}
