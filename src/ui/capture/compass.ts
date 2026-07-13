// Compass bearing capture flow (V9 S4) — the caveated SECONDARY path.
//
// A ~2 s stability window collects device-orientation samples, reduces them to a circular
// mean + circular-SD σ, and (off iOS) applies the WMM2025 declination to convert magnetic→
// true, storing raw magnetic + declination + true SEPARATELY. Before the first compass use it
// shows a loud, informed-consent honesty banner (no accuracy status, no interference detection
// — prefer two-point GNSS). It rejects ill-conditioned tilt (|pitch| > 70°), and if the node
// already has a two-point GNSS bearing it cross-checks: a >15° delta flags the node (likely
// local interference) and the two-point value is kept for the record.

import type { Store } from "../../store";
import {
  reduceWindow,
  exceedsInterferenceDelta,
  pitchOutOfRange,
  orientationSupported,
  requestOrientationPermission,
  watchOrientation,
  type OrientationSample,
} from "../../sensors/compass";
import { declination, magneticToTrue, WMM_MODEL, WMM_MODEL_EPOCH } from "../../geo/wmm";
import { showToast } from "../toast";
import { openModal } from "../modal";

export interface CompassCapture {
  destroy(): void;
}

const WINDOW_MS = 2000;
const CONSENT_KEY = "bt-compass-consent";

/** Whether the honesty banner has already been acknowledged this device. */
function hasConsented(): boolean {
  try {
    return globalThis.localStorage?.getItem(CONSENT_KEY) === "1";
  } catch {
    return false;
  }
}
function setConsented(): void {
  try {
    globalThis.localStorage?.setItem(CONSENT_KEY, "1");
  } catch {
    /* private mode — banner shows every time, which is fine */
  }
}

/** The informed-consent honesty banner — shown before the first compass use. */
async function showBanner(): Promise<void> {
  await openModal<"ok">({
    title: "The in-browser compass is the lower-confidence path",
    message:
      "It has no accuracy status and can't detect magnetic interference (a nearby truck, tool, or magnetite soil). Prefer the two-point GNSS bearing for anything that matters. Full magnetic QC needs the native app.",
    buttons: [{ label: "I understand — use compass", value: "ok", variant: "primary" }],
    cancelValue: "ok",
  });
  setConsented();
}

/** Run the compass capture for a node; supersedes it with a MAGNETOMETER-method bearing. */
export function initCompassCapture(store: Store, nodeId: string, onDone?: () => void): CompassCapture {
  let stopped = false;
  let watch: { stop(): void } | null = null;

  function finish(): void {
    if (stopped) return;
    stopped = true;
    watch?.stop();
    onDone?.();
  }

  async function run(): Promise<void> {
    if (!orientationSupported()) {
      showToast("This device has no orientation sensor — use two-point GNSS.", "error");
      return finish();
    }
    if (!hasConsented()) await showBanner();
    const granted = await requestOrientationPermission();
    if (!granted) {
      showToast("Compass permission denied — use two-point GNSS.", "error");
      return finish();
    }

    // Collect a stability window.
    const headings: number[] = [];
    let lastPitch: number | null = null;
    let lastRoll: number | null = null;
    let trueNorth = false;
    watch = watchOrientation((s: OrientationSample) => {
      headings.push(s.headingDeg);
      lastPitch = s.pitchDeg;
      lastRoll = s.rollDeg;
      trueNorth = s.trueNorth;
    });
    showToast("Hold the device flat and steady…", "info");

    await new Promise((r) => setTimeout(r, WINDOW_MS));
    watch?.stop();
    watch = null;

    if (headings.length === 0) {
      showToast("No compass readings — the sensor may be blocked. Use two-point GNSS.", "error");
      return finish();
    }
    if (pitchOutOfRange(lastPitch)) {
      showToast("Device too tilted (|pitch| > 70°) — hold it flatter and retry.", "error");
      return finish();
    }

    const reduced = reduceWindow(headings);
    const node = store.getAll().find((n) => n.id === nodeId);

    // Convert magnetic→true where the platform reports magnetic; iOS is already true-north.
    let azimuthTrueDeg = reduced.azimuthDeg;
    let azimuthMagneticDeg: number | null = null;
    let declinationDeg: number | null = null;
    let magneticModel: string;
    let modelEpoch: number | null = null;
    if (trueNorth) {
      magneticModel = "PLATFORM_iOS"; // declination applied opaquely by the platform
    } else {
      azimuthMagneticDeg = reduced.azimuthDeg;
      const lat = node?.lat ?? store.getIncident().anchorLat ?? 0;
      const lon = node?.lon ?? store.getIncident().anchorLon ?? 0;
      declinationDeg = declination(lat, lon, node?.ellipsoidHeightM ?? 0, new Date()).declinationDeg;
      azimuthTrueDeg = magneticToTrue(azimuthMagneticDeg, declinationDeg);
      magneticModel = WMM_MODEL;
      modelEpoch = WMM_MODEL_EPOCH;
    }

    // Cross-check against an existing two-point bearing (kept the authoritative value).
    let conflictsCluster = node?.conflictsCluster ?? false;
    let note = `Compass bearing: circular σ ${Math.round(reduced.sigmaDeg)}° over ${reduced.sampleCount} samples${trueNorth ? " (iOS true-north)" : ` (magnetic + ${WMM_MODEL} declination)`}.`;
    if (node?.azimuthMethod === "TWO_POINT_GNSS" && node.azimuthTrueDeg != null) {
      if (exceedsInterferenceDelta(azimuthTrueDeg, node.azimuthTrueDeg)) {
        conflictsCluster = true;
        note += ` INTERFERENCE FLAG: compass ${Math.round(azimuthTrueDeg)}° vs two-point ${Math.round(node.azimuthTrueDeg)}° (>15° apart) — kept the two-point value.`;
        showToast("Compass disagrees with the two-point bearing by >15° — flagged as likely interference; kept two-point.", "error");
        // preserve the authoritative two-point bearing; only record the flag + the compass note
        store.supersede(nodeId, { conflictsCluster, notes: appendNote(store, nodeId, note) });
        return finish();
      }
    }

    store.supersede(nodeId, {
      azimuthTrueDeg,
      sigmaDeg: reduced.sigmaDeg, // feeds the posterior κ
      azimuthSigmaDeg: reduced.sigmaDeg,
      azimuthMethod: "MAGNETOMETER",
      azimuthMagneticDeg,
      declinationDeg,
      magneticModel,
      modelEpoch,
      pitchDeg: lastPitch,
      rollDeg: lastRoll,
      captureWindowMs: WINDOW_MS,
      sampleCount: reduced.sampleCount,
      conflictsCluster,
      notes: appendNote(store, nodeId, note),
    });
    showToast(`Compass bearing set: ${Math.round(azimuthTrueDeg)}° ± ${Math.round(reduced.sigmaDeg)}° (secondary path).`, "ok");
    finish();
  }

  void run();

  return {
    destroy() {
      finish();
    },
  };
}

/** Append a capture note to the node's existing notes without clobbering them. */
function appendNote(store: Store, nodeId: string, note: string): string {
  const n = store.getAll().find((x) => x.id === nodeId);
  const prev = n?.notes?.trim();
  return prev ? `${prev}\n${note}` : note;
}
