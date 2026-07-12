// Placement mode — arm an indicator, click the map to drop a node.
//
// The toolbar's primary "Add node" button arms placement: the map cursor becomes a
// crosshair (.bt-placing) and the button shows an active state. While armed, each
// map click adds a Node at that lat/lon with the currently-armed indicator, a default
// ADVANCING spread, and the indicator's prior sigma (via the store's defaults). The
// FIRST node placed sets the session ENU anchor on the incident header (used by v3/v4).
// Clicking the just-placed node is selected so the panel's spread control targets it.
// Esc cancels; toggling the button re-arms/disarms. Placement stays armed so several
// nodes can be dropped in a row.

import type L from "leaflet";
import type { Store } from "../store";

export interface PlacementController {
  isArmed(): boolean;
  arm(): void;
  disarm(): void;
  toggle(): void;
  destroy(): void;
}

/** Wire the Add-node button + map clicks into the store's placement flow. */
export function initPlacement(
  map: L.Map,
  store: Store,
  addButton: HTMLElement,
): PlacementController {
  let armed = false;
  const container = map.getContainer();

  function setArmed(next: boolean): void {
    if (armed === next) return;
    armed = next;
    container.classList.toggle("bt-placing", armed);
    addButton.classList.toggle("active", armed);
    addButton.setAttribute("aria-pressed", String(armed));
  }

  function onMapClick(e: L.LeafletMouseEvent): void {
    if (!armed) return;
    const { lat, lng } = e.latlng;
    const node = store.add({
      lat,
      lon: lng,
      indicatorCode: store.getArmedIndicator(),
      spreadType: "ADVANCING",
    });
    // The first node fixes the session ENU anchor (v3/v4 geometry origin).
    const incident = store.getIncident();
    if (incident.anchorLat === null || incident.anchorLon === null) {
      store.setAnchor(lat, lng);
    }
    // Select the just-placed node so the spread control acts on it.
    store.select(node.id);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape" && armed) setArmed(false);
  }

  map.on("click", onMapClick);
  addButton.addEventListener("click", () => setArmed(!armed));
  window.addEventListener("keydown", onKeyDown);
  addButton.setAttribute("aria-pressed", "false");

  return {
    isArmed: () => armed,
    arm: () => setArmed(true),
    disarm: () => setArmed(false),
    toggle: () => setArmed(!armed),
    destroy() {
      map.off("click", onMapClick);
      window.removeEventListener("keydown", onKeyDown);
      setArmed(false);
    },
  };
}
