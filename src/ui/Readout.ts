// Candidate-area readout card — the mockup's `.card` at the top of the panel, wired to
// the live posterior summary (v4 S1/S2). It is where "honest, not an oracle" becomes a
// number: the 95% candidate AREA (never a coordinate), a spread/entropy meter with honest
// microcopy when the field is broad, the mode-count chip ("1 candidate origin" vs "two
// candidate origins — the data supports both"), and a geometry chip that flips to a
// poor-geometry warning banner rather than implying a falsely tight region. Below two
// bearings it shows a graceful "place at least two bearings" state.

import type { Store } from "../store";
import type { LatLon } from "../geo/enu";
import { computePosterior } from "../geo/posterior";
import {
  hdrRegions,
  candidateAreaM2,
  normalizedEntropy,
  modeCount,
  geometryQuality,
} from "../geo/hdr";

function spreadLabel(entropy: number): string {
  if (entropy < 0.5) return "tight";
  if (entropy < 0.8) return "moderate";
  return "broad";
}

function fmtArea(m2: number): string {
  return Math.round(m2).toLocaleString("en-US");
}

export interface Readout {
  destroy(): void;
}

/** Render the candidate-area readout into `container` and keep it live. */
export function initReadout(container: HTMLElement, store: Store): Readout {
  function anchor(): LatLon | undefined {
    const inc = store.getIncident();
    return inc.anchorLat != null && inc.anchorLon != null
      ? { lat: inc.anchorLat, lon: inc.anchorLon }
      : undefined;
  }

  function renderEmpty(): void {
    container.innerHTML = `
      <div class="card">
        <div class="clab"><div class="eyebrow">Candidate area · 95%</div></div>
        <div class="readout-empty">Place at least two bearings to estimate a candidate origin area — one indicator can't cross.</div>
      </div>`;
  }

  function render(): void {
    const a = anchor();
    const g = computePosterior(store.getAll(), a ? { anchor: a } : {});
    if (!g) {
      renderEmpty();
      return;
    }

    const regions = hdrRegions(g);
    const area = candidateAreaM2(regions);
    const ent = normalizedEntropy(g);
    const modes = modeCount(g);
    const geom = geometryQuality(store.getAll());

    const label = spreadLabel(ent);
    const meterPct = Math.round(Math.min(1, Math.max(0, ent)) * 100);
    const broadHint =
      ent >= 0.8
        ? '<div class="hint">The indicators say little here — the field is broad. That breadth is the honest answer, not a defect.</div>'
        : "";

    const modeChip =
      modes >= 2
        ? `<span class="chip warn"><span class="d"></span><span class="num">${modes}</span> candidate origins — the data supports both</span>`
        : `<span class="chip"><span class="d"></span><span class="num">1</span> candidate origin</span>`;

    const geomChip = geom.poor
      ? `<span class="chip warn"><span class="d"></span>Geometry <span class="num">poor</span></span>`
      : `<span class="chip"><span class="d"></span>Geometry <span class="num">good</span></span>`;

    const banner = geom.poor
      ? `<div class="readout-banner">Poor geometry — the bearings are near-parallel, so the crossing is ill-conditioned. Collect a node from a different sector before trusting this area.</div>`
      : "";

    container.innerHTML = `
      <div class="card">
        <div class="clab"><div class="eyebrow">Candidate area · 95%</div></div>
        <div class="area"><span class="v num">${fmtArea(area)}</span><span class="u num">m²</span></div>
        <div class="metric">
          <div class="ml"><span>Spread of the field</span><span>${label}</span></div>
          <div class="meter"><i style="width:${meterPct}%"></i></div>
          ${broadHint}
        </div>
        <div class="chips">
          ${modeChip}
          ${geomChip}
        </div>
        ${banner}
      </div>`;
  }

  // Debounced so a drag on the compass ring doesn't recompute the grid every frame.
  let debounce = 0;
  function schedule(): void {
    clearTimeout(debounce);
    debounce = window.setTimeout(render, 60);
  }

  render();
  const unsub = store.subscribe(schedule);

  return {
    destroy() {
      clearTimeout(debounce);
      unsub();
      container.innerHTML = "";
    },
  };
}
