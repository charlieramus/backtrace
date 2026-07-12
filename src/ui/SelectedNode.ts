// Selected node · bearing card — the mockup's `.selnode` block.
//
// Left: the interactive compass-ring dial (CompassRing). Right: `.selfields` — the
// Indicator (name + micro/macro scale), the Azimuth (true) as an editable --font-data
// value, and the Uncertainty σ (editable, with the Parker & Babrauskas provenance in
// the small note) — plus the drag hint. Shown only when a node is selected; otherwise
// a gentle empty hint. Every edit writes through the store (store.update), and the card
// re-renders from store state — dragging the ring or typing an azimuth moves the needle;
// editing σ widens/narrows the wedge.
//
// To keep typing smooth, the card DOM is built once per selected node (keyed by id) and
// only its live values are patched on subsequent store changes; a focused input is left
// alone so the cursor never jumps.

import type { Store } from "../store";
import { getIndicator } from "../domain/indicators";
import { effectiveSigma } from "../domain/node";
import { initCompassRing, type CompassRingHandle } from "./CompassRing";

const DRAG_ICON =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v6m0 6v6M3 12h6m6 0h6" stroke-linecap="round"/></svg>';

export interface SelectedNode {
  destroy(): void;
}

/** Render the selected-node bearing card into `container` and wire it to the store. */
export function initSelectedNode(container: HTMLElement, store: Store): SelectedNode {
  let currentId: string | null = null;
  let compass: CompassRingHandle | null = null;
  let azInput: HTMLInputElement | null = null;
  let sigInput: HTMLInputElement | null = null;

  function buildEmpty(): void {
    teardownCard();
    currentId = null;
    container.innerHTML =
      '<div class="selnode-empty">Select a node to set its bearing on the compass ring.</div>';
  }

  function teardownCard(): void {
    compass?.destroy();
    compass = null;
    azInput = null;
    sigInput = null;
  }

  function buildCard(id: string): void {
    teardownCard();
    const node = store.getAll().find((n) => n.id === id);
    if (!node) return;
    const t = getIndicator(node.indicatorCode);
    const name = t?.label ?? node.indicatorCode;
    const scale = t ? t.scale.toLowerCase() : "";
    const sigNote = t?.priorSigmaDeg != null && node.sigmaDeg == null ? "P&B 2024" : "custom";

    container.innerHTML = `
      <div class="card selnode-card">
        <div class="clab"><div class="eyebrow">Selected node · bearing</div></div>
        <div class="selnode">
          <div class="compass-wrap"><svg viewBox="0 0 120 120" aria-label="Bearing compass"></svg></div>
          <div class="selfields">
            <div class="field">
              <label>Indicator</label>
              <div class="val"><span>${name}</span><small>${scale}</small></div>
            </div>
            <div class="field">
              <label>Azimuth (true)</label>
              <div class="val">
                <input class="num azin" type="number" inputmode="numeric" min="0" max="359"
                  step="1" placeholder="—" aria-label="Azimuth in degrees true" />
                <small>drag or type</small>
              </div>
            </div>
            <div class="field">
              <label>Uncertainty σ</label>
              <div class="val">
                <input class="num sigin" type="number" inputmode="numeric" min="1" max="180"
                  step="1" aria-label="Angular uncertainty sigma in degrees" />
                <small class="signote">${sigNote}</small>
              </div>
            </div>
          </div>
        </div>
        <div class="drag-hint">${DRAG_ICON} The wedge shows σ — how much this sign really constrains direction.</div>
      </div>`;

    const svg = container.querySelector<SVGSVGElement>(".compass-wrap svg")!;
    compass = initCompassRing(svg, {
      onAzimuth: (deg) => {
        const cur = store.getSelected();
        if (cur) store.update(cur.id, { azimuthTrueDeg: deg });
      },
    });

    azInput = container.querySelector<HTMLInputElement>(".azin");
    sigInput = container.querySelector<HTMLInputElement>(".sigin");

    azInput?.addEventListener("input", () => {
      const cur = store.getSelected();
      if (!cur || !azInput) return;
      const raw = azInput.value.trim();
      if (raw === "") {
        store.update(cur.id, { azimuthTrueDeg: null });
        return;
      }
      let v = Number(raw);
      if (!Number.isFinite(v)) return;
      v = ((Math.round(v) % 360) + 360) % 360; // wrap into 0–359
      store.update(cur.id, { azimuthTrueDeg: v });
    });

    sigInput?.addEventListener("input", () => {
      const cur = store.getSelected();
      if (!cur || !sigInput) return;
      const raw = sigInput.value.trim();
      if (raw === "") return;
      let v = Number(raw);
      if (!Number.isFinite(v)) return;
      v = Math.min(180, Math.max(1, Math.round(v)));
      store.update(cur.id, { sigmaDeg: v });
    });

    currentId = id;
    patchValues(); // seed the fields + dial
  }

  /** Update live values in place (dial + inputs), leaving a focused input untouched. */
  function patchValues(): void {
    const node = store.getAll().find((n) => n.id === currentId);
    if (!node) return;
    const sig = effectiveSigma(node);
    compass?.set(node.azimuthTrueDeg, sig);

    if (azInput && document.activeElement !== azInput) {
      azInput.value = node.azimuthTrueDeg == null ? "" : String(Math.round(node.azimuthTrueDeg));
    }
    if (sigInput && document.activeElement !== sigInput) {
      sigInput.value = sig == null ? "" : String(Math.round(sig));
    }
    // keep the σ provenance note honest as the override state changes
    const noteEl = container.querySelector<HTMLElement>(".signote");
    if (noteEl) {
      const t = getIndicator(node.indicatorCode);
      noteEl.textContent =
        t?.priorSigmaDeg != null && node.sigmaDeg == null ? "P&B 2024" : "custom";
    }
  }

  function render(): void {
    const sel = store.getSelected();
    if (!sel) {
      if (currentId !== null || container.childElementCount === 0) buildEmpty();
      return;
    }
    if (sel.id !== currentId) {
      buildCard(sel.id);
    } else {
      patchValues();
    }
  }

  const unsub = store.subscribe(render);
  render();

  return {
    destroy() {
      unsub();
      teardownCard();
      container.innerHTML = "";
    },
  };
}
