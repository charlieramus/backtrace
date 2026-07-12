// Panel meta — the head line "N nodes · anchor <lat,lon>" and the Nodes-header
// count, kept live from the store. The anchor is the session ENU anchor set by the
// first placement (incident header); shown in the data font, with the mockup's
// typographic minus, until a node fixes it.

import type { Store } from "../store";

/** Format the session anchor like the mockup: "39.9528, −105.284" (4 dp / 3 dp,
 *  typographic minus), or "—" before the first node sets it. */
function formatAnchor(lat: number | null, lon: number | null): string {
  if (lat === null || lon === null) return "—";
  const fmt = (v: number, dp: number) => v.toFixed(dp).replace("-", "−");
  return `${fmt(lat, 4)}, ${fmt(lon, 3)}`;
}

export interface PanelMeta {
  destroy(): void;
}

/** Wire the panel's title + node count + anchor readouts to the store. */
export function initPanelMeta(store: Store): PanelMeta {
  const titleEl = document.querySelector<HTMLElement>(".p-head h1");
  const metaEl = document.querySelector<HTMLElement>(".p-head .meta");
  const anchorEl = metaEl?.querySelector<HTMLElement>(".num") ?? null;
  const countEl = document.querySelector<HTMLElement>(".nodes-count");

  function render(): void {
    const n = store.getAll().length;
    const incident = store.getIncident();
    if (titleEl) titleEl.textContent = incident.name;
    if (metaEl) {
      // Rebuild the "N nodes · anchor " prefix, keeping the .num anchor span.
      const label = `${n} ${n === 1 ? "node" : "nodes"} · anchor `;
      if (anchorEl) {
        // firstChild is the text node before the .num span.
        metaEl.childNodes[0]!.textContent = label;
        anchorEl.textContent = formatAnchor(incident.anchorLat, incident.anchorLon);
      } else {
        metaEl.textContent = label;
      }
    }
    if (countEl) countEl.textContent = String(n);
  }

  const unsub = store.subscribe(render);
  render();

  return {
    destroy() {
      unsub();
    },
  };
}
