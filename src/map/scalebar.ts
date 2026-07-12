// Live scale bar — makes the mockup's placeholder scale bar tell the truth.
//
// The mockup's `.scale` shows a static "0 … 500 m". Here we compute the real
// meters-per-pixel at the map center and pick a "nice" 1/2/5 ×10ⁿ distance that fits
// the bar, sizing the four segments to that distance and labelling it — the same idea as
// Leaflet's built-in scale control, kept in the mockup's chrome. Updates on pan/zoom.

import type L from "leaflet";

const MAX_BAR_PX = 152; // ~ the mockup's four 34px segments

/** Largest 1/2/5 ×10ⁿ value ≤ x. */
function niceRound(x: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(x)));
  const f = x / pow;
  const nice = f >= 5 ? 5 : f >= 2 ? 2 : 1;
  return nice * pow;
}

function label(meters: number): string {
  return meters >= 1000
    ? `${+(meters / 1000).toFixed(meters % 1000 === 0 ? 0 : 1)} km`
    : `${Math.round(meters)} m`;
}

export interface ScaleBar {
  destroy(): void;
}

/** Wire the `.scale` element's segments + right label to the live map scale. */
export function initScaleBar(map: L.Map, el: HTMLElement): ScaleBar {
  const segs = Array.from(el.querySelectorAll<HTMLElement>(".bar i"));
  const nums = Array.from(el.querySelectorAll<HTMLElement>(".num"));
  const rightLabel = nums[nums.length - 1] ?? null;

  function metersPerPixel(): number {
    const c = map.getCenter();
    const p1 = map.latLngToContainerPoint(c);
    const p2 = map.containerPointToLatLng(p1.add([100, 0] as unknown as L.PointExpression));
    return c.distanceTo(p2) / 100;
  }

  function update(): void {
    const mpp = metersPerPixel();
    if (!Number.isFinite(mpp) || mpp <= 0) return;
    const meters = niceRound(mpp * MAX_BAR_PX);
    const widthPx = meters / mpp;
    const per = widthPx / (segs.length || 1);
    for (const s of segs) s.style.width = `${per.toFixed(1)}px`;
    if (rightLabel) rightLabel.textContent = label(meters);
  }

  update();
  map.on("moveend zoomend", update);

  return {
    destroy() {
      map.off("moveend zoomend", update);
    },
  };
}
