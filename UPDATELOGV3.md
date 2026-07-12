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

_Pending._

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

_Pending._

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

_Pending._

---

# After These Stages
- Every node can carry a direction, set through the mockup's signature compass-ring dial (drag or
  type), with its σ shown honestly as a wedge — and the map draws the bearing rays and the selected
  node's σ fan, all geo-anchored on the ENU core.
- **Next (`UPDATELOGV4.md`):** the heart — the von Mises grid posterior (pure, tested), rendered as
  the mockup's **stepped muted-purple credible-region bands** with the 50/68/95 contour lines, and
  the panel **readout card** (candidate area, spread/entropy meter, mode-count + geometry chips).
- Deferred: export/import, offline PWA, the Colorado demo, and full coherence (v5).
