// Spread control — set the selected node's spread type (which swaps its marker shape
// live). A segmented control with the four spread shapes, matching the legend's
// meaning: advancing ▲, lateral ◆, backing ■, undetermined ●. Hidden when nothing is
// selected. Writing store.update(id, { spreadType }) re-renders that node's marker
// through the marker layer's subscription.

import type { Store } from "../../store";
import type { SpreadType } from "../../domain/node";

const OPTIONS: { spread: SpreadType; label: string; glyph: string }[] = [
  { spread: "ADVANCING", label: "Advancing", glyph: '<path d="M6 1 11 11H1z" fill="currentColor"/>' },
  { spread: "LATERAL", label: "Lateral", glyph: '<path d="M6 1 11 6 6 11 1 6z" fill="currentColor"/>' },
  { spread: "BACKING", label: "Backing", glyph: '<rect x="1.5" y="1.5" width="9" height="9" fill="currentColor"/>' },
  { spread: "UNDETERMINED", label: "Undet.", glyph: '<circle cx="6" cy="6" r="4.5" fill="currentColor"/>' },
];

export interface SpreadControl {
  destroy(): void;
}

export function initSpreadControl(parent: HTMLElement, store: Store): SpreadControl {
  const root = document.createElement("div");
  root.className = "spread-control";
  root.hidden = true;
  root.innerHTML = `
    <div class="eyebrow">Spread · selected node</div>
    <div class="segmented" role="group" aria-label="Spread type">
      ${OPTIONS.map(
        (o) => `
        <button class="seg" type="button" data-spread="${o.spread}" title="${o.label}">
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">${o.glyph}</svg>
          <span>${o.label}</span>
        </button>`,
      ).join("")}
    </div>`;

  const seg = Array.from(root.querySelectorAll<HTMLButtonElement>(".seg"));

  function reflect(): void {
    const sel = store.getSelected();
    if (!sel) {
      root.hidden = true;
      return;
    }
    root.hidden = false;
    for (const b of seg) {
      const active = b.dataset.spread === sel.spreadType;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    }
  }

  root.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest(".seg") as HTMLButtonElement | null;
    if (!b || !b.dataset.spread) return;
    const sel = store.getSelected();
    if (!sel) return;
    store.update(sel.id, { spreadType: b.dataset.spread as SpreadType });
  });

  const unsub = store.subscribe(reflect);
  reflect();
  parent.appendChild(root);

  return {
    destroy() {
      unsub();
      root.remove();
    },
  };
}
