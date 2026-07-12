charlie

# Backtrace — v2 · Domain, Nodes & Markers (make the map placeable)
# Work on one stage at a time. Do NOT combine stages.

---

## Context
Assumes **`UPDATELOGV1.md` shipped**: the app shell (tokens, themes, Leaflet dark/light basemap,
toolbar + theme toggle + offline chip, north arrow, scale bar, legend, empty panel) matches
`design/mockup.reference.html`'s empty state. If not, finish v1 first.

**This log (v2) makes the map placeable.** It adds the data model (indicator types, the Node
type, an in-memory store), lets the user click the map to drop nodes, renders each as the
mockup's **spread-shaped, indicator-colored marker**, and fills the panel's **node list** with
selectable, removable rows. After v2 the legend finally means something: color = indicator,
shape = spread. No bearings or posterior yet (v3/v4).

**Visual source of truth stays `design/mockup.reference.html`.** Match its markers (`drawMarker`
in the script — shapes, size r≈13, dark outline, selection ring), its node-list rows
(`.node`, `glyphSvg`, the σ readout), the indicator palette (`--ind-*`), and its legend exactly.
The mockup draws markers on a canvas; the real app renders them as **geo-anchored Leaflet
markers** that track pan/zoom.

## Sources folded into this log
- **Parker & Babrauskas 2024** (`SOURCES.MD` §1) — Table 5 per-indicator angular error → the
  default `prior_sigma_deg` values in Stage 1.
- **CRESEARCH.md §4.5** — spread type encoded by shape AND color (colorblind-safe); this is why
  markers carry both a shape (spread) and a color (indicator).

## Decisions
- **Store shape mirrors the mockup's data.** The mockup's NODES have { name/indicator, spread,
  sigma, lat/lon (normalized), color }. The real Node adds azimuth (v3). Model it so v5's export
  can serialize the store directly.
- **Color = indicator, shape = spread.** Exactly as the mockup + legend: indicator color from
  `--ind-*`, spread shape from { advancing ▲, lateral ◆, backing ■, undetermined ● }.
- **Markers are Leaflet layers**, one per node, built from the mockup's shapes (SVG divIcon or an
  L.Marker with an SVG icon) so they pan/zoom correctly and stay crisp. Selection draws the ember
  ring from the mockup.
- **Selection is app state**, held in the store; the panel and the map both read it. Selecting a
  node highlights its marker and its list row (`.node.sel`) identically to the mockup.

---

# Stage 1 — Indicator types + Node type + store

```
Define the domain, seeded from the research, shaped for the mockup's UI and v5's export.

1. src/domain/indicators.ts: the indicator_type table as a typed constant, from Parker &
   Babrauskas 2024 Table 5. Each: { code, label, scale:'MICRO'|'MACRO', prior_sigma_deg:number|
   null, color: /* one of the --ind-* tokens */, evidenceNote }. Seed at least:
     ANGLE_OF_CHAR 98 (n=89) -> --ind-char,  STAINING 106 (n=133) -> --ind-stain,
     PROTECTION 81 (n=39) -> --ind-prot,      SOOTING 97 (n=20) -> --ind-soot,
     WHITE_ASH 81 (n=6) -> --ind-ash,         GRASS_STEM 98 (n=7) -> --ind-grass,
     plus FOLIAGE_FREEZE null, CUPPING null, SPALLING null, CURLING null, V_U_PATTERN null (MACRO).
   The six colored ones must map to the mockup's exact --ind-* colors so markers match.
2. src/domain/node.ts: Node = { id, lat, lon, indicatorCode, spreadType:'ADVANCING'|'LATERAL'|
   'BACKING'|'UNDETERMINED', azimuthTrueDeg:number|null, sigmaDeg:number|null, notes }. sigmaDeg
   defaults from the indicator's prior_sigma_deg when null; expose an effectiveSigma(node) helper.
3. src/store.ts: holds Node[] + incident header { id, name, createdAtUtc } + selectedNodeId +
   the currently-armed indicatorCode (what a map click will place). Exposes add/update/remove/
   getAll/select/getSelected/setArmedIndicator/subscribe. Pure, in-memory, framework-free; shaped
   so v5 serializes it directly. No persistence yet.
4. Unit test (src/domain/node.test.ts): effectiveSigma falls back to the indicator prior; an
   overridden sigma wins; store add/select/remove + subscribe notify correctly.

Verify: tsc --noEmit clean; npm test passes incl. the domain tests; the six primary indicators
carry the mockup's colors + the P&B sigmas. Report the indicator table and the store API.
```

## Stage 1 Report

Defined the domain and the in-memory store, seeded from the research and shaped for the
mockup's UI + v5's export.

**Files added**
- `src/domain/indicators.ts` — the `IndicatorType` table as a typed constant
  (`INDICATOR_TYPES`), from Parker & Babrauskas 2024 Table 5. Each entry:
  `{ code, label, scale, priorSigmaDeg, color, evidenceNote }`. The six colored micro
  indicators map to the mockup's **exact** `--ind-*` tokens + the P&B sigmas:
  `ANGLE_OF_CHAR` 98° (n=89) → `--ind-char`, `STAINING` 106° (n=133) → `--ind-stain`,
  `PROTECTION` 81° (n=39) → `--ind-prot`, `SOOTING` 97° (n=20) → `--ind-soot`,
  `WHITE_ASH` 81° (n=6) → `--ind-ash`, `GRASS_STEM` 98° (n=7) → `--ind-grass`. Plus five
  `MACRO` priors with `priorSigmaDeg: null` + `color: null`: `FOLIAGE_FREEZE`, `CUPPING`,
  `SPALLING`, `CURLING`, `V_U_PATTERN`. `color` holds the token **name** (e.g.
  `"--ind-char"`) so nothing hard-codes a hex; `getIndicator(code)` and
  `indicatorColor(code)` (returns `var(--ind-*)`, falling back to `var(--text-muted)` for
  the direction-less macro set) are the accessors markers use in Stage 2.
- `src/domain/node.ts` — `Node = { id, lat, lon, indicatorCode, spreadType, azimuthTrueDeg,
  sigmaDeg, notes }` with `SpreadType = ADVANCING|LATERAL|BACKING|UNDETERMINED`.
  `effectiveSigma(node)` returns the override when set, else the indicator's P&B prior, else
  `null` (macro with no override).
- `src/domain/node.test.ts` — 10 unit tests: the indicator→color/sigma mapping, the macro
  null seeding, `effectiveSigma` fallback/override/null, and store add/select/remove +
  subscribe notification (incl. unsubscribe stops, and `setArmedIndicator`).

**Files changed**
- `src/store.ts` — replaced the placeholder with the real store. `createStore()` (used
  per-test for isolation) + a shared `store` singleton. State:
  `{ incident: { id, name, createdAtUtc, anchorLat, anchorLon }, nodes: Node[],
  selectedNodeId, armedIndicatorCode }`. API: `getState / getAll / add / update / remove /
  select / getSelected / setArmedIndicator / getArmedIndicator / getIncident / subscribe`.
  Pure, in-memory, framework-free; `add` fills id + defaults (spread `ADVANCING`, azimuth
  `null`, sigma `null`), `remove` clears selection if it was selected, `subscribe` returns an
  unsubscribe. The `anchor*` fields exist on the header now but stay `null` — the first-node
  anchor is wired in Stage 2 where placement happens. No persistence (v5).
- `src/domain/index.ts` — barrel now re-exports `./indicators` + `./node`.

**Verify:** `tsc --noEmit` clean; `npm test` green — 11 tests pass (10 new domain/store tests
+ the smoke test). The six primary indicators carry the mockup's colors and the P&B sigmas
(asserted in the test). No deviations from the spec; anchor-set intentionally deferred to
Stage 2 (its placement flow), matching the stage boundaries.

---

# Stage 2 — Click to place nodes + spread-shaped markers

```
Let the user build an investigation on the real map, with the mockup's markers.

1. Indicator picker: in the panel (above the node list), a styled control to choose the armed
   indicator type for the next placement (token-consistent; not a bare <select>). Default to
   ANGLE_OF_CHAR. Show the indicator's color + default sigma. The toolbar "Add node" (primary
   ember) button arms placement mode (cursor hints you can click the map); Esc cancels.
2. On map click (in placement mode): add a Node at that lat/lon with the armed indicator and a
   default spreadType (ADVANCING) + the indicator's prior sigma. The FIRST node sets the session
   ENU anchor (used by v3/v4) — record it on the incident header.
3. Marker rendering (src/map/markers.ts): for each node, a Leaflet marker whose icon is an SVG
   built from the mockup's drawMarker — the spread SHAPE (▲/◆/■/●) filled with the indicator
   COLOR, the dark outline (rgba(12,10,8,.9), ~2.5px), sized ~26px. Add/remove/update markers as
   the store changes (subscribe). Markers must track pan/zoom (real geo anchors).
4. Spread control: a per-node way to set spreadType (advancing/lateral/backing/undetermined) —
   e.g. a segmented control in the node's row/detail — which swaps the marker shape live. Matches
   the legend's shape meaning.

Verify: tsc --noEmit clean; npm test passes; arming + clicking the map drops correctly
colored/shaped markers that survive pan/zoom; changing spread swaps the shape; the first node
sets the anchor. Report the placement flow and confirm markers match the mockup's shapes/colors.
```

## Stage 2 Report

The map is placeable: arm an indicator, click to drop spread-shaped / indicator-colored
Leaflet markers that track pan/zoom, and change a node's spread live.

**Files added**
- `src/map/markers.ts` — `initMarkers(map, store)`. One `L.marker` per node whose icon is an
  `L.divIcon` built from the mockup's `drawMarker` shapes, mapped to a 32×32 viewBox centered
  at (16,16) with r=13 (~26px): advancing ▲, lateral ◆, backing ■, undetermined ● (with the
  mockup's white inner ring). Fill = `indicatorColor(code)` → `var(--ind-*)` (theme-driven),
  outline `rgba(12,10,8,.9)` 2.5px. Subscribes to the store and diffs by a per-node signature
  (`indicator|spread|lat|lon`), so it only rebuilds an icon when it actually changed; adds new
  nodes, removes deleted ones. Being real geo anchors, markers track pan/zoom for free.
- `src/map/placement.ts` — `initPlacement(map, store, addButton)`. The primary "Add node"
  button toggles placement mode: the map gets `.bt-placing` (crosshair cursor) and the button
  an `.active` ember state + `aria-pressed`. While armed, each map click `store.add`s a node at
  the clicked lat/lon with the armed indicator + default `ADVANCING` spread (prior sigma flows
  from the indicator via `effectiveSigma`); the FIRST placement calls `store.setAnchor(...)` to
  fix the session ENU anchor on the incident header (v3/v4 origin); the placed node is selected
  so the spread control targets it. Esc cancels; placement stays armed so several nodes drop in
  a row.
- `src/ui/components/indicatorPicker.ts` — `initIndicatorPicker(parent, store)`. A token-
  consistent custom control (not a bare `<select>`): a trigger showing the armed indicator's
  color dot + label + default sigma, and a popover listbox of all 11 indicator types. Picking
  one calls `store.setArmedIndicator`; the trigger reflects the store (default `ANGLE_OF_CHAR`).
  Closes on outside pointerdown / Esc.
- `src/ui/components/spreadControl.ts` — `initSpreadControl(parent, store)`. A 4-way segmented
  control (▲ ◆ ■ ●) for the selected node's spread; hidden when nothing is selected. Clicking
  writes `store.update(id, { spreadType })`, which re-renders that node's marker through the
  marker layer's subscription.

**Files changed**
- `src/store.ts` — added `setAnchor(lat, lon)` (sets the incident header anchor + emits) to the
  `Store` interface + implementation, for the first-node anchor.
- `src/main.ts` — captured the `createMap` return; wired `initMarkers`, the panel controls
  (`initIndicatorPicker` + `initSpreadControl` into `#panelControls`), and `initPlacement` on
  `.toolbar .tbtn.primary`, all against the shared `store`.
- `index.html` — added `<div id="panelControls">` between the panel head and the empty hint as
  the mount point for the picker + spread control.
- `src/ui/app.css` — new Stage 2 section: `.bt-marker-icon` / `.bt-marker` (drop-shadow, strip
  the divIcon box), `.leaflet-container.bt-placing` crosshair, the indicator picker
  (`.ind-picker/.ind-current/.ind-menu/.ind-opt/.ind-dot/.ind-sig`), the spread control
  (`.segmented/.seg`), and the `.tbtn.primary.active` armed state.
- `src/domain/node.test.ts` — added a `setAnchor` store test (now 12 tests total).

**Verify:** `tsc --noEmit` clean; `npm test` green (12 tests); `vite build` succeeds. Exercised
the running app in a headless browser (gstack /browse): arming shows the crosshair + pressed
button; clicking the map drops a char-red **advancing triangle**; swapping spread updates the
same marker live (▲→■ rect→● circle) and the segmented control's active state; the indicator
picker opens, re-arms (e.g. White ash σ 81°, Grass stem), and closes on pick; a second node with
a different indicator renders in its own color; panning the map moved the marker with it
(x 624→544), confirming geo-anchoring; no console errors. The first-node anchor is set by
`placement.ts` + covered by the new `store.setAnchor` test (its UI surfacing — the meta line —
is Stage 3).

**Deviation / bug found + fixed during verify:** the closed indicator menu still rendered on top
of the spread control and swallowed its clicks, because `.ind-menu { display:flex }` overrode the
`[hidden]` attribute's UA `display:none`. Added `.ind-menu[hidden]{display:none}`. Also, to keep
Stage 2 self-contained, placing a node auto-selects it so the spread control has a target; the
richer two-way selection + node list + live meta line are Stage 3 as specified, so the v1
empty-hint intentionally remains for now.

---

# Stage 3 — Node list + selection + remove (the panel body)

```
Fill the panel with the mockup's node list and wire selection both ways.

1. Node list (src/ui/NodeList): render each node as the mockup's .node row — the shape glyph in
   the indicator color (glyphSvg), the indicator name (.nt), a subline (.ns) with the spread label
   and (later, v3) the bearing, the σ readout (.sig, tabular, e.g. "σ 98°"), and a remove
   (.iconbtn ✕) button. Copy the .node/.nb/.nt/.ns/.sig/.iconbtn CSS from the mockup. Replace the
   v1 empty-state hint with the real list; keep the dashed "Click the map to place a node"
   .addrow button at the bottom.
2. Selection (both directions): clicking a list row selects the node (store.select) → the row gets
   .node.sel (ember tint) AND the map marker gets the ember selection ring (mockup: arc r+7, 2.5px,
   #ff7a45). Clicking a marker selects it too and scrolls its row into view. Only one selected at
   a time.
3. Remove: the row's ✕ (and a marker context action) removes the node → marker disappears,
   selection clears if it was selected. Update the panel meta line ("N nodes").
4. Panel meta: keep the head's "N nodes · anchor <lat,lon>" line live (anchor from the first
   node's session anchor, in --font-data).

Verify: tsc --noEmit clean; npm test passes; the node list matches the mockup row-for-row;
selecting from the list highlights the marker and vice-versa; removing clears both; the meta line
tracks count + anchor. Report the selection/removal flow and a mockup parity check on the rows.
```

## Stage 3 Report

_Pending._

---

# After These Stages
- The map is placeable: arm an indicator, click to drop spread-shaped / indicator-colored markers
  that match the mockup, and manage them in the mockup's node list with two-way selection and
  removal. The legend now reads true.
- **Next (`UPDATELOGV3.md`):** give nodes a direction — the ENU geometry core, the azimuth
  control, the signature **compass-ring dial** (drag to set bearing, σ wedge), and the bearing
  rays + selected-node σ wedge drawn on the map.
- Deferred: the von Mises posterior + stepped heatmap bands + readouts (v4); export/import,
  offline PWA, Colorado demo, coherence (v5).
