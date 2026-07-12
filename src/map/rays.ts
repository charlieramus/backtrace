// Bearing rays — each node's direction drawn on the map, geo-anchored via the ENU core.
//
// For every node carrying an azimuth, a Leaflet polyline runs from the marker along the
// bearing, projected a fixed GROUND distance out with projectAlong() (so it tracks
// pan/zoom for free). Color = the node's indicator color; the line fades toward the far
// end (approximated with a solid near-segment + a lower-opacity far tail, since Leaflet
// strokes can't gradient). The SELECTED node's ray is thicker + solid (~2.4px, ~0.95
// alpha); the others are thinner + dashed (~1.6px, ~0.6 alpha) — matching drawNodes() in
// design/mockup.reference.html. The layer redraws on any store change and on map
// pan/zoom, and drops a ray when its node is removed.

import L from "leaflet";
import type { Store } from "../store";
import type { LatLon } from "../geo/enu";
import { projectAlong } from "../geo/enu";
import { indicatorColor } from "../domain/indicators";

/** Resolve a `var(--token)` reference to a concrete color for a Leaflet stroke attr. */
function resolveColor(ref: string): string {
  const m = /^var\((--[\w-]+)\)$/.exec(ref.trim());
  if (!m) return ref;
  const v = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim();
  return v || ref;
}

/** Ray/wedge ground length in meters, scaled to the current view so it's always visible. */
export function viewRayMeters(map: L.Map): number {
  const b = map.getBounds();
  const diag = b.getNorthEast().distanceTo(b.getSouthWest());
  return Math.max(200, diag * 0.4);
}

export interface RayLayer {
  destroy(): void;
}

/** Draw + maintain the bearing rays for all nodes with an azimuth. */
export function initRays(map: L.Map, store: Store): RayLayer {
  const group = L.layerGroup().addTo(map);

  function anchor(): LatLon | null {
    const inc = store.getIncident();
    if (inc.anchorLat == null || inc.anchorLon == null) return null;
    return { lat: inc.anchorLat, lon: inc.anchorLon };
  }

  function redraw(): void {
    group.clearLayers();
    const a = anchor();
    if (!a) return;
    const meters = viewRayMeters(map);
    const selectedId = store.getState().selectedNodeId;

    for (const n of store.getAll()) {
      if (n.azimuthTrueDeg == null) continue;
      const from: LatLon = { lat: n.lat, lon: n.lon };
      const selected = n.id === selectedId;
      const color = resolveColor(indicatorColor(n.indicatorCode));

      // split the ray so the far half reads faded (approx the mockup's gradient tail)
      const mid = projectAlong(a, from, n.azimuthTrueDeg, meters * 0.55);
      const end = projectAlong(a, from, n.azimuthTrueDeg, meters);
      const weight = selected ? 2.4 : 1.6;
      const dash = selected ? undefined : "7 6";
      const nearAlpha = selected ? 0.95 : 0.6;

      L.polyline([[from.lat, from.lon], [mid.lat, mid.lon]], {
        color,
        weight,
        opacity: nearAlpha,
        dashArray: dash,
        interactive: false,
        lineCap: "round",
      }).addTo(group);
      L.polyline([[mid.lat, mid.lon], [end.lat, end.lon]], {
        color,
        weight,
        opacity: nearAlpha * 0.4,
        dashArray: dash,
        interactive: false,
        lineCap: "round",
      }).addTo(group);
    }
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
