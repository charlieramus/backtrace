// Live-position indicator (V9 S1) — the "you are here" fix + its accuracy circle.
//
// Watches the device geolocation and draws a small marker plus a metric accuracy circle
// (the real ±metres the sensor reports, in its own map pane beneath the markers). It never
// blocks on the network and reflects real permission/availability state: on denial or
// unavailability it simply stops (the capture panel shows the honest reason), rather than
// spinning a fake fix forever.

import L from "leaflet";
import { watchReadings, type GeoReading, type GeoWatch } from "../sensors/geo";

export interface LivePosition {
  /** Latest live reading, or null before the first fix / after an error. */
  current(): GeoReading | null;
  stop(): void;
}

/** Start the live-position layer. `onReading`/`onError` let the capture panel mirror state. */
export function initLivePosition(
  map: L.Map,
  onReading?: (r: GeoReading) => void,
  onError?: (e: Error) => void,
): LivePosition {
  const pane = "bt-livepos";
  if (!map.getPane(pane)) {
    const p = map.createPane(pane);
    p.style.zIndex = "440"; // beneath markers (450), above the posterior/overlay panes
    p.style.pointerEvents = "none";
  }

  let dot: L.CircleMarker | null = null;
  let ring: L.Circle | null = null;
  let latest: GeoReading | null = null;

  function draw(r: GeoReading): void {
    const ll = L.latLng(r.lat, r.lon);
    if (!ring) {
      ring = L.circle(ll, {
        pane,
        radius: r.hAccuracyM,
        color: "var(--accent)",
        weight: 1,
        opacity: 0.5,
        fillColor: "var(--accent)",
        fillOpacity: 0.1,
        interactive: false,
      }).addTo(map);
    } else {
      ring.setLatLng(ll);
      ring.setRadius(r.hAccuracyM);
    }
    if (!dot) {
      dot = L.circleMarker(ll, {
        pane,
        radius: 5,
        color: "#fff",
        weight: 2,
        fillColor: "var(--accent)",
        fillOpacity: 1,
        interactive: false,
      }).addTo(map);
    } else {
      dot.setLatLng(ll);
    }
  }

  const watch: GeoWatch = watchReadings(
    (r) => {
      latest = r;
      draw(r);
      onReading?.(r);
    },
    (e) => {
      onError?.(e);
    },
  );

  return {
    current: () => latest,
    stop() {
      watch.stop();
      dot?.remove();
      ring?.remove();
      dot = null;
      ring = null;
    },
  };
}
