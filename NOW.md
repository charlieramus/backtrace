# Now

Current status of the app. Updated as things change.

**Last updated:** 2026-07-12

## Stage: v0 shipped — desk engine + full UI

Backtrace v0 is real, usable, and honest, and it looks like `design/mockup.reference.html`:
a dark/light map-forward field instrument where you place fire-indicator nodes, set bearings
on the compass-ring dial, and read a stepped muted-purple candidate-origin field with an
honest readout. It installs, runs offline, and saves/loads investigations as files — no
account, no server. Built across `UPDATELOGV1.md`–`UPDATELOGV5.md`.

## Working

- **Map + chrome.** Leaflet + OpenStreetMap/CARTO basemap with a low-opacity hillshade, the
  full mockup chrome (toolbar + brand, theme toggle, offline chip, north arrow, live scale
  bar, legend, right panel) in both light and dark.
- **Nodes + markers.** Place indicator nodes; spread-shaped, indicator-colored markers;
  selection ring; node list; per-indicator Parker & Babrauskas σ priors.
- **Bearings (v3).** A true-north azimuth per node set on the mockup's signature compass-ring
  dial (drag or type), an editable σ, the ENU tangent-plane geometry core (`src/geo/enu.ts`),
  and geo-anchored bearing rays + the selected node's σ wedge on the map.
- **Honest posterior (v4).** A von Mises grid posterior (`src/geo/posterior.ts`), HDR
  50/68/95 credible regions + summaries (`src/geo/hdr.ts`), rendered as the mockup's stepped
  muted-purple bands + contour rings (`src/map/posteriorLayer.ts`), and a live readout card
  (candidate area, spread/entropy meter, mode count, geometry) — broad when indicators
  disagree, bimodal when the data supports two origins, never a fake pinpoint.
- **Files + offline (v5).** JSON export/import (validated, no accounts), an installable
  offline-first PWA (service worker caches the app shell + tiles), the "Load demo" Colorado
  presets (Marshall + a conflicting case) and "Clear", all on-system.

## Decided

- **Platform:** web app / installable PWA (open a URL, works iOS + Android).
- **Map:** Leaflet + OpenStreetMap (free, no API key).
- **Estimator:** an **honest posterior**, not an oracle. Fire pattern indicators carry large
  directional error (~80–106°, Parker & Babrauskas 2024), so the app shows a probability field
  with credible regions that stays broad when indicators disagree, and never prints a bare
  coordinate. Von Mises grid posterior (`CRESEARCH.md` §1.3).
- **Offline is a baseline.** The app installs and runs offline after first load; nothing blocks
  on the network. True field-grade offline **vector** basemaps (PMTiles + MapLibre,
  `SOURCES.MD` §9) are a later field-mode item — v0 opportunistically caches raster tiles.
- **No accounts.** Persistence and sharing are **files** — export/import an investigation as a
  JSON file.

## Roadmap

- [x] **v0 — Desk engine + full UI** (`UPDATELOGV1.md`–`UPDATELOGV5.md`). Shipped: Leaflet map,
  indicator nodes with an azimuth + σ on the compass-ring dial, ENU geometry core, von Mises
  grid posterior rendered as stepped credible-region bands + candidate area + mode count,
  offline PWA, and JSON export/import — all wearing the mockup's field-instrument skin in
  light/dark. Demo: "Load demo" seeds the Marshall origin and shows a 95% region that
  **contains** it (honestly broad, ~19 M m²), plus a conflicting preset that reads bimodal.
- [ ] **v1 — Field mode.** Live GPS + fused compass, WMM2025 declination + magnetic-anomaly
  detector, stability gate + two-point GNSS bearing mode (`CRESEARCH.md` §2). Wire the same
  store, ENU core, posterior, and design system to live phone sensors, storing raw azimuth,
  declination, and circular-SD separately per node.
- [ ] **v2 — Macro constraints.** Macro indicators as priors, GOA→SOA workflow
  (`CRESEARCH.md` §4.1). Offline vector basemaps (PMTiles).
- [ ] **v3 — Forward model + real exports.** Slope-aware Rothermel back-projection
  (`CRESEARCH.md` §4.2–4.3); GeoPackage / KML / PDF report export (§5).

## Next action

Start **v1 field mode**: live GPS + fused device compass, WMM2025 declination + a
magnetic-anomaly detector, the stability gate + two-point GNSS bearing mode (`CRESEARCH.md`
§2). Store raw azimuth, declination, and circular-SD separately per node so the desk and field
paths share one estimator.
