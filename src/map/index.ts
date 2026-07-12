// Leaflet map for Backtrace.
//
// Stage 3 (UPDATELOGV1.md): a real, pannable Colorado map carrying the mockup's
// dark, muted mood — a quiet dark basemap with a low-opacity terrain hillshade for
// a "muted contour" topo feel. It swaps to a light basemap when the theme is light.
// Geo-anchored markers + posterior layers arrive in v2–v4.

import L from "leaflet";

// --- Basemaps: all free, no API key ------------------------------------------
// CARTO dark-matter / positron raster tiles.
const CARTO_DARK = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const CARTO_LIGHT = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
// Esri World Hillshade — theme-neutral terrain shading, layered low-opacity over
// the flat basemap so the ground reads like muted contours.
const ESRI_HILLSHADE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}";

const CARTO_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
const ESRI_ATTR =
  'Hillshade &copy; <a href="https://www.esri.com/">Esri</a>, USGS';

// NOTE: CARTO dark-matter is a quiet dark raster, not a true topo. A real dark
// *topo* raster (OpenTopoMap dark-filtered, or a keyed MapTiler / Thunderforest
// topo) is a later upgrade — do NOT block v1 on it. The hillshade overlay gives
// the muted-contour terrain mood in the meantime.

export type EffectiveTheme = "dark" | "light";

/** Resolve the theme actually in effect: an explicit data-theme wins, else OS. */
export function getEffectiveTheme(): EffectiveTheme {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/**
 * Create the full-viewport Colorado map and wire theme-driven basemap swapping.
 * Returns the Leaflet map so later stages can add geo-anchored layers.
 */
export function createMap(container: HTMLElement | string): L.Map {
  const map = L.map(container, {
    center: [39.5, -105.8], // Colorado
    zoom: 7,
    zoomControl: false, // keep the field-instrument chrome clean; drag + wheel pan/zoom
    attributionControl: true,
  });

  const darkBase = L.tileLayer(CARTO_DARK, {
    attribution: CARTO_ATTR,
    subdomains: "abcd",
    maxZoom: 20,
  });
  const lightBase = L.tileLayer(CARTO_LIGHT, {
    attribution: CARTO_ATTR,
    subdomains: "abcd",
    maxZoom: 20,
  });
  // Keep the basemap under the hillshade regardless of add/remove order.
  darkBase.setZIndex(1);
  lightBase.setZIndex(1);

  // Low opacity so the map stays dark and quiet and the (later) purple field and
  // ember chrome remain legible over it.
  const hillshade = L.tileLayer(ESRI_HILLSHADE, {
    attribution: ESRI_ATTR,
    maxZoom: 16,
    opacity: 0.18,
  });
  hillshade.setZIndex(2);
  hillshade.addTo(map);

  let current: EffectiveTheme | null = null;
  function applyBasemap(theme: EffectiveTheme): void {
    if (theme === current) return;
    current = theme;
    if (theme === "light") {
      map.removeLayer(darkBase);
      lightBase.addTo(map);
    } else {
      map.removeLayer(lightBase);
      darkBase.addTo(map);
    }
  }
  applyBasemap(getEffectiveTheme());

  // Swap the basemap whenever the theme changes — an explicit data-theme flip
  // (Stage 4's toggle) or the OS preference. Watching both keeps this testable
  // before the toggle button exists.
  const observer = new MutationObserver(() => applyBasemap(getEffectiveTheme()));
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  window
    .matchMedia("(prefers-color-scheme: light)")
    .addEventListener("change", () => applyBasemap(getEffectiveTheme()));

  return map;
}
