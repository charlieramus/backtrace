// GOA → SOA workflow tools (V10 S4) — draw macro evidence first, then refine with micro nodes.
//
// A frosted tools panel (toggled from an injected "Macro" toolbar button) offers the five
// macro-constraint kinds, a lightweight Phase-1 (macro) / Phase-2 (micro) affordance mirroring
// the outside-in doctrine, and a live list of the active constraints with a void action. Each
// tool arms a small map-click capture; on completion it writes an APPEND-ONLY MacroConstraint
// (V6 discipline) via store.addMacro, which flows through prior.ts → the posterior live. Active
// constraints render on the map in a dedicated pane, colour-blind-safe (distinct SHAPE + colour
// per kind — CRESEARCH.md §4.5). Void goes through the same stated-reason flow as nodes.

import L from "leaflet";
import type { Store } from "../store";
import type { MacroKind } from "../domain/macro";
import { enuFromLatLon } from "../geo/enu";
import { showToast } from "../ui/toast";
import { openPrompt } from "../ui/modal";

export interface MacroTools {
  destroy(): void;
}

// Colour-blind-safe palette (distinct hue + shape per kind).
const KIND_STYLE: Record<MacroKind, { color: string; label: string }> = {
  V_APEX: { color: "#3B82F6", label: "V apex" },
  WITNESS_CONE: { color: "#0EA5A4", label: "Witness cone" },
  FIRST_REPORT_LOC: { color: "#F59E0B", label: "First-report point" },
  BURN_PERIMETER: { color: "#8B5CF6", label: "Burn perimeter" },
  EXCLUSION_ZONE: { color: "#EF4444", label: "Exclusion zone" },
};

const DEFAULT_RADIUS_M = 300;
const DEFAULT_CONE_SPREAD_DEG = 20;

type Tool = MacroKind | null;

/** Local true-north bearing from → to (deg), computed in the `from` ENU frame. */
function localBearing(from: L.LatLng, to: L.LatLng): number {
  const e = enuFromLatLon(to.lat, to.lng, { lat: from.lat, lon: from.lng });
  return ((Math.atan2(e.e, e.n) / (Math.PI / 180)) % 360 + 360) % 360;
}

export function initMacroTools(map: L.Map, store: Store): MacroTools {
  // --- render pane for macro constraints -------------------------------------
  const paneName = "bt-macro";
  if (!map.getPane(paneName)) {
    const p = map.createPane(paneName);
    p.style.zIndex = "410"; // above the posterior/overlay, below markers
  }
  const layer = L.layerGroup([], { pane: paneName }).addTo(map);

  // --- toolbar toggle ---------------------------------------------------------
  const toolbar = document.querySelector(".toolbar");
  const btn = document.createElement("button");
  btn.className = "tbtn";
  btn.id = "macroBtn";
  btn.setAttribute("aria-haspopup", "dialog");
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6l9-3 9 3v12l-9 3-9-3z"/><path d="M12 3v18"/></svg>
    Macro`;
  const captureBtn = toolbar?.querySelector("#captureBtn") ?? toolbar?.querySelector(".tbtn.primary");
  if (captureBtn && captureBtn.nextSibling) toolbar!.insertBefore(btn, captureBtn.nextSibling);
  else toolbar?.appendChild(btn);

  const panel = document.createElement("div");
  panel.className = "bt-capture bt-macro-panel frost";
  panel.hidden = true;
  document.body.appendChild(panel);

  let tool: Tool = null;
  let phase: 1 | 2 = 1;
  let polyPts: L.LatLng[] = [];
  let firstClick: L.LatLng | null = null;
  const container = map.getContainer();

  function armTool(next: Tool): void {
    tool = next;
    polyPts = [];
    firstClick = null;
    inProgress?.remove();
    inProgress = null;
    container.classList.toggle("bt-placing", tool !== null);
    // While drawing a polygon, suppress double-click zoom so the closing dblclick doesn't zoom.
    const poly = tool === "BURN_PERIMETER" || tool === "EXCLUSION_ZONE";
    if (poly) map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
    render();
    if (tool) {
      const hints: Record<MacroKind, string> = {
        FIRST_REPORT_LOC: "Click the reported first-report location.",
        V_APEX: "Click the V/U apex, then a point toward the burn interior.",
        WITNESS_CONE: "Click the observer, then a point along the first-smoke bearing.",
        BURN_PERIMETER: "Click perimeter vertices; double-click to close.",
        EXCLUSION_ZONE: "Click zone vertices; double-click to close.",
      };
      showToast(hints[tool], "info");
    }
  }

  function commitPoint(kind: "FIRST_REPORT_LOC", at: L.LatLng): void {
    store.addMacro({
      kind,
      source: "INVESTIGATOR",
      geometry: { type: "Point", coordinates: [at.lng, at.lat] },
      radiusM: DEFAULT_RADIUS_M,
    });
    showToast("First-report location added — it informs the prior.", "ok");
    armTool(null);
  }

  function onMapClick(e: L.LeafletMouseEvent): void {
    if (!tool) return;
    const p = e.latlng;
    if (tool === "FIRST_REPORT_LOC") return commitPoint("FIRST_REPORT_LOC", p);

    if (tool === "V_APEX") {
      if (!firstClick) {
        firstClick = p;
        showToast("Apex set — now click toward the interior.", "info");
      } else {
        store.addMacro({
          kind: "V_APEX",
          source: "INVESTIGATOR",
          geometry: { type: "LineString", coordinates: [[firstClick.lng, firstClick.lat], [p.lng, p.lat]] },
          radiusM: DEFAULT_RADIUS_M,
        });
        showToast("V apex added — the prior favors the interior.", "ok");
        armTool(null);
      }
      return;
    }

    if (tool === "WITNESS_CONE") {
      if (!firstClick) {
        firstClick = p;
        showToast("Observer set — now click along the first-smoke bearing.", "info");
      } else {
        const bearing = localBearing(firstClick, p);
        store.addMacro({
          kind: "WITNESS_CONE",
          source: "WITNESS",
          geometry: { type: "Point", coordinates: [firstClick.lng, firstClick.lat] },
          bearingDeg: bearing,
          spreadDeg: DEFAULT_CONE_SPREAD_DEG,
        });
        showToast(`Witness cone added — bearing ${Math.round(bearing)}° ± ${DEFAULT_CONE_SPREAD_DEG}°.`, "ok");
        armTool(null);
      }
      return;
    }

    // polygons: accumulate; finish on double-click
    polyPts.push(p);
    drawInProgress();
  }

  function onMapDblClick(e: L.LeafletMouseEvent): void {
    if (tool !== "BURN_PERIMETER" && tool !== "EXCLUSION_ZONE") return;
    L.DomEvent.stop(e as unknown as Event);
    if (polyPts.length < 3) {
      showToast("A polygon needs at least three points.", "info");
      return;
    }
    const ring = [...polyPts, polyPts[0]].map((pt) => [pt.lng, pt.lat] as [number, number]);
    store.addMacro({
      kind: tool,
      source: tool === "EXCLUSION_ZONE" ? "INVESTIGATOR" : "IR_FLIGHT",
      geometry: { type: "Polygon", coordinates: [ring] },
    });
    showToast(`${KIND_STYLE[tool].label} added.`, "ok");
    armTool(null);
  }

  // --- rendering --------------------------------------------------------------
  let inProgress: L.Polyline | null = null;
  function drawInProgress(): void {
    inProgress?.remove();
    inProgress = null;
    if (polyPts.length >= 2 && tool) {
      inProgress = L.polyline(polyPts, { pane: paneName, color: KIND_STYLE[tool].color, weight: 2, dashArray: "4 4" }).addTo(map);
    }
  }

  function drawMacros(): void {
    layer.clearLayers();
    for (const m of store.activeMacros()) {
      const st = KIND_STYLE[m.kind];
      if (m.kind === "FIRST_REPORT_LOC" && m.geometry.type === "Point") {
        const [lon, lat] = m.geometry.coordinates;
        L.circleMarker([lat, lon], { pane: paneName, radius: 6, color: st.color, weight: 2, fillColor: st.color, fillOpacity: 0.6 }).addTo(layer);
        L.circle([lat, lon], { pane: paneName, radius: m.radiusM ?? DEFAULT_RADIUS_M, color: st.color, weight: 1, opacity: 0.5, fill: false, dashArray: "3 4" }).addTo(layer);
      } else if (m.kind === "WITNESS_CONE" && m.geometry.type === "Point" && m.bearingDeg != null) {
        const [lon, lat] = m.geometry.coordinates;
        const obs = L.latLng(lat, lon);
        const spread = m.spreadDeg ?? DEFAULT_CONE_SPREAD_DEG;
        const range = 4000;
        for (const b of [m.bearingDeg - spread, m.bearingDeg + spread]) {
          const end = destPoint(obs, b, range);
          L.polyline([obs, end], { pane: paneName, color: st.color, weight: 2, opacity: 0.8 }).addTo(layer);
        }
        L.circleMarker(obs, { pane: paneName, radius: 4, color: st.color, weight: 2, fillColor: "#fff", fillOpacity: 1 }).addTo(layer);
      } else if (m.kind === "V_APEX" && m.geometry.type === "LineString") {
        const pts = m.geometry.coordinates.map(([lo, la]) => L.latLng(la, lo));
        L.polyline(pts, { pane: paneName, color: st.color, weight: 3 }).addTo(layer);
        L.circleMarker(pts[0], { pane: paneName, radius: 6, color: st.color, weight: 2, fillColor: st.color, fillOpacity: 0.8 }).addTo(layer);
      } else if ((m.kind === "BURN_PERIMETER" || m.kind === "EXCLUSION_ZONE") && m.geometry.type === "Polygon") {
        const ring = m.geometry.coordinates[0].map(([lo, la]) => L.latLng(la, lo));
        L.polygon(ring, {
          pane: paneName,
          color: st.color,
          weight: 2,
          fillOpacity: m.kind === "EXCLUSION_ZONE" ? 0.14 : 0.05,
          dashArray: m.kind === "EXCLUSION_ZONE" ? "5 5" : undefined,
        }).addTo(layer);
      }
    }
  }

  /** A point `m` metres from `from` along bearing `bDeg` (for cone edge rendering). */
  function destPoint(from: L.LatLng, bDeg: number, m: number): L.LatLng {
    const R = 6371008.8;
    const d = m / R;
    const b = bDeg * (Math.PI / 180);
    const φ1 = from.lat * (Math.PI / 180);
    const λ1 = from.lng * (Math.PI / 180);
    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(b));
    const λ2 = λ1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(φ1), Math.cos(d) - Math.sin(φ1) * Math.sin(φ2));
    return L.latLng((φ2 * 180) / Math.PI, (λ2 * 180) / Math.PI);
  }

  // --- panel ------------------------------------------------------------------
  function render(): void {
    const macros = store.activeMacros();
    const toolBtn = (k: MacroKind): string =>
      `<button class="cap-mbtn ${tool === k ? "primary" : ""}" data-tool="${k}">
        <b>${KIND_STYLE[k].label}</b><small>${TOOL_HINT[k]}</small>
      </button>`;
    const list = macros.length
      ? macros
          .map(
            (m) => `<div class="macro-row">
              <span class="macro-dot" style="background:${KIND_STYLE[m.kind].color}"></span>
              <span class="macro-lab">${KIND_STYLE[m.kind].label} · <span class="macro-src">${m.source.toLowerCase()}</span></span>
              <button class="macro-void" data-void="${m.id}" aria-label="Void this constraint">✕</button>
            </div>`,
          )
          .join("")
      : `<div class="cap-hint">No macro constraints yet. Draw the general origin area first (Phase 1).</div>`;
    panel.innerHTML = `
      <div class="cap-head">
        <div class="eyebrow">GOA → SOA · macro evidence</div>
        <button class="cap-x" aria-label="Close macro tools">✕</button>
      </div>
      <div class="macro-phase">
        <button class="macro-ph ${phase === 1 ? "on" : ""}" data-phase="1">Phase 1 · GOA (macro)</button>
        <button class="macro-ph ${phase === 2 ? "on" : ""}" data-phase="2">Phase 2 · SOA (micro)</button>
      </div>
      <div class="cap-methods">
        ${toolBtn("V_APEX")}
        ${toolBtn("WITNESS_CONE")}
        ${toolBtn("FIRST_REPORT_LOC")}
        ${toolBtn("BURN_PERIMETER")}
        ${toolBtn("EXCLUSION_ZONE")}
      </div>
      <div class="cap-sec-lab">Active constraints (${macros.length})</div>
      <div class="macro-list">${list}</div>
      <div class="cap-foot">Macro evidence enters as a prior, never a ray. The readout notes when a prior is active.</div>`;
  }

  const TOOL_HINT: Record<MacroKind, string> = {
    V_APEX: "Apex + axis toward the interior",
    WITNESS_CONE: "Observer + first-smoke bearing",
    FIRST_REPORT_LOC: "Dispatch first-report point",
    BURN_PERIMETER: "Origin must be inside",
    EXCLUSION_ZONE: "Origin cannot be inside",
  };

  async function onPanelClick(e: MouseEvent): Promise<void> {
    const t = e.target as HTMLElement;
    if (t.closest(".cap-x")) return close();
    const ph = t.closest<HTMLElement>("[data-phase]");
    if (ph) {
      phase = ph.dataset.phase === "2" ? 2 : 1;
      return render();
    }
    const tl = t.closest<HTMLElement>("[data-tool]");
    if (tl) return armTool(tl.dataset.tool as MacroKind);
    const vd = t.closest<HTMLElement>("[data-void]");
    if (vd) {
      const reason = await openPrompt({
        title: "Void macro constraint",
        message: "State a reason — the constraint is superseded (never deleted).",
        placeholder: "e.g. misattributed witness account",
        confirmLabel: "Void",
      });
      if (reason) store.voidMacro(vd.dataset.void as string, reason);
    }
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
    render();
  }
  function close(): void {
    panel.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    armTool(null);
  }
  function toggle(): void {
    if (panel.hidden) open();
    else close();
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === "Escape" && tool) armTool(null);
  }

  map.on("click", onMapClick);
  map.on("dblclick", onMapDblClick);
  btn.addEventListener("click", toggle);
  panel.addEventListener("click", (e) => void onPanelClick(e));
  window.addEventListener("keydown", onKey);
  const unsub = store.subscribe(() => {
    drawMacros();
    if (!panel.hidden) render();
  });
  drawMacros();

  return {
    destroy() {
      map.off("click", onMapClick);
      map.off("dblclick", onMapDblClick);
      window.removeEventListener("keydown", onKey);
      unsub();
      btn.remove();
      panel.remove();
      layer.remove();
      inProgress?.remove();
    },
  };
}
