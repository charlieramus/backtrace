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

  // --- Export ---------------------------------------------------------------
  function onExport(): void {
    if (store.getAll().length === 0) {
      showToast("Nothing to export yet — place a node or load the demo first.", "info");
      return;
    }
    exportInvestigation(store);
    showToast("Investigation exported as a JSON file.", "ok");
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
    const err = await importInvestigationFile(store, file, mode);
    if (err) {
      showToast(err, "error");
      return;
    }
    const count = store.getAll().length;
    frameToNodes();
    showToast(`Imported — ${count} node${count === 1 ? "" : "s"} loaded.`, "ok");
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

  exportBtn?.addEventListener("click", onExport);
  importBtn?.addEventListener("click", onImport);
  demoBtn?.addEventListener("click", onDemoBtn);
  demoBtn?.setAttribute("aria-haspopup", "true");
  demoBtn?.setAttribute("aria-expanded", "false");
  menu.addEventListener("click", onMenuClick);
  fileInput.addEventListener("change", onFileChosen);

  return {
    destroy() {
      exportBtn?.removeEventListener("click", onExport);
      importBtn?.removeEventListener("click", onImport);
      demoBtn?.removeEventListener("click", onDemoBtn);
      menu.removeEventListener("click", onMenuClick);
      fileInput.removeEventListener("change", onFileChosen);
      closeMenu();
      menu.remove();
      fileInput.remove();
    },
  };
}
