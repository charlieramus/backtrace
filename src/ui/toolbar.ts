// Toolbar behavior — wires Export / Import to real save files (v5 S1) and the "Load demo"
// menu + "Clear" (v5 S3), all with on-system dialogs + toasts.
//
// "Load demo" opens a small frosted menu: the honest Marshall preset (a broad 95% region
// that CONTAINS the documented origin), the conflicting preset (a bimodal "two candidate
// origins" field), and a "Clear investigation" item. Loading a demo frames the map to the
// seeded nodes; Clear (after a confirm when non-empty) resets to the empty state.

import L from "leaflet";
import type { Store } from "../store";
import { exportInvestigation, importInvestigationFile, type ImportMode } from "../io/savefile";
import { exportGeoJson } from "../io/exportGeoJson";
import { exportKml } from "../io/exportKml";
import { exportGeoPackage } from "../io/exportGeoPackage";
import { exportPdf } from "../io/exportPdf";
import { buildSolution } from "../geo/solution";
import { loadMarshallDemo, loadConflictingDemo, type DemoResult } from "../demo/presets";
import { showToast } from "./toast";
import { openModal } from "./modal";

export interface Toolbar {
  destroy(): void;
}

/** Wire the toolbar's Import / Export / Load demo / Clear controls to the store + map. */
export function initToolbar(map: L.Map, store: Store): Toolbar {
  const exportBtn = document.getElementById("exportBtn");
  const importBtn = document.getElementById("importBtn");
  const demoBtn = document.getElementById("loadDemoBtn");

  // --- Export menu ----------------------------------------------------------
  // The Export control opens a frosted menu (same pattern as Load demo): the JSON
  // investigation (existing) plus the four V7 court-ready formats. Each reads the
  // current active nodes + latest solution, toasts, and appends an EXPORT audit entry.
  const exportMenu = document.createElement("div");
  exportMenu.className = "bt-menu frost";
  exportMenu.hidden = true;
  exportMenu.innerHTML = `
    <button class="bt-menuitem" data-fmt="json">
      <b>Investigation (JSON)</b>
      <small>The full hash-sealed record — re-imports into Backtrace</small>
    </button>
    <div class="bt-menu-div"></div>
    <button class="bt-menuitem" data-fmt="geojson">
      <b>GeoJSON</b>
      <small>Nodes, bearings, and 50/68/95 regions for any GIS</small>
    </button>
    <button class="bt-menuitem" data-fmt="kml">
      <b>KML</b>
      <small>Google Earth / GIS — spread by shape + colour</small>
    </button>
    <button class="bt-menuitem" data-fmt="gpkg">
      <b>GeoPackage</b>
      <small>Opens natively in QGIS / ArcGIS Pro (.gpkg)</small>
    </button>
    <button class="bt-menuitem" data-fmt="pdf">
      <b>PDF report</b>
      <small>Court-ready report with a methodology appendix</small>
    </button>`;
  document.body.appendChild(exportMenu);

  function positionExportMenu(): void {
    if (!exportBtn) return;
    const r = exportBtn.getBoundingClientRect();
    exportMenu.style.left = `${Math.round(Math.min(r.left, window.innerWidth - 260))}px`;
    exportMenu.style.top = `${Math.round(r.bottom + 8)}px`;
  }
  function openExportMenu(): void {
    positionExportMenu();
    exportMenu.hidden = false;
    exportBtn?.setAttribute("aria-expanded", "true");
    setTimeout(() => window.addEventListener("pointerdown", onExportOutside, true), 0);
    window.addEventListener("keydown", onExportEsc);
  }
  function closeExportMenu(): void {
    exportMenu.hidden = true;
    exportBtn?.setAttribute("aria-expanded", "false");
    window.removeEventListener("pointerdown", onExportOutside, true);
    window.removeEventListener("keydown", onExportEsc);
  }
  function onExportOutside(e: PointerEvent): void {
    if (e.target !== exportBtn && !exportMenu.contains(e.target as HTMLElement)) closeExportMenu();
  }
  function onExportEsc(e: KeyboardEvent): void {
    if (e.key === "Escape") closeExportMenu();
  }
  function onExportBtn(): void {
    if (exportMenu.hidden) openExportMenu();
    else closeExportMenu();
  }

  async function onExportMenuClick(e: MouseEvent): Promise<void> {
    const btn = (e.target as HTMLElement).closest<HTMLElement>(".bt-menuitem");
    const fmt = btn?.dataset.fmt;
    if (!fmt) return;
    closeExportMenu();
    await runExport(fmt);
  }

  async function runExport(fmt: string): Promise<void> {
    if (store.getAll().length === 0) {
      showToast("Nothing to export yet — place a node or load the demo first.", "info");
      return;
    }
    if (fmt === "json") {
      await exportInvestigation(store); // seals record + manifest hashes before download
      showToast("Investigation exported — hash-sealed as a JSON file.", "ok");
      return;
    }
    // The four court exports all read one origin solution — a candidate region needs a
    // crossing (≥2 bearings). Gate loudly rather than emitting an empty artifact.
    if (!buildSolution(store)) {
      showToast("Place at least two bearings first — a candidate region needs a crossing.", "info");
      return;
    }
    try {
      if (fmt === "geojson") {
        exportGeoJson(store);
        showToast("GeoJSON exported — nodes, bearings, and 50/68/95 regions.", "ok");
      } else if (fmt === "kml") {
        exportKml(store);
        showToast("KML exported — opens in Google Earth / GIS.", "ok");
      } else if (fmt === "gpkg") {
        showToast("Generating GeoPackage…", "info");
        await exportGeoPackage(store);
        showToast("GeoPackage (.gpkg) exported — opens in QGIS / ArcGIS Pro.", "ok");
      } else if (fmt === "pdf") {
        showToast("Generating PDF report…", "info");
        await exportPdf(store);
        showToast("PDF report exported — court-ready with methodology appendix.", "ok");
      }
    } catch {
      showToast("Export failed in this environment — nothing was written.", "error");
    }
  }

  // --- Import ---------------------------------------------------------------
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "application/json,.json";
  fileInput.style.display = "none";
  document.body.appendChild(fileInput);

  async function onFileChosen(): Promise<void> {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    let mode: ImportMode = "replace";
    if (store.getAll().length > 0) {
      const choice = await openModal<"replace" | "merge" | "cancel">({
        title: "Import investigation",
        message:
          "You already have nodes in this investigation. Replace them with the imported file, or merge the imported nodes in?",
        buttons: [
          { label: "Replace", value: "replace", variant: "primary" },
          { label: "Merge", value: "merge" },
          { label: "Cancel", value: "cancel", variant: "ghost" },
        ],
        cancelValue: "cancel",
      });
      if (choice === "cancel") return;
      mode = choice;
    }
    const res = await importInvestigationFile(store, file, mode);
    if (res.error !== null) {
      showToast(res.error, "error");
      return;
    }
    const count = store.getAll().length;
    frameToNodes();
    showToast(`Imported — ${count} node${count === 1 ? "" : "s"} loaded.`, "ok");
    // A migrated pre-1.0 file gets a LOUD acknowledgement notice; otherwise surface the
    // integrity verdict (a failed seal names the node; a clean seal confirms).
    if (res.migrated) {
      void openModal<"ok">({
        title: "Upgraded a pre-1.0 investigation",
        message:
          "Imported a pre-1.0 investigation — upgraded to a defensible record (append-only, hash-sealed). Provenance fields are blank until re-captured in the field.",
        buttons: [{ label: "Got it", value: "ok", variant: "primary" }],
        cancelValue: "ok",
      });
    } else if (res.integrity.status === "failed") {
      showToast(res.integrity.message, "error");
    } else if (res.integrity.status === "verified") {
      showToast(res.integrity.message, "ok");
    }
  }

  function onImport(): void {
    fileInput.click();
  }

  // --- Map framing ----------------------------------------------------------
  function frameTo(result: DemoResult): void {
    const pts = result.points.map((p) => L.latLng(p.lat, p.lon));
    if (pts.length === 0) return;
    map.fitBounds(L.latLngBounds(pts).pad(0.35), { maxZoom: 15, animate: true });
  }
  function frameToNodes(): void {
    const pts = store.getAll().map((n) => L.latLng(n.lat, n.lon));
    if (pts.length > 0) map.fitBounds(L.latLngBounds(pts).pad(0.35), { maxZoom: 15, animate: true });
  }

  // --- Load demo menu -------------------------------------------------------
  const menu = document.createElement("div");
  menu.className = "bt-menu frost";
  menu.hidden = true;
  menu.innerHTML = `
    <button class="bt-menuitem" data-act="marshall">
      <b>Marshall Fire — desk trace</b>
      <small>Honest broad region that contains the documented origin</small>
    </button>
    <button class="bt-menuitem" data-act="conflict">
      <b>Conflicting indicators</b>
      <small>Two candidate origins — the data supports both</small>
    </button>
    <div class="bt-menu-div"></div>
    <button class="bt-menuitem danger" data-act="clear">
      <b>Clear investigation</b>
      <small>Reset to the empty state</small>
    </button>`;
  document.body.appendChild(menu);

  function positionMenu(): void {
    if (!demoBtn) return;
    const r = demoBtn.getBoundingClientRect();
    menu.style.left = `${Math.round(r.left)}px`;
    menu.style.top = `${Math.round(r.bottom + 8)}px`;
  }
  function openMenu(): void {
    positionMenu();
    menu.hidden = false;
    demoBtn?.setAttribute("aria-expanded", "true");
    setTimeout(() => window.addEventListener("pointerdown", onOutside, true), 0);
    window.addEventListener("keydown", onEsc);
  }
  function closeMenu(): void {
    menu.hidden = true;
    demoBtn?.setAttribute("aria-expanded", "false");
    window.removeEventListener("pointerdown", onOutside, true);
    window.removeEventListener("keydown", onEsc);
  }
  function onOutside(e: PointerEvent): void {
    if (e.target !== demoBtn && !menu.contains(e.target as HTMLElement)) closeMenu();
  }
  function onEsc(e: KeyboardEvent): void {
    if (e.key === "Escape") closeMenu();
  }

  function onDemoBtn(): void {
    if (menu.hidden) openMenu();
    else closeMenu();
  }

  async function onMenuClick(e: MouseEvent): Promise<void> {
    const btn = (e.target as HTMLElement).closest<HTMLElement>(".bt-menuitem");
    const act = btn?.dataset.act;
    if (!act) return;
    closeMenu();
    if (act === "marshall") {
      frameTo(loadMarshallDemo(store));
      showToast("Loaded the Marshall demo — read the candidate area in the panel.", "ok");
    } else if (act === "conflict") {
      frameTo(loadConflictingDemo(store));
      showToast("Loaded conflicting indicators — the field is bimodal (two origins).", "ok");
    } else if (act === "clear") {
      await doClear();
    }
  }

  async function doClear(): Promise<void> {
    if (store.getAll().length > 0) {
      const ok = await openModal<boolean>({
        title: "Clear investigation",
        message: "Remove every node, bearing, and the candidate-area field? This can't be undone.",
        buttons: [
          { label: "Clear", value: true, variant: "primary" },
          { label: "Keep", value: false, variant: "ghost" },
        ],
        cancelValue: false,
      });
      if (!ok) return;
    }
    store.clear();
    map.setView([39.5, -105.8], 7, { animate: true }); // back to the Colorado overview
    showToast("Cleared — back to an empty investigation.", "info");
  }

  exportBtn?.addEventListener("click", onExportBtn);
  exportBtn?.setAttribute("aria-haspopup", "true");
  exportBtn?.setAttribute("aria-expanded", "false");
  exportMenu.addEventListener("click", onExportMenuClick);
  importBtn?.addEventListener("click", onImport);
  demoBtn?.addEventListener("click", onDemoBtn);
  demoBtn?.setAttribute("aria-haspopup", "true");
  demoBtn?.setAttribute("aria-expanded", "false");
  menu.addEventListener("click", onMenuClick);
  fileInput.addEventListener("change", onFileChosen);

  return {
    destroy() {
      exportBtn?.removeEventListener("click", onExportBtn);
      exportMenu.removeEventListener("click", onExportMenuClick);
      importBtn?.removeEventListener("click", onImport);
      demoBtn?.removeEventListener("click", onDemoBtn);
      menu.removeEventListener("click", onMenuClick);
      fileInput.removeEventListener("change", onFileChosen);
      closeMenu();
      closeExportMenu();
      menu.remove();
      exportMenu.remove();
      fileInput.remove();
    },
  };
}
