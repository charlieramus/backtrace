# Now

Current status of the app. Updated as things change.

**Last updated:** 2026-07-12

## Stage: v0 shipped — desk engine + full UI, court-grade record (V6), court-ready export (V7)

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
- **Defensible record (V6).** Every node is now a court-grade, **append-only** record: the
  CRESEARCH.md §3 schema (position/orientation provenance, sensor QC, domain, chain-of-custody
  fields — nullable, desk-defaulted to MAP_PIN/MANUAL), corrections that **supersede** rather than
  mutate, removals that **void** with a stated reason (never delete), a **SHA-256 record hash** per
  row + an investigation **manifest hash** verified on import, and an **append-only audit log**
  (CREATE/SUPERSEDE/VOID/EDIT_INCIDENT/IMPORT). Save format **v2** carries the full history +
  investigator + audit + hashes; **v1 files upgrade loudly** (a token-styled notice) and re-verify
  clean. The desk UX is unchanged — Load demo still computes the same ~19 M m² Marshall region.
- **Court-ready export (V7).** Every export runs off one **versioned origin solution**
  (`src/geo/solution.ts`) — a reproducible snapshot of the posterior run (algorithm `GRID_VONMISES_V1`
  + params + inputs + the HDR 50/68/95 regions in WGS84 + area/entropy/mode count), persisted on the
  store and carried in the v2 save file. The **Export** menu emits five formats, all **fully offline**:
  the JSON investigation, **GeoJSON** + **KML** (pure), a **GeoPackage** (`.gpkg` via bundled `sql.js`
  wasm — opens natively in QGIS/ArcGIS Pro), and a **court-ready PDF** (`pdf-lib`) with a self-drawn ENU
  schematic, a node table, and a **methodology appendix disclosing the ~103° known indicator error
  rate** (Parker & Babrauskas 2024). No export ever prints a bare coordinate — always a candidate AREA
  with its confidence, algorithm + version, and node count; each appends an `EXPORT` audit entry.
- **In-app About / methodology (V8).** An info affordance in the chrome opens a full-screen, token-styled
  **About overlay** (`src/ui/About.ts`) that states the app's honesty in plain language: what Backtrace
  is, Charlie's author's note on *why* it exists (indicators carry ~103° of directional error, so a
  confident dot would be lying — the restraint IS the product), the **honesty premise** (a probability
  field, broad when indicators disagree, bimodal when the data supports two origins, never a bare
  coordinate), an **investigator-readable account of the math** (ENU tangent plane, the von Mises grid
  posterior with κ-from-σ and a 15% outlier mix, HDR credible regions, why-not-Kalman — cross-linked to
  the live readout labels), and the **sources** (Parker & Babrauskas first, then NWCG PMS 412, NFPA 921,
  WMM2025, Karney/GeographicLib, Rothermel/Andrews, Fisher). It themes light/dark, uses no network or
  external assets (fully offline), and agrees in substance with the V7 PDF methodology appendix. This
  **completes the Defensible-Record set (V6 schema → V7 export → V8 about).**

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

Start **V9 — Field Mode**: wire the same store, ENU core, posterior, and design system to live
phone sensors (GPS + fused/honest compass, WMM2025 declination + magnetic-anomaly detector,
stability gate + two-point GNSS bearing mode — `CRESEARCH.md` §2), filling the provenance fields
the V6 record and V7 exports already carry, so the app can be used standing in the burn, not just
at the desk. The **Defensible-Record set (V6 schema → V7 export → V8 about) is complete** — the
app now computes an honest posterior, exports it court-ready, and explains itself in-app. (After
V9: **V10** macro-constraint priors and the GOA→SOA workflow, and their inclusion in the exports.)
