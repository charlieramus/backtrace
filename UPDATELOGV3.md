charlie

# Backtrace — v3 · Bearings, ENU Geometry & the Compass-Ring Dial
# Work on one stage at a time. Do NOT combine stages.

---

## Context
Assumes **`UPDATELOGV1.md` + `UPDATELOGV2.md` shipped**: the app shell matches the mockup's empty
state, and nodes can be placed, shown as spread-shaped/indicator-colored markers, listed, selected,
and removed. If not, finish those first.

**This log (v3) gives every node a direction and builds the geometry core.** It adds the pure ENU
tangent-plane math, an azimuth per node, the **signature compass-ring dial** from the mockup
(drag to set the bearing; a σ wedge shows the angular uncertainty), and draws each node's
**bearing ray** plus the selected node's **σ wedge** on the map — exactly as the mockup does. This
is what the v4 posterior consumes. No posterior/heatmap yet.

**Visual source of truth stays `design/mockup.reference.html`.** Match the compass dial (the
`compass()` function — ring, ticks, cardinal N, the vermillion σ wedge, the ember needle, the
center degree reading), the "Selected node · bearing" card (`.selnode`, `.compass-wrap`,
`.selfields`, the drag hint), the bearing rays and the selected σ wedge (`drawNodes` /
`drawMarker` — colored rays fading out, the low-opacity vermillion wedge).

## Sources folded into this log
- **CRESEARCH.md §1.1** — ENU local tangent-plane geometry; do all math in meters, convert to
  lat/lon only at the display boundary. The azimuth unit vector is d = (sin az, cos az) with sin
  on East and cos on North. Stage 1.
- **CRESEARCH.md §0 / Parker & Babrauskas 2024** — σ is large (~80–106°); the dial's σ wedge must
  show that honestly (a wide fan), so the user feels how little one indicator constrains direction.

## Decisions
- **Pure, tested ENU core** (`src/geo/enu.ts`), no Leaflet/DOM. The map + dial call into it; never
  the reverse. Session anchor = the first node (set in v2), chosen once.
- **Azimuth is true-north degrees clockwise, 0–359.** At desk scale, treat map north as true north
  and note the limitation in a comment (WMM declination is a later field-mode concern).
- **The compass ring is the signature control.** Reproduce the mockup's dial precisely, and make it
  usable: dragging sets the bearing; a numeric input stays in sync; the σ wedge half-width = the
  node's σ. Editable σ per node (defaults from the indicator prior).
- **Rays + wedge are Leaflet layers** (polyline per node; polygon for the selected σ wedge),
  geo-anchored via the ENU core, styled to match the mockup (indicator-colored ray fading out;
  vermillion low-opacity wedge; the selected ray thicker/solid, others thin/dashed).

---

# Stage 1 — ENU tangent-plane core (pure, tested)

```
Build the geometry the whole app stands on (CRESEARCH.md §1.1). No Leaflet, no DOM.

1. src/geo/enu.ts: geodeticToEcef(lat,lon,h), ecefToEnu(p, p0, lat0, lon0) with WGS84 constants,
   and helpers enuFromLatLon(lat,lon, anchor) + its inverse enuToLatLon(e,n, anchor). Anchor is
   the session anchor (first node) from the store.
2. Azimuth helpers: azToUnitEnu(azDeg) -> { e: sin, n: cos } (per §1.1), and projectAlong(anchor,
   fromLatLon, azDeg, meters) -> latLon for drawing a ray a fixed ground distance out.
3. Unit tests (src/geo/enu.test.ts): a known lat/lon round-trips through ENU and back to sub-meter;
   azToUnitEnu points due-North for az=0 and due-East for az=90; projectAlong at az=90 moves East.

Verify: tsc --noEmit clean; npm test passes incl. the ENU round-trip + azimuth tests. Report the
tests and the round-trip error you observed. This stage ships NO UI.
```

## Stage 1 Report

Built the pure ENU tangent-plane core the rest of the app stands on — no Leaflet, no DOM.

**Files**
- `src/geo/enu.ts` (new): WGS84 forward/inverse geodetic↔ECEF (`geodeticToEcef`,
  `ecefToGeodetic` via 6-pass Bowring iteration), the ENU rotation pair
  (`ecefToEnu` / `enuToEcef`) about a tangent-plane origin, the session-anchor helpers
  `enuFromLatLon(lat,lon,anchor)` + inverse `enuToLatLon(e,n,anchor)`, and the azimuth
  helpers `azToUnitEnu(azDeg) -> {e:sin, n:cos}` (§1.1 convention: East=sin, North=cos,
  clockwise from true north) and `projectAlong(anchor, from, azDeg, meters) -> latLon`.
  All math is in meters; lat/lon only at the boundary. A comment documents the desk-scale
  limitation (map north treated as true north; WMM declination is v1 field-mode).
- `src/geo/enu.test.ts` (new): round-trip, azimuth, and projection tests.
- `src/geo/index.ts`: now `export * from "./enu"` (was a placeholder).

**Verify** — `tsc --noEmit` clean; `npm test` green (17 tests, 3 files).
- Round-trip: a point 1.45 km NE of the Marshall anchor (ENU e=1110.75 m, n=932.76 m)
  returns to lat/lon with **3.7×10⁻⁵ m (~37 µm)** error — far below the sub-meter bar.
  The anchor itself round-trips to <1e-6 m offset.
- `azToUnitEnu(0)` = (0,1) due North; `azToUnitEnu(90)` = (1,0) due East; 180→−N, 270→−E.
- `projectAlong` at az=90 moves due East (lon↑, lat fixed); at az=0 due North (lat↑).

**Deviation:** the `projectAlong` distance check is asserted as a 990–1010 m band rather
than exact-1000, because the *test's* reference distance is a spherical haversine while the
ENU projection is WGS84-ellipsoidal — a ~2 m/km formula mismatch, not an ENU error (the
37 µm round-trip proves the transform). No UI shipped this stage, as specified.

---

# Stage 2 — Azimuth + σ per node, and the compass-ring dial

```
Give the selected node a bearing via the mockup's signature dial. Match design/mockup.reference.html.

1. Extend the store/Node: azimuthTrueDeg (0–359 or null) and an editable sigmaDeg (defaults from
   the indicator prior). update() on either recomputes dependent layers (v4).
2. "Selected node · bearing" card: build .selnode from the mockup — the compass dial on the left
   (.compass-wrap svg), the fields on the right (.selfields): Indicator (name + scale), Azimuth
   (true) as a --font-data reading, Uncertainty σ (editable, with the P&B provenance note), plus
   the drag hint. Shown only when a node is selected; otherwise a gentle empty hint.
3. The compass dial (src/ui/CompassRing): reproduce the mockup's compass() SVG exactly — the
   backing circle, the outer ring, 30° ticks (cardinals heavier), the cardinal "N", the vermillion
   σ WEDGE spanning az ± σ/... (mockup uses the node's σ; keep its visual), the ember NEEDLE at the
   bearing, the center dot, and the center degree reading (--font-data). Theme-aware colors via the
   tokens (as the mockup does with style var()).
4. Make it usable: dragging on the ring sets azimuthTrueDeg (pointer down/move/up, touch-friendly);
   the numeric Azimuth field stays in sync (type a value -> needle moves); editing σ widens/narrows
   the wedge. All writes go through the store; the dial re-renders from store state.

Verify: tsc --noEmit clean; npm test passes; selecting a node shows the dial; dragging the ring or
typing an azimuth moves the needle and updates the store; editing σ changes the wedge width; the
card matches the mockup. Report the dial interactions exercised.
```

## Stage 2 Report

Gave the selected node a bearing through the mockup's signature compass-ring dial.

**Store/Node** — `azimuthTrueDeg` (0–359 | null) and editable `sigmaDeg` already existed
on `Node` (seeded in v2 for this); the store's `update()` already emits, so every write
re-renders the dial + node list now and will drive the v4 posterior layer. No schema change
needed this stage.

**Files**
- `src/ui/CompassRing.ts` (new): reproduces the mockup's `compass()` SVG exactly — backing
  disc (`var(--inset)`), outer ring (`--border-strong`), 30° ticks with heavier cardinals,
  the cardinal "N", the vermillion σ wedge (`rgba(226,74,51,.16)` fill / `.4` stroke,
  spanning az ± σ/2 to keep the dial's visual), the ember needle + `#ff9a70` tip, the center
  hub, and the center degree reading in `--font-data`. All colors via `style var(…)`, so it
  re-themes like the mockup. Drag-to-set uses Pointer Events (touch-friendly, `touch-action:
  none`, pointer capture). The pointer→azimuth math is an exported pure helper
  `screenVectorToAzimuth(dx,dy)`.
- `src/ui/SelectedNode.ts` (new): the `.selnode` card — dial on the left, `.selfields` on the
  right (Indicator name + micro/macro scale; Azimuth (true) as an editable `--font-data`
  input; Uncertainty σ as an editable input whose small note reads "P&B 2024" when it's the
  prior and "custom" once overridden), plus the drag hint. Shown when a node is selected,
  else a gentle dashed empty hint. Built once per selected node and value-patched on later
  store changes so a focused input never loses its cursor.
- `src/ui/CompassRing.test.ts` (new): drag-geometry cases.
- `index.html`: `<div id="selectedNode">` added between the placement controls and the node
  list (the mockup's card slot). `src/main.ts`: `initSelectedNode(...)` wired.
- `src/ui/app.css`: ported the mockup's `.card`/`.clab`/`.selnode`/`.compass-wrap`/
  `.selfields`/`.field`/`.drag-hint` verbatim, plus token-styled `input.num` (borderless,
  spinner-stripped, focus→accent) and the `.selnode-empty` hint.

**Verify** — `tsc --noEmit` clean; `npm test` green (20 tests). `vite build` succeeds.
- Drag geometry (`CompassRing.test.ts`): up→0° (N), right→90° (E), down→180° (S), left→270°
  (W); the four diagonals→45/135/225/315; the full sweep always returns a normalized 0–359
  integer. This is exactly the math a ring drag runs, so a drag to the East sets 90°, etc.
- Selecting a node renders the dial + fields; deselecting shows the empty hint (store-driven
  render path). Typing an azimuth writes `azimuthTrueDeg` (wrapped 0–359) and moves the
  needle; editing σ writes `sigmaDeg` (clamped 1–180) and re-widens the wedge; the focused
  input is left untouched during patching.

**Deviation:** the interactive drag/type/σ behaviors were verified by the pure-geometry
unit tests + build + code path review rather than an automated screenshot (no browser
driver in this environment; the mockup's dial is inherently pointer-driven). The dial's σ
wedge keeps the mockup's ± σ/2 span; the map wedge in Stage 3 uses the wider ± σ fan the
spec calls for.

---

# Stage 3 — Bearing rays + selected σ wedge on the map

```
Draw direction on the map the way the mockup does — geo-anchored via the ENU core.

1. Rays (src/map/rays.ts): for each node WITH an azimuth, draw a Leaflet polyline from the marker
   along its bearing, projected a fixed ground distance (projectAlong), in the node's indicator
   color, fading out toward the far end (approximate the mockup's gradient with a lowered opacity /
   a short solid + faded tail). The SELECTED node's ray is thicker and solid; others are thinner
   and dashed (mockup: sel 2.4px solid ~0.95 alpha; others ~1.6px dashed ~0.6 alpha). Redraw on
   azimuth/selection/pan-zoom; remove with the node.
2. Selected σ wedge (src/map/wedge.ts): for the selected node, draw a Leaflet polygon fanning from
   the marker between az−σ and az+σ (the honest, wide fan), filled low-opacity vermillion fading
   out (mockup wedge). This visualizes how weakly one indicator constrains direction.
3. Keep the node-list subline live: show each node's bearing next to its spread (mockup .ns:
   "advancing · 284°"); nodes without a bearing show "— " until set.
4. Update the scale bar (optional): make the mockup's scale bar reflect the map's real scale at the
   current zoom, or leave the placeholder and note it.

Verify: tsc --noEmit clean; npm test passes; setting an azimuth draws a ray in the correct compass
direction that tracks pan/zoom; the selected node shows the vermillion σ fan; the list sublines
show bearings; rays/wedge match the mockup. Report the visual checks (e.g. az=90 points East).
```

## Stage 3 Report

Drew direction on the map the way the mockup does — geo-anchored through the ENU core.

**Files**
- `src/map/rays.ts` (new): a `L.layerGroup` of bearing rays. For each node with an azimuth,
  a polyline runs from the marker along the bearing via `projectAlong(anchor, node, az, m)`.
  Since a Leaflet stroke can't gradient, each ray is two segments — a near half at the node's
  indicator color/alpha and a far tail at 0.4× that alpha — to read as the mockup's fade. The
  selected ray is 2.4px solid ~0.95α; others 1.6px dashed `7 6` ~0.6α. `resolveColor()` turns
  the `var(--ind-*)` token into a concrete stroke via `getComputedStyle`. Exports
  `viewRayMeters(map)` (ray length = 0.4× the view diagonal, min 200 m) so rays scale with
  zoom. Redraws on store change + `moveend`/`zoomend`; clears when the anchor is unset.
- `src/map/wedge.ts` (new): the selected node's σ fan — a `L.polygon` sampled from the marker
  across az−σ … az+σ (the honest, WIDE ±σ span, clamped to ±179°, ~6°/step), filled
  low-opacity vermillion (`#e24a33`, fill 0.14 / stroke 0.35) to show how weakly one indicator
  constrains direction.
- `src/map/scalebar.ts` (new): makes the placeholder scale bar real — computes meters/pixel at
  center, picks a nice 1/2/5×10ⁿ distance ≤ the bar width, sizes the four segments to it, and
  labels it (m / km). Updates on pan/zoom.
- `src/ui/NodeList.ts`: the subline now shows the bearing next to the spread
  (`advancing · 284°`; `— ` until a bearing is set), matching the mockup's `.ns`.
- `src/main.ts`: wedge → rays → markers init order (so the fan sits under the rays under the
  markers in the overlay pane); scale bar wired to `.scale`.

**Verify** — `tsc --noEmit` clean; `npm test` green (20 tests); `vite build` succeeds.
- Direction correctness rides on the Stage-1 ENU tests: `projectAlong` at az=90 moves due East
  and az=0 due North (sub-meter), so a node set to 90° draws a ray pointing East, and every ray
  endpoint is a real lat/lon that tracks pan/zoom. The rays/wedge redraw on `moveend`/`zoomend`,
  so they stay glued to the ground through pan + zoom.
- The selected ray renders thick/solid and others thin/dashed; the selected node shows the wide
  vermillion σ fan; the node-list sublines show each bearing; the scale bar relabels on zoom.

**Deviation:** the on-screen visual pass (side-by-side pixel parity, live drag) was not scripted
as an automated screenshot — no browser driver here — so those checks were done via the ENU
geometry tests, the successful bundle build, and code-path review; the full running-app
walkthrough is Stage 4 of v5. The ray fade is a two-segment opacity approximation of the mockup's
CSS gradient (Leaflet strokes don't gradient), as the spec permits.

---

# After These Stages
- Every node can carry a direction, set through the mockup's signature compass-ring dial (drag or
  type), with its σ shown honestly as a wedge — and the map draws the bearing rays and the selected
  node's σ fan, all geo-anchored on the ENU core.
- **Next (`UPDATELOGV4.md`):** the heart — the von Mises grid posterior (pure, tested), rendered as
  the mockup's **stepped muted-purple credible-region bands** with the 50/68/95 contour lines, and
  the panel **readout card** (candidate area, spread/entropy meter, mode-count + geometry chips).
- Deferred: export/import, offline PWA, the Colorado demo, and full coherence (v5).
