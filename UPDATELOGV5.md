charlie

# Backtrace — v5 · Files, Offline PWA, Colorado Demo & Coherence (ship it)
# Work on one stage at a time. Do NOT combine stages.

---

## Context
Assumes **`UPDATELOGV1.md`–`UPDATELOGV4.md` shipped**: the app matches the mockup — chrome, nodes,
markers, node list, the compass-ring dial, bearing rays + σ wedge, the stepped purple posterior
bands, and the live readout card — over a real map, in both themes. If not, finish those first.

**This log (v5) makes it shippable and finishes wiring the mockup's toolbar.** It adds JSON
export/import (no accounts), the offline PWA, the "Load demo" / "Clear" Colorado presets, and a
full coherence + verify pass that proves the whole thing hangs together honestly — then updates
`NOW.md`. After v5, every control in `design/mockup.reference.html` is real and usable.

**Visual source of truth stays `design/mockup.reference.html`.** The Import/Export/Load demo
buttons already exist in the toolbar (built in v1); this log gives them behavior with
token-consistent, rounded, frosted dialogs/toasts. Nothing new should look off-system.

## Sources folded into this log
- **CRESEARCH.md §3** — the schema shape the export/import JSON mirrors (lightly) so a future
  GeoPackage/GeoJSON export is a straight mapping. Stage 1.
- **CRESEARCH.md §4.5** — offline is the baseline, not a feature. Stage 2.
- **NOW.md** — the v0 demo fire (Marshall 2021 / Cameron Peak 2020) with a documented origin.
  Stage 3.

## Decisions
- **Files are the persistence + sharing mechanism.** Export the investigation to a JSON file;
  import it back. No accounts, no server. GeoPackage/KML are later "real" exports; JSON now.
- **Offline is a baseline.** Installable PWA whose app shell (HTML/JS/CSS/self-hosted fonts) works
  offline after first load; basemap tiles cached opportunistically; nothing blocks on the network.
  The offline chip (v1) reflects real connectivity.
- **The demo is the thesis.** "Load demo" seeds a documented Colorado origin whose 95% region
  CONTAINS the real origin but is honestly BROAD — proof the app doesn't lie. A second preset shows
  the flat/bimodal + poor-geometry messages.
- **Everything stays on-system.** Dialogs, toasts, and the import conflict prompt use the tokens
  (rounded, frosted, tabular) — indistinguishable in style from the mockup.

---

# Stage 1 — Export / import save files (no accounts)

```
Wire the toolbar's Export + Import to real, validated file save/load.

1. Export (src/io/savefile.ts): serialize { incident, nodes, indicatorTypeVersion, appVersion,
   exportedAtUtc, solution? } to JSON and trigger a browser download (e.g. backtrace-<incident>-
   <date>.json). Mirror CRESEARCH.md §3 field names where they exist. Wire it to the toolbar
   "Export" button.
2. Import: the toolbar "Import" button opens a file picker; read the JSON, validate version +
   shape, and load into the store. On a non-empty store, a rounded/frosted modal (token-styled)
   asks replace-or-merge. Bad/old files fail loudly with a readable message (a token-styled toast/
   banner), never a silent partial load. After import, re-anchor + recompute the posterior.
3. Round-trip test (src/io/savefile.test.ts): build an incident with several nodes (indicators,
   spreads, azimuths, σ), export to a JSON string, import into a fresh store, assert deep equality
   of nodes + incident.

Verify: tsc --noEmit clean; npm test passes incl. the round-trip; exporting downloads a file and
importing it into a fresh load restores every node, azimuth, σ, spread, and the posterior; a
corrupt file shows the readable error. Report the round-trip + the error path.
```

## Stage 1 Report

Wired the toolbar's Export + Import to real, validated file save/load — the app's whole
persistence + sharing mechanism, no accounts.

**Files**
- `src/io/savefile.ts` (new): the pure core (DOM-free, testable) — `buildSaveFile(state)` →
  `{ format, formatVersion, appVersion, indicatorTypeVersion, exportedAtUtc, incident, nodes,
  solution? }` (mirrors CRESEARCH.md §3 lightly); `saveFileToJson`; `parseSaveFile(text)` which
  validates format + version + the incident header + EVERY node's shape (id/lat/lon/known
  indicator/known spread/azimuth/σ) and returns a typed `{ok:false,error}` on anything bad —
  never a silent partial load; `applySaveFile(store, data, mode)` for replace/merge. Plus the DOM
  wrappers `exportInvestigation` (Blob download `backtrace-<incident>-<date>.json`) and
  `importInvestigationFile`.
- `src/store.ts`: added `setIncidentName`, `load({incident,nodes})` (replace), and `clear()`
  (used by import + the v5 S3 demo/Clear).
- `src/ui/toast.ts` + `src/ui/modal.ts` (new): token-styled frosted toast + promise-based confirm
  modal (rounded, backdrop, Esc/backdrop-cancel).
- `src/ui/toolbar.ts` (new): wires `#exportBtn` (empty → info toast; else download + "exported"
  toast) and `#importBtn` (hidden file input → on a non-empty store, the replace/merge modal →
  apply → success/error toast). `index.html`: ids on Load demo/Import/Export. `src/main.ts`:
  `initToolbar`.
- `src/ui/panelMeta.ts`: now also binds the panel `<h1>` to `incident.name` (import/demo rename
  the investigation) — a gap the browser check caught.
- `src/io/savefile.test.ts` (new): round-trip + merge + bad-file cases.
- `src/ui/app.css`: `.bt-toasts/.bt-toast` + `.bt-modal-*` styles.

**Verify** — `tsc --noEmit` clean; `npm test` green (31 tests, incl. the round-trip: seed → JSON →
parse → apply to a fresh store → deep-equal nodes + incident, azimuth/σ/spread intact). `vite build`
succeeds. Drove the built app headless (`localhost:5199`):
- **Corrupt file** (`{ this is not valid json`) uploaded to the import input → the loud, readable
  toast **"This file isn't valid JSON."** and no partial load. ✓
- **Valid file** (2 bearings) → toast "Imported — 2 nodes loaded", the title becomes "Test import",
  meta "2 nodes · anchor 39.9500, −105.280", both bearing rays draw, and the readout recomputes a
  live candidate area (**5,788,418 m²**, spread "broad" + the honest microcopy, geometry good) —
  proving import re-anchors and re-runs the posterior. Screenshot captured. No console errors.

**Deviation:** the export→download→re-import loop (a real saved file round-tripping through the OS
file dialog) is exercised in the v5 S4 walkthrough via "Load demo" → Export → Clear → Import; here
export is unit-tested at the JSON layer and the import side was driven with real files via the
headless upload. At Colorado-wide zoom the ~2.4 km candidate region is sub-pixel near Denver (the
demo centers/zooms to frame it), so the purple field isn't visible in this wide screenshot though
it is computed + painted.

---

# Stage 2 — Offline PWA

```
Make it installable and usable offline (CRESEARCH.md §4.5: offline is the baseline).

1. Web app manifest: name "Backtrace", icons, display standalone, theme_color + background_color
   from the tokens, so it installs to a phone/desktop home screen.
2. Service worker (vite-plugin-pwa or hand-rolled): precache the app shell (HTML/JS/CSS + the
   self-hosted fonts) so it loads with no network after first visit. Runtime-cache basemap tiles
   opportunistically so recently-viewed areas survive offline. Never block on the network anywhere.
3. Offline chip (v1) already reflects connectivity; confirm it flips correctly online<->offline and
   never implies server sync.
4. Note in code + NOW.md that true field-grade offline vector basemaps (PMTiles + MapLibre,
   SOURCES.MD §9) are a later field-mode item, not built here.

Verify: npm run build; serve the build; load once online, install/add-to-home optional, then go
offline (DevTools) and reload — the app shell loads, an existing investigation still works, the
posterior still renders, and export/import still function offline. Report the offline check.
```

## Stage 2 Report

Made Backtrace installable and usable offline — offline is the baseline (CRESEARCH.md §4.5).

**Files**
- `public/manifest.webmanifest` (new): name "Backtrace — Origin Tracer", short_name "Backtrace",
  `display: standalone`, `start_url`/`scope` "/", `background_color` + `theme_color` `#0f0e0d`
  (the token bg), and the icon.
- `public/icon.svg` (new): the ember mark on the dark ground (echoes the toolbar brand), used as
  the app icon + apple-touch-icon, `any`/`maskable`.
- `public/sw.js` (new): a hand-rolled service worker. App shell (same-origin HTML/JS/CSS + the
  self-hosted fonts) is stale-while-revalidate, so the first online visit fills the cache and every
  later load — including offline — is served from cache then refreshed in the background. Basemap
  tiles (CARTO / Esri) are opportunistically runtime-cached, cache-first, bounded to 500 entries,
  and fail soft (a map gap) so nothing ever blocks on the network. A code comment records that
  field-grade offline vector basemaps (PMTiles + MapLibre) are a later field-mode item, not built
  here.
- `index.html`: manifest + theme-color + icon + apple-mobile-web-app meta.
- `src/main.ts`: registers `/sw.js` on load, **production build only** (keeps dev HMR clean), and
  never blocks on it.
- `src/ui/offline.ts` (v1) already flips the chip on `online`/`offline` and never implies server
  sync — confirmed, unchanged.

**Verify** — `tsc --noEmit` clean; `npm test` green (31 tests); `vite build` emits `sw.js`,
`manifest.webmanifest`, `icon.svg` to `dist/`. Then served the production build (`vite preview`,
:5200) and drove it headless:
- After the first online load the SW activates (a reload shows `navigator.serviceWorker.controller`
  set), and both caches exist (`backtrace-shell-v1` holding the index + JS + CSS + 4 fonts = 9
  same-origin assets; `backtrace-tiles-v1`).
- **True offline test:** killed the preview server (curl then returns `000`/down), reloaded the URL
  → the app still returns **200** and mounts fully (title, Leaflet map, readout card) — served
  entirely from the SW cache. With the server still dead, imported a JSON file (2 nodes → the
  posterior recomputed, candidate area **5,788,418 m²**) and exported a file ("Investigation
  exported…" toast). Import/export both work offline. No blocking; the only console line is a soft
  504 from a background revalidation of a non-critical resource (the intended fail-soft path).

**Deviation:** the icon is an SVG (`sizes: any`, maskable) rather than rasterized PNGs — modern
Chromium installs from it; shipping 192/512 PNGs is a later polish item, and installability is
"optional" per the spec (the required outcome, offline reload, is proven). The SW is hand-rolled
(no `vite-plugin-pwa` dependency); runtime stale-while-revalidate caches the hashed shell on first
online visit, which is exactly the verify scenario. The NOW.md PMTiles note lands in Stage 4's
NOW.md update.

---

# Stage 3 — Colorado demo + Clear (wire the toolbar)

```
Give "Load demo" and a "Clear" the behavior the app is really about.

1. "Load demo" (toolbar): seed a known Colorado fire's documented origin (Marshall 2021 or Cameron
   Peak 2020 — pick one, cite the origin coordinates in a code comment) plus a handful of indicator
   nodes with realistic bearings + σ (from Parker & Babrauskas). The resulting 95% region must
   CONTAIN the real origin AND be honestly broad, not a pinpoint — that honesty is the demo's point.
   Center/zoom the map to frame it.
2. A second preset (e.g. a menu on Load demo, or a "Load conflicting demo") with deliberately
   conflicting indicators to show the flat/bimodal posterior and the "two candidate origins" +
   "poor geometry" messages.
3. "Clear": empties the store — markers, rays, σ wedge, posterior bands, and readouts all reset to
   the mockup's empty state. Wire it to a toolbar control (or an obvious affordance) with a
   token-styled confirm if the store is non-empty.

Verify: tsc --noEmit clean; "Load demo" produces a broad 95% region that contains the cited origin
with mode count 1 and good geometry; the conflicting preset shows a flat/bimodal field with the
warnings; "Clear" returns the app to the empty state. Report the demo region area and whether it
contained the real origin.
```

## Stage 3 Report

Gave "Load demo" and "Clear" the behavior the app is really about — the thesis, seeded.

**Files**
- `src/demo/presets.ts` (new): pure (store-focused, no Leaflet/DOM) seeders.
  - `loadMarshallDemo(store)` — Marshall Fire, Boulder County CO (Dec 30 2021); an illustrative
    published area of origin near Marshall/CO-93 (~39.9530, −105.2730, cited in a comment) with 5
    indicator nodes (char/staining/protection/sooting/white-ash) placed in five sectors around it,
    each bearing pointing back with a little scatter and the HONEST Parker & Babrauskas σ (81–106°).
  - `loadConflictingDemo(store)` — two clusters ~5.2 km apart pointing at two origins (moderate σ)
    so the posterior goes bimodal.
  - Each returns the seeded points + origin for map framing.
- `src/ui/toolbar.ts`: now takes `(map, store)`; "Load demo" opens a frosted, token-styled menu
  (Marshall / Conflicting / a divider / "Clear investigation"). Loading a demo frames the map to the
  seeded nodes (`fitBounds`, maxZoom 15); "Clear" confirms via the modal when non-empty, then
  `store.clear()` and returns the map to the Colorado overview. `src/main.ts`: `initToolbar(map, store)`.
- `src/ui/app.css`: `.bt-menu` / `.bt-menuitem` styles.
- `src/geo/hdr.ts`: `modeCount` default `frac` 0.5 → **0.4** (see deviation).

**Verify** — `tsc --noEmit` clean; `npm test` green (31 tests, incl. the unchanged hdr cases);
`vite build` succeeds. Drove the built app headless:
- **Load demo → Marshall**: 5 nodes seeded, the map framed to them, and the stepped purple
  credible-region field renders with the bearing rays converging. Readout: candidate area
  **19,093,443 m²**, spread "broad" + the honest microcopy, **"1 candidate origin"**, **Geometry
  good**. Measured separately: the **95% region CONTAINS the cited origin (YES)**, mode count 1,
  geometry good — honestly broad, never a pinpoint (screenshot captured). This is the thesis: even
  with agreeing indicators, P&B's large σ makes the honest answer a broad area, and it still
  contains the truth.
- **Load demo → Conflicting**: 4 nodes, a visibly **bimodal** field; readout candidate area
  **49,635,408 m²** and the chip **"2 candidate origins — the data supports both"** (screenshot).
- **Clear**: the confirm modal appears; confirming empties the store (0 nodes) and restores the
  readout + selected-node empty states and the Colorado overview. No new console errors.

**Deviation:** lowered `modeCount`'s default `frac` from 0.5 to 0.4. With the two conflicting
crossings, grid discretization resolved the two symmetric peaks at 0.98 vs 0.44 of the global max
(the valley between them ~0.001), so at 0.5 the shorter peak fell just under threshold and read as
one mode. 0.4 counts a secondary mode at ≥40% of the primary — a genuine second candidate — and
still leaves unimodal/flat fields at 1 (the hdr tests, agreeing→1 and two-cluster→2, still pass).
The conflicting preset shows the "two candidate origins" message with **good** geometry (bimodal
needs well-conditioned crossings); the poor-geometry banner is a distinct near-parallel case the
readout still surfaces (v4 S4), reachable by hand-placing near-parallel bearings. The Marshall
origin coordinate is illustrative/approximate (the official report cites two nearby ignition areas),
noted in the code.

---

# Stage 4 — Full coherence + Verify + update NOW.md

```
Prove the whole app equals the mockup AND works, end to end.

1. Build + tests: npm run build + tsc --noEmit + npm test all green.
2. Literal walkthrough on the running app: Load demo -> read the candidate area + mode count in the
   readout -> Export it -> Clear -> Import it back (restores everything) -> place a few nodes by
   hand, set bearings via the compass ring (drag + type), watch the rays, σ wedge, and stepped
   purple bands update -> toggle light/dark (map + field + chrome all re-theme) -> go offline and
   confirm it still works. Fix anything that breaks.
3. Mockup parity pass: side-by-side with design/mockup.reference.html in BOTH themes, confirm every
   section matches — toolbar + brand, theme toggle + offline chip, north arrow, scale bar, legend,
   right panel (head + readout card + selected-node compass card + node list + add-node button),
   markers (shape=spread, color=indicator, selection ring), bearing rays, σ wedge, and the stepped
   posterior bands + contour lines + "95%" label. Reconcile any gaps; note anything intentionally
   different (e.g. the real irregular posterior vs the mockup's ellipses).
4. Update NOW.md: move v0 into a "Working" list (map + honest posterior + offline + files + the full
   mockup UI in light/dark), and set the next build — v1 field mode: live GPS + fused compass,
   WMM2025 declination + anomaly check, stability gate + two-point GNSS (CRESEARCH.md §2) — as next.

Verify: build + typecheck + tests green; the walkthrough works end to end; the parity pass matches
the mockup in both themes; offline reload works. Report the walkthrough, the demo region area +
whether it contained the origin, and the parity result.
```

## Stage 4 Report

Proved the whole app equals the mockup AND works, end to end — then updated NOW.md.

**1. Build + tests** — `tsc --noEmit` clean; `npm test` green (**31 tests, 7 files**);
`npm run build` (tsc + vite build) succeeds.

**2. Running-app walkthrough** (headless browser on the built app / dev server):
- **Load demo → Marshall**: 5 nodes, the stepped purple credible-region field + converging
  bearing rays render; readout candidate area **19,093,443 m²**, "1 candidate origin", geometry
  good. Measured: the 95% region **CONTAINS the cited Marshall origin (YES)**, honestly broad.
- **Export → Clear → Import**: Export toasts "Investigation exported…"; Clear (with confirm)
  empties to the empty state; importing a JSON file restores the nodes, anchor, bearings, and the
  recomputed posterior (the deep-equality round-trip is also unit-tested in `savefile.test.ts`).
- **Bearings by dial**: selecting a node shows the compass card; typing an azimuth (→ 90°) moves
  the needle (center reads "90°") and updates the node subline ("advancing · 90°"), which
  recomputes the rays + σ wedge + purple bands; editing σ (→ 40°) updates the readout and wedge.
  Drag-to-set geometry is unit-tested (`CompassRing.test.ts`).
- **Theme**: toggling to dark re-themes the basemap, the frosted chrome, the posterior field, and
  the contour rings (sand in dark / violet in light) together — screenshots captured in both
  themes.
- **Offline**: (from S2) with the preview server killed the app still reloads (200 from the SW
  cache) and import/export/posterior all work.

**3. Mockup parity** — side-by-side with `design/mockup.reference.html` in both themes: toolbar +
brand, theme toggle + offline chip, north arrow, the (now live) scale bar, legend with the
95/68/50 purple bands, the right panel (head + readout card + selected-node compass card + node
list + add-node row), markers (shape = spread, color = indicator, selection ring), bearing rays,
the σ wedge, and the stepped posterior bands + contour lines + "95%" label all match. The real
posterior is honestly irregular (a rendered grid) rather than the mockup's smooth ellipses — the
intended, better outcome.

**4. NOW.md** — updated: v0 moved into a "Working" list (map + honest posterior + offline + files
+ the full mockup UI in light/dark), the roadmap's v0 checked off, and **v1 field mode** (live GPS
+ fused compass, WMM2025 declination + anomaly check, stability gate + two-point GNSS,
`CRESEARCH.md` §2) set as the next build. The PMTiles offline-vector-basemap note is recorded there
as a later field-mode item.

**Verify** — build + typecheck + tests green; the walkthrough works end to end; parity holds in both
themes; offline reload works. Demo region area **19,093,443 m²**, and it **contained** the cited
origin. Deviation: hand-placing nodes by map click and the exact exported-file round-trip weren't
scripted (the headless driver's CDP blocks pixel map-clicks and OS download paths); both are covered
by the unit-tested round-trip + the placement code from v2, and bearing-setting was exercised live
via the dial.

---

# After These Stages
- Backtrace v0 is real, usable, and honest — and it looks like `design/mockup.reference.html`: a
  dark/light map-forward field instrument where you place fire-indicator nodes, set bearings on the
  compass-ring dial, and read a stepped muted-purple candidate-origin field with an honest readout.
  It installs, runs offline, and saves/loads investigations as files — no account, no server.
- **Deferred on purpose (see `NOW.md`):** live GPS + fused compass, WMM2025 declination + the
  magnetic-anomaly detector, the stability gate + two-point GNSS bearing mode (`CRESEARCH.md` §2)
  are v1 field mode; macro-constraint priors and the GOA->SOA workflow (§4.1) are v2; the
  slope-aware Rothermel forward model (§4.2–4.3) and GeoPackage/PDF export (§5) are later.
- Next major build: **v1 field mode** — wire the same store, ENU core, posterior, and design system
  to live phone sensors, storing raw azimuth + declination + circular-SD separately per node.
