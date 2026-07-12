// Geo-anchored node markers.
//
// The mockup drew markers on a <canvas> in drawMarker() — a spread SHAPE filled
// with the indicator COLOR, a dark outline (rgba(12,10,8,.9), ~2.5px). Here each
// node becomes a real Leaflet marker with an SVG divIcon built from those same
// shapes, so it tracks pan/zoom and stays crisp. The layer subscribes to the store
// and adds/removes/updates markers to match, one per node.
//
// Shapes are the mockup's, mapped to a 32×32 viewBox centered at (16,16) with r=13
// (≈26px marker): advancing ▲, lateral ◆, backing ■, undetermined ● (with the
// mockup's white inner ring). Fill uses indicatorColor() → var(--ind-*), so markers
// stay theme-driven. The ember selection ring is added in Stage 3.

import L from "leaflet";
import type { Store } from "../store";
import type { Node, SpreadType } from "../domain/node";
import { indicatorColor } from "../domain/indicators";

const OUTLINE = "rgba(12,10,8,.9)";
const R = 13;
const C = 16; // center of the 32×32 viewBox

/** SVG path/element for a spread shape, centered at (16,16), r=13. */
function shapeSvg(spread: SpreadType, fill: string): string {
  const common = `fill="${fill}" stroke="${OUTLINE}" stroke-width="2.5" stroke-linejoin="round"`;
  switch (spread) {
    case "ADVANCING": {
      const top = `${C} ${C - R}`;
      const right = `${C + R * 0.92} ${C + R * 0.7}`;
      const left = `${C - R * 0.92} ${C + R * 0.7}`;
      return `<path d="M${top} L${right} L${left} Z" ${common}/>`;
    }
    case "LATERAL":
      return `<path d="M${C} ${C - R} L${C + R} ${C} L${C} ${C + R} L${C - R} ${C} Z" ${common}/>`;
    case "BACKING": {
      const s = R * 0.8;
      return `<rect x="${C - s}" y="${C - s}" width="${s * 2}" height="${s * 2}" ${common}/>`;
    }
    case "UNDETERMINED": {
      const r = R * 0.85;
      // filled disc + the mockup's white inner ring for pop
      return (
        `<circle cx="${C}" cy="${C}" r="${r}" ${common}/>` +
        `<circle cx="${C}" cy="${C}" r="${r}" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="1"/>`
      );
    }
  }
}

function iconFor(node: Node): L.DivIcon {
  const fill = indicatorColor(node.indicatorCode);
  const html =
    `<svg class="bt-marker" viewBox="0 0 32 32" width="32" height="32" ` +
    `aria-hidden="true">${shapeSvg(node.spreadType, fill)}</svg>`;
  return L.divIcon({
    html,
    className: "bt-marker-icon",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

export interface MarkerLayer {
  /** Detach the store subscription and remove all markers. */
  destroy(): void;
}

/**
 * Render one Leaflet marker per node and keep them in sync with the store: add new
 * nodes, remove deleted ones, and refresh an icon when a node's spread/indicator
 * changed. Markers are real geo anchors, so they track pan/zoom for free.
 */
export function initMarkers(map: L.Map, store: Store): MarkerLayer {
  // node id -> { marker, signature } so we only rebuild an icon when it changed.
  const markers = new Map<string, { marker: L.Marker; sig: string }>();

  function signature(n: Node): string {
    return `${n.indicatorCode}|${n.spreadType}|${n.lat}|${n.lon}`;
  }

  function sync(): void {
    const nodes = store.getAll();
    const seen = new Set<string>();

    for (const n of nodes) {
      seen.add(n.id);
      const sig = signature(n);
      const existing = markers.get(n.id);
      if (!existing) {
        const marker = L.marker([n.lat, n.lon], { icon: iconFor(n) }).addTo(map);
        markers.set(n.id, { marker, sig });
      } else if (existing.sig !== sig) {
        existing.marker.setLatLng([n.lat, n.lon]);
        existing.marker.setIcon(iconFor(n));
        existing.sig = sig;
      }
    }

    // drop markers whose node is gone
    for (const [id, entry] of markers) {
      if (!seen.has(id)) {
        map.removeLayer(entry.marker);
        markers.delete(id);
      }
    }
  }

  sync();
  const unsub = store.subscribe(sync);

  return {
    destroy() {
      unsub();
      for (const { marker } of markers.values()) map.removeLayer(marker);
      markers.clear();
    },
  };
}
