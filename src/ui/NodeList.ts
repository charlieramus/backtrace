// Node list — the panel body: one selectable, removable row per node.
//
// Each row is the mockup's `.node`: the spread glyph in the indicator color, the
// indicator name, a subline with the spread label (v3 adds the bearing), the σ
// readout, and a ✕ remove button. Clicking a row selects the node (store.select),
// which also rings its map marker; clicking ✕ removes it. The list re-renders from
// the store on every change and reflects the current selection with `.node.sel`.
// When selection changes (e.g. from clicking a marker), the selected row scrolls
// into view.

import type { Store } from "../store";
import type { Node, SpreadType } from "../domain/node";
import { getIndicator, indicatorColor } from "../domain/indicators";
import { effectiveSigma } from "../domain/node";

const SPREAD_LABEL: Record<SpreadType, string> = {
  ADVANCING: "advancing",
  LATERAL: "lateral",
  BACKING: "backing",
  UNDETERMINED: "undetermined",
};

const REMOVE_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

function glyphSvg(spread: SpreadType, color: string): string {
  const inner =
    spread === "ADVANCING"
      ? '<path d="M6 1 11 11H1z" fill="currentColor"/>'
      : spread === "LATERAL"
        ? '<path d="M6 1 11 6 6 11 1 6z" fill="currentColor"/>'
        : spread === "BACKING"
          ? '<rect x="1.5" y="1.5" width="9" height="9" fill="currentColor"/>'
          : '<circle cx="6" cy="6" r="4.5" fill="currentColor"/>';
  return `<svg viewBox="0 0 12 12" width="12" height="12" style="color:${color}" aria-hidden="true">${inner}</svg>`;
}

function sigText(node: Node): string {
  const s = effectiveSigma(node);
  return s == null ? "—" : `${s}°`;
}

/** The node's bearing for the subline: "284°" once set, a typographic minus before. */
function bearingText(node: Node): string {
  return node.azimuthTrueDeg == null ? "—" : `${Math.round(node.azimuthTrueDeg)}°`;
}

function rowHtml(node: Node, selected: boolean): string {
  const t = getIndicator(node.indicatorCode);
  const name = t?.label ?? node.indicatorCode;
  const color = indicatorColor(node.indicatorCode);
  return `
    <div class="node${selected ? " sel" : ""}" data-id="${node.id}" role="button" tabindex="0" aria-pressed="${selected}">
      <span class="glyph">${glyphSvg(node.spreadType, color)}</span>
      <span class="nb">
        <span class="nt">${name}</span>
        <span class="ns"><span class="sp">${SPREAD_LABEL[node.spreadType]}</span> · <span class="num">${bearingText(node)}</span></span>
      </span>
      <span class="sig">σ <b class="num">${sigText(node)}</b></span>
      <span class="iconbtn remove" role="button" tabindex="0" aria-label="Remove node" title="Remove">${REMOVE_SVG}</span>
    </div>`;
}

export interface NodeList {
  destroy(): void;
}

/** Render the node list into `container` (the mockup's #nodelist) and wire two-way
 *  selection + removal against the store. */
export function initNodeList(container: HTMLElement, store: Store): NodeList {
  let lastSelected: string | null = store.getState().selectedNodeId;

  function render(): void {
    const nodes = store.getAll();
    const selectedId = store.getState().selectedNodeId;
    container.innerHTML = nodes.map((n) => rowHtml(n, n.id === selectedId)).join("");

    // Scroll the selected row into view when the selection changed (e.g. via a
    // marker click). `nearest` won't jump when it's already visible.
    if (selectedId && selectedId !== lastSelected) {
      const el = container.querySelector<HTMLElement>(`.node[data-id="${selectedId}"]`);
      el?.scrollIntoView({ block: "nearest" });
    }
    lastSelected = selectedId;
  }

  function idFrom(el: HTMLElement): string | undefined {
    return el.closest<HTMLElement>(".node")?.dataset.id;
  }

  function onClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const id = idFrom(target);
    if (!id) return;
    if (target.closest(".remove")) {
      store.remove(id);
    } else {
      store.select(id);
    }
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key !== "Enter" && e.key !== " ") return;
    const target = e.target as HTMLElement;
    const id = idFrom(target);
    if (!id) return;
    e.preventDefault();
    if (target.closest(".remove")) store.remove(id);
    else store.select(id);
  }

  container.addEventListener("click", onClick);
  container.addEventListener("keydown", onKey);
  const unsub = store.subscribe(render);
  render();

  return {
    destroy() {
      unsub();
      container.removeEventListener("click", onClick);
      container.removeEventListener("keydown", onKey);
      container.innerHTML = "";
    },
  };
}
