# Now

Current status of the app. Updated as things change.

**Last updated:** 2026-07-11

## Stage: Planning

No code yet. Concept, scope, tech, and the estimator approach are set; the domain and
architecture research is written up (`CRESEARCH.md`, `SOURCES.MD`). Next step is the v0
desk engine — staged in `UPDATELOGV1.md`.

## Decided

- **Platform:** web app / installable PWA (open a URL, works iOS + Android).
- **Map:** Leaflet + OpenStreetMap (free, no API key).
- **Build order:** desk-first — map + geometry + estimator run on manually placed points
  before any live sensors.
- **Estimator:** an **honest posterior**, not an oracle. Fire pattern indicators carry
  ~103° mean directional error (Parker & Babrauskas 2024), so the app shows a probability
  field with credible regions that stays broad when indicators disagree, and never prints
  a bare coordinate. Von Mises grid posterior (`CRESEARCH.md` §1.3).
- **Offline is a baseline.** The app installs and runs offline after first load; nothing
  blocks on the network.
- **No accounts.** Persistence and sharing are **files** — export/import an investigation
  as a JSON file. This is what lets anyone use it without a server.

## Roadmap

- [ ] **v0 — Desk engine + full UI** (`UPDATELOGV1.md`–`UPDATELOGV5.md`, built to match
  `design/mockup.reference.html`). Leaflet map, manually placed indicator nodes with an azimuth +
  angular uncertainty set on a compass-ring dial, ENU geometry core, von Mises grid posterior
  rendered as stepped muted-purple credible-region bands (50/68/95%) + candidate area + mode count,
  offline PWA, and JSON export/import — all wearing the mockup's dark/light field-instrument skin
  (ember chrome, frosted panels, the legend/readout/node-list). Split across five logs: **v1**
  scaffold + design system + shell, **v2** nodes + markers, **v3** bearings + compass dial, **v4**
  posterior + heatmap bands + readouts, **v5** files + PWA + Colorado demo + coherence. Demo: load
  a documented Colorado fire origin and show a credible region that *contains* it (honestly broad,
  not a pinpoint).
- [ ] **v1 — Field mode.** Live GPS + fused compass, WMM2025 declination + magnetic-anomaly
  detector, stability gate + two-point GNSS bearing mode (`CRESEARCH.md` §2). Store raw
  azimuth, declination, and circular-SD separately per node.
- [ ] **v2 — Macro constraints.** Macro indicators as priors, GOA→SOA workflow
  (`CRESEARCH.md` §4.1). Offline vector basemaps (PMTiles).
- [ ] **v3 — Forward model + real exports.** Slope-aware Rothermel back-projection
  (`CRESEARCH.md` §4.2–4.3); GeoPackage / KML / PDF report export (§5).

## In progress

- Adding sources (done: `SOURCES.MD`). Canonical refs: NWCG PMS 412; Parker & Babrauskas
  2024 (the validation study driving the reframe).
- Picking a v0 demo fire with a documented origin (Marshall 2021 / Cameron Peak 2020).

## Next action

Pick one real Colorado fire, note its published origin coordinates and 3 expected
indicators + rough bearings and sigmas. That becomes the v0 demo/test case before writing
code (Stage 8 of `UPDATELOGV1.md`).
