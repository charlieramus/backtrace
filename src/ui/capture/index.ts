// Field capture (V9) — capturing a node from where you STAND in the burn.
//
// A frosted capture panel (token-styled, big tap targets, single-handed) that, from the
// live GPS fix, creates a court-grade node with DEVICE/GNSS position provenance (V9 S1).
// Its bearing is set afterwards by the recommended two-point GNSS path (V9 S3), a caveated
// device compass (V9 S4), or the manual dial — assembled into a method chooser in V9 S5.
// Every capture writes to the append-only store immediately (V6), so nothing is lost if
// the app is killed mid-capture.
//
// This file grows across the V9 stages: S1 wires live position + node creation; S3/S4 add
// the bearing methods; S5 assembles the method chooser. The live-position map layer + pure
// sensor cores live in src/map/livePosition.ts and src/sensors/*.

import type L from "leaflet";
import type { Store } from "../../store";
import { getCurrentReading, averageCurrentReading, type GeoReading } from "../../sensors/geo";
import { initLivePosition, type LivePosition } from "../../map/livePosition";
import { currentDeviceInfo } from "./deviceInfo";
import { declination, WMM_MODEL } from "../../geo/wmm";
import { initTwoPointCapture, type TwoPointCapture } from "./twoPoint";
import { initCompassCapture, type CompassCapture } from "./compass";
import { showToast } from "../toast";

export interface Capture {
  destroy(): void;
}

/** Availability/permission state the panel reflects honestly (never a fake spinner). */
type LiveState =
  | { kind: "idle" }
  | { kind: "live"; reading: GeoReading }
  | { kind: "error"; message: string };

/** Wire the field-capture panel + its toolbar toggle + the live-position map layer. */
export function initCapture(map: L.Map, store: Store): Capture {
  // --- toolbar toggle (injected so index.html stays the mockup) ---------------
  const toolbar = document.querySelector(".toolbar");
  const btn = document.createElement("button");
  btn.className = "tbtn";
  btn.id = "captureBtn";
  btn.setAttribute("aria-haspopup", "dialog");
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>
    Field`;
  const addBtn = toolbar?.querySelector(".tbtn.primary");
  if (addBtn && addBtn.nextSibling) toolbar!.insertBefore(btn, addBtn.nextSibling);
  else toolbar?.appendChild(btn);

  // --- panel ------------------------------------------------------------------
  const panel = document.createElement("div");
  panel.className = "bt-capture frost";
  panel.hidden = true;
  document.body.appendChild(panel);

  let live: LivePosition | null = null;
  let liveState: LiveState = { kind: "idle" };
  let busy = false;
  /** Id of the node this capture session created (bearing methods supersede it). */
  let sessionNodeId: string | null = null;
  let twoPoint: TwoPointCapture | null = null;
  let compass: CompassCapture | null = null;

  function fmtAcc(m: number): string {
    return m >= 100 ? `±${Math.round(m / 10) * 10} m` : `±${Math.round(m)} m`;
  }

  function positionBlock(): string {
    if (liveState.kind === "error") {
      return `<div class="cap-state err">${liveState.message}</div>
        <div class="cap-hint">Position is required before capturing. Enable location and reopen field capture.</div>`;
    }
    if (liveState.kind === "live") {
      const r = liveState.reading;
      const src = r.sampleCount > 1 ? `${r.sampleCount} fixes averaged` : "single fix";
      // Declination for this location + date (WMM2025), shown so the investigator sees the
      // magnetic→true correction that will be applied to any magnetic (compass) bearing.
      const dec = declination(r.lat, r.lon, r.altitude ?? 0, new Date(r.timestampUtc)).declinationDeg;
      const decSign = dec >= 0 ? "E" : "W";
      return `<div class="cap-fix">
          <div class="cap-fix-acc num">${fmtAcc(r.hAccuracyM)}</div>
          <div class="cap-fix-sub">live GPS · ${src}</div>
        </div>
        <div class="cap-hint">Declination <span class="num">${Math.abs(dec).toFixed(1)}° ${decSign}</span> · ${WMM_MODEL} — applied to any magnetic bearing.</div>`;
    }
    return `<div class="cap-state">Acquiring a GPS fix…</div>`;
  }

  function bearingBlock(): string {
    if (!sessionNodeId) {
      return `<div class="cap-hint">Capture a position first — its bearing is set next (two-point GNSS, compass, or the manual dial).</div>`;
    }
    const node = store.getAll().find((n) => n.id === sessionNodeId);
    const az = node?.azimuthTrueDeg;
    const state =
      az != null
        ? `<div class="cap-bearing-state ok">Bearing <span class="num">${Math.round(az)}°</span>${
            node?.azimuthSigmaDeg != null ? ` · σ <span class="num">${Math.round(node.azimuthSigmaDeg)}°</span>` : ""
          } · ${methodLabel(node?.azimuthMethod)}</div>`
        : `<div class="cap-bearing-state">No bearing yet — this node is a position only.</div>`;
    return `${state}
      <div class="cap-methods">
        <button class="cap-mbtn primary" data-method="two-point">
          <b>Two-point GNSS</b><small>Recommended · magnetometer-free</small>
        </button>
        <button class="cap-mbtn" data-method="compass">
          <b>Compass</b><small>Fast · lower confidence (caveated)</small>
        </button>
        <button class="cap-mbtn" data-method="manual">
          <b>Manual dial</b><small>Set it on the panel's compass ring</small>
        </button>
      </div>`;
  }

  function methodLabel(m: string | null | undefined): string {
    if (m === "TWO_POINT_GNSS") return "two-point GNSS";
    if (m === "MAGNETOMETER") return "compass";
    return "manual";
  }

  function render(): void {
    panel.innerHTML = `
      <div class="cap-head">
        <div class="eyebrow">Field capture</div>
        <button class="cap-x" aria-label="Close field capture">✕</button>
      </div>
      <div class="cap-sec">
        <div class="cap-sec-lab">1 · Position (live GPS)</div>
        ${positionBlock()}
        <button class="cap-primary" ${liveState.kind === "live" && !busy ? "" : "disabled"} data-act="capture-here">
          ${sessionNodeId ? "Re-capture position here" : "Capture node here"}
        </button>
      </div>
      <div class="cap-sec">
        <div class="cap-sec-lab">2 · Bearing</div>
        ${bearingBlock()}
      </div>
      <div class="cap-foot">Every capture is saved immediately — killing the app loses nothing.</div>`;
  }

  // --- capture a node at the live fix (S1) -----------------------------------
  async function captureHere(): Promise<void> {
    if (busy || liveState.kind !== "live") return;
    busy = true;
    render();
    try {
      // Average a short burst of stationary fixes for a tighter, honest position.
      const avg = averageCurrentReading(5);
      const reading = await avg.promise.catch(() => getCurrentReading());
      const dev = currentDeviceInfo();
      const node = store.add({
        lat: reading.lat,
        lon: reading.lon,
        indicatorCode: store.getArmedIndicator(),
        positionSource: "DEVICE",
        fixType: "GNSS",
        hAccuracyM: reading.hAccuracyM,
        vAccuracyM: reading.vAccuracyM,
        ellipsoidHeightM: reading.altitude,
        sampleCount: reading.sampleCount,
        deviceModel: dev.deviceModel,
        osVersion: dev.osVersion,
        appVersion: dev.appVersion,
        createdAtUtc: reading.timestampUtc,
        // DOP/satCount aren't exposed by the web API — leave them null (not faked).
        hdop: null,
        pdop: null,
        satCount: null,
      });
      const inc = store.getIncident();
      if (inc.anchorLat == null || inc.anchorLon == null) store.setAnchor(node.lat, node.lon);
      sessionNodeId = node.id;
      store.select(node.id);
      showToast(`Node captured at the live fix (${fmtAcc(reading.hAccuracyM)}, DEVICE/GNSS).`, "ok");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Capture failed.", "error");
    } finally {
      busy = false;
      render();
    }
  }

  function chooseMethod(method: string): void {
    if (!sessionNodeId) return;
    if (method === "two-point") {
      twoPoint?.destroy();
      twoPoint = initTwoPointCapture(store, sessionNodeId, () => {
        twoPoint = null;
        render();
      });
    } else if (method === "compass") {
      compass?.destroy();
      compass = initCompassCapture(store, sessionNodeId, () => {
        compass = null;
        render();
      });
    } else if (method === "manual") {
      store.select(sessionNodeId);
      close();
      showToast("Set the bearing on the compass ring in the panel.", "info");
    }
  }

  function onPanelClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    if (t.closest(".cap-x")) return close();
    if (t.closest('[data-act="capture-here"]')) return void captureHere();
    const m = t.closest<HTMLElement>("[data-method]");
    if (m) return chooseMethod(m.dataset.method as string);
  }

  function position(): void {
    const r = btn.getBoundingClientRect();
    panel.style.left = `${Math.round(Math.min(r.left, window.innerWidth - 320))}px`;
    panel.style.top = `${Math.round(r.bottom + 8)}px`;
  }

  function open(): void {
    position();
    panel.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    liveState = { kind: "idle" };
    live = initLivePosition(
      map,
      (r) => {
        liveState = { kind: "live", reading: r };
        render();
      },
      (err) => {
        liveState = { kind: "error", message: err.message };
        render();
      },
    );
    render();
  }

  function close(): void {
    panel.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    live?.stop();
    live = null;
    twoPoint?.destroy();
    twoPoint = null;
    compass?.destroy();
    compass = null;
  }

  function toggle(): void {
    if (panel.hidden) open();
    else close();
  }

  btn.addEventListener("click", toggle);
  panel.addEventListener("click", onPanelClick);
  const unsub = store.subscribe(() => {
    if (!panel.hidden) render();
  });

  return {
    destroy() {
      close();
      unsub();
      btn.removeEventListener("click", toggle);
      panel.removeEventListener("click", onPanelClick);
      btn.remove();
      panel.remove();
    },
  };
}
