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

_Pending._

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

_Pending._

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

_Pending._

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

_Pending._

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
