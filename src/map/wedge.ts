// Selected node's σ wedge — the honest, wide fan on the map.
//
// For the selected node (only), a Leaflet polygon fans from the marker between az−σ and
// az+σ, filled low-opacity vermillion (the mockup's wedge). Because σ is large (~80–106°,
// Parker & Babrauskas 2024), this fan is deliberately WIDE — it visualizes how weakly one
// indicator constrains direction. The polygon's arc is sampled with projectAlong() so it
// stays geo-anchored and tracks pan/zoom. Redraws on selection / azimuth / σ / pan-zoom;
// empty when nothing is selected or the selection has no bearing.

import L from "leaflet";
import type { Store } from "../store";
import type { LatLon } from "../geo/enu";
import { projectAlong } from "../geo/enu";
import { effectiveSigma } from "../domain/node";
import { viewRayMeters } from "./rays";

const WEDGE_FILL = "#e24a33"; // vermillion; low fill-opacity carries the "fading" read

export interface WedgeLayer {
  destroy(): void;
}

/** Draw + maintain the selected node's σ fan. */
export function initWedge(map: L.Map, store: Store): WedgeLayer {
  const group = L.layerGroup().addTo(map);

  function anchor(): LatLon | null {
    const inc = store.getIncident();
    if (inc.anchorLat == null || inc.anchorLon == null) return null;
    return { lat: inc.anchorLat, lon: inc.anchorLon };
  }

  function redraw(): void {
    group.clearLayers();
    const a = anchor();
    const node = store.getSelected();
    if (!a || !node || node.azimuthTrueDeg == null) return;
    const sigma = effectiveSigma(node);
    if (sigma == null || sigma <= 0) return;

    const az = node.azimuthTrueDeg;
    // honest full ±σ fan (the map wedge is wider than the dial's ±σ/2). Clamp so the
    // fan can't wrap past a near-full circle.
    const half = Math.min(179, sigma);
    const meters = viewRayMeters(map) * 1.02;
    const from: LatLon = { lat: node.lat, lon: node.lon };

    const pts: [number, number][] = [[from.lat, from.lon]];
    const steps = Math.max(8, Math.ceil((2 * half) / 6));
    for (let i = 0; i <= steps; i++) {
      const bearing = az - half + (2 * half * i) / steps;
      const p = projectAlong(a, from, bearing, meters);
      pts.push([p.lat, p.lon]);
    }

    L.polygon(pts, {
      color: WEDGE_FILL,
      weight: 1,
      opacity: 0.35,
      fillColor: WEDGE_FILL,
      fillOpacity: 0.14,
      interactive: false,
    }).addTo(group);
  }

  redraw();
  const unsub = store.subscribe(redraw);
  map.on("moveend zoomend", redraw);

  return {
    destroy() {
      unsub();
      map.off("moveend zoomend", redraw);
      map.removeLayer(group);
    },
  };
}
