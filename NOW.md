# Now

Current status of the app. Updated as things change.

**Last updated:** 2026-07-13

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
- **Field mode (V9).** Backtrace is now a field instrument for real: capture a node from where you
  **stand in the burn**. A frosted, big-tap-target capture panel takes a **live GPS fix** (averaging a
  stationary burst for a tighter, honest accuracy — `src/sensors/geo.ts`, `src/map/livePosition.ts`)
  and writes a court-grade node with `positionSource DEVICE` / `fixType GNSS` / real `hAccuracyM`
  (DOP/satCount left null — not exposed by the web API, never faked). Bearing is then set by one of
  three methods, recommended-first: the **two-point GNSS bearing** (`src/geo/twoPointBearing.ts`) —
  stand → fix A → walk 15–30 m → fix B → geodesic azimuth with σ propagated from fix accuracy +
  baseline (~12° for a 20 m / 3 m capture), **magnetometer-free and the primary path**; a **caveated
  device compass** (`src/sensors/compass.ts`) with a loud informed-consent banner, a ~2 s circular-
  mean/SD window, tilt rejection, and a **>15° compass-vs-two-point interference flag** that keeps the
  two-point value; or the **manual** dial. **WMM2025 declination** is computed on-device from the
  bundled official NOAA coefficients (`src/geo/wmm.ts`, `wmm2025cof.ts`, degree-12 spherical harmonics,
  matches NOAA to <0.01°) to convert magnetic→true, with raw magnetic + declination + model/epoch +
  derived true stored **separately**. Every capture writes to the append-only record immediately (V6),
  flows unchanged through the ENU core, posterior, HDR readout, and V7 exports (the PDF node table shows
  each node's method + accuracy), and works offline.

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
- [x] **v1 — Field mode** (`UPDATELOGV9.md`). Shipped: live GPS capture (averaged, honest
  accuracy), offline WMM2025 declination from the bundled NOAA coefficients, the two-point GNSS
  bearing as the primary magnetometer-free path, a caveated device compass with a >15°
  interference cross-check, and a capture flow that writes raw azimuth + declination + circular-SD
  separately into the append-only record. **Deferred on purpose (native-shell, disclosed in the
  UI):** the full magnetic-QC suite — accuracy-gated capture, uncalibrated hard-iron/anomaly
  detection, the WMM total-field anomaly detector, and the figure-8 calibration gate
  (`CRESEARCH.md` §2.2–2.3) — because a PWA cannot read magnetometer accuracy status, hard-iron
  bias, or raw field magnitude honestly. The web build discloses this and steers to two-point GNSS.
- [ ] **v2 — Macro constraints.** Macro indicators as priors, GOA→SOA workflow
  (`CRESEARCH.md` §4.1). Offline vector basemaps (PMTiles).
- [ ] **v3 — Forward model + real exports.** Slope-aware Rothermel back-projection
  (`CRESEARCH.md` §4.2–4.3); GeoPackage / KML / PDF report export (§5).

## Next action

Start **V10 — Macro Priors (GOA→SOA)**: fold macro evidence in as Bayesian **priors** where
`CRESEARCH.md` §4.1 says most of the actual information lives. A macro constraint (a V apex, burn
perimeter, witness first-smoke cone, first-report location, exclusion zone) is a region-shaped
prior over the origin, not a ray — `log_post = log_prior_from_macro + Σ log_likelihood_micro`, with
a hard invariant that no macro constraints = byte-for-byte the v0 result. Add the append-only
constraint model + store, the prior field, its fusion into the posterior, the GOA→SOA drawing
tools, and inclusion in the exports. **Field mode (V9) is complete** — the app now captures a node
from where you stand (live GPS + honest bearing) into the append-only record and carries it through
the court-ready exports. (After V10: the slope-aware forward model + wind — `CRESEARCH.md`
§4.2–4.4 — the next major, explicitly deferred, research-grade build.)
