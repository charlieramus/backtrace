charlie

# Backtrace — v4 · The Honest Posterior, Heatmap Bands & Readouts
# Work on one stage at a time. Do NOT combine stages.

---

## Context
Assumes **`UPDATELOGV1.md`–`UPDATELOGV3.md` shipped**: the app matches the mockup's chrome, nodes
can be placed/selected/removed with matching markers, and each node can carry a bearing (compass
dial) drawn as rays + a σ wedge over the ENU core. If not, finish those first.

**This log (v4) builds the heart of the app and the payoff of the whole design:** the von Mises
grid posterior (pure, tested), rendered as the mockup's **stepped muted-purple credible-region
bands** (the 25% / 52% / 82% fills between the 50/68/95 contour lines), with the dashed contour
ring lines and the honest **readout card** (candidate area, spread/entropy meter, mode-count and
geometry chips). This is where "honest, not an oracle" becomes visible.

**Visual source of truth stays `design/mockup.reference.html`.** Match `drawPosterior` — the
stepped bands (outer ~0.25, middle ~0.52, core ~0.82 opacity of the muted purple `--post` ramp),
the dashed sand/violet ring lines (widths ~1.4/1.4/1.6, dash [6,5], alphas .55/.7/.9), the "95%"
label — and the readout card (`.card`, `.area` big tabular number + "m²", the `.meter`
spread/entropy bar, the `.chips` "N candidate origin" + "Geometry good"). The mockup fakes the
field as tinted ellipses; the real app renders the TRUE posterior grid, so the bands will be
honestly irregular — that is correct and better.

## Sources folded into this log
- **CRESEARCH.md §1.3** — grid posterior with von Mises likelihoods, kappa-from-sigma inversion
  (Fisher 1993), outlier mixture, ray/behind-observer handling. Stage 1.
- **CRESEARCH.md §1.4** — HDR (highest-density) credible regions via a threshold on sorted
  cumulative mass; area of the 95% region. Stages 2–3.
- **CRESEARCH.md §1.5** — entropy/flatness, mode count, and the geometry-quality (condition-number)
  warning. Stage 4.

## Decisions
- **Pure, tested estimator** (`src/geo/posterior.ts`), no Leaflet/DOM — the mockup's field is a
  render of this. Get it right and covered by tests before drawing anything.
- **Render the TRUTH, keep the mockup's LOOK.** Compute the real posterior grid + real 50/68/95
  HDR regions; paint them with the mockup's exact stepped purple opacities and contour styling.
  Broad/flat/bimodal results must show honestly (that's the point), never a fake tight ellipse.
- **Heatmap = a canvas overlay layer**, not per-cell DOM. A custom Leaflet layer paints the grid
  cells by HDR band (95→outer opacity, 68→middle, 50→core) into a canvas positioned over the map,
  reprojecting on pan/zoom via the ENU↔latLon helpers. Contour ring lines drawn on top.
- **Readouts are honest numbers**, in --font-data, wired live to the posterior summary. Labels use
  the mockup's copy ("candidate area", "N candidate origin", geometry good/poor).

---

# Stage 1 — Von Mises grid posterior (pure, tested)

```
Build the estimator as a standalone, tested module (CRESEARCH.md §1.3). No Leaflet, no DOM.

1. src/geo/posterior.ts: kappaFromSigma(sigmaRad) via the Fisher (1993) inversion branches in §1.3
   (R = exp(-sigma^2/2); the three-branch kappa formula).
2. computePosterior(nodes, opts):
   - Choose an ENU grid over the nodes' bounding area + margin (default ~256–500 cells/side; cell
     size from the extent; resolution in opts). Use the v3 ENU core + session anchor.
   - For each cell x and node i WITH a bearing: beta = atan2(x.E - p_i.E, x.N - p_i.N); delta =
     wrapPi(theta_i - beta); L_i = (1-eps)*vonMises(delta, kappa_i) + eps/(2*pi), eps ~0.15
     (outlier mixture), kappa_i from the node's effective σ. Behind-observer handled by von Mises.
   - Accumulate log L over nodes; softmax-normalize to a posterior grid.
   - Return { grid, anchor, cellSizeM, extent, nodesUsed }. Return null with <2 bearings.
3. Tests (src/geo/posterior.test.ts): (a) 3 tight, agreeing bearings -> mass concentrated near the
   true crossing; (b) 3 wildly disagreeing bearings (σ ~100°) -> near-flat posterior (LOW
   concentration); (c) two separated clusters -> bimodal (two peaks); (d) <2 bearings -> null.

Verify: tsc --noEmit clean; npm test passes with all four cases green. Report each case and the
concentration/flatness you observed. NO UI in this stage.
```

## Stage 1 Report

Built the estimator as a standalone, tested module — the heart of the app. No Leaflet, no DOM.

**Files**
- `src/geo/posterior.ts` (new):
  - `kappaFromSigma(sigmaRad)` — Fisher (1993) three-branch inversion via R = exp(−σ²/2).
  - `logBesselI0(x)` — series for |x|<15, asymptotic expansion above, so tight-σ (large κ)
    von Mises stays numerically stable (the whole estimator works in log space).
  - `computePosterior(nodes, opts)` — filters to nodes with an azimuth AND a usable σ; picks
    an ENU box over them + margin (`marginFrac` default 0.6, resolution default 180 cells/long
    side); for each cell and node computes β = atan2(ΔE,ΔN), δ = wrapPi(θ−β), and the outlier
    mixture L = (1−ε)·vM(δ;κ) + ε/2π (ε default 0.15) via `logSumExp`; accumulates log L across
    nodes and softmax-normalizes. Returns `{ values, nx, ny, anchor, cellSizeM, extent,
    nodesUsed }`, or **null with < 2 bearings**. Also exports `wrapPi`, `cellCenterEnu`,
    `cellCenterLatLon` for v4 S2/S3.
- `src/geo/posterior.test.ts` (new): the four required cases.

**Verify** — `tsc --noEmit` clean; `npm test` green (24 tests). Observed on a 114×120 grid
(33.4 m cells), uniform = 1/(nx·ny):
- **(a) three tight, agreeing bearings (σ=12°)** → mass concentrated at the crossing: peak
  **5.67×10⁻³ ≈ 78× uniform**, and the mode cell sits within 3 cell-widths of the true origin.
- **(b) three wildly disagreeing bearings (σ≈100°, scattered azimuths)** → near-flat: peak
  **1.43×10⁻⁴ ≈ 2.0× uniform** — and the agreeing case is >5× more concentrated. Honesty works:
  broad when the indicators disagree.
- **(c) two separated clusters** (two origins 5 km apart, 2 bearings each) → bimodal: both
  origin cells carry > 5× uniform mass while the midpoint between them is < half the smaller
  peak — a genuine valley, so the data "supports both."
- **(d) < 2 bearings** (empty / one node / a node with null azimuth) → null.

No UI this stage, as specified.

---

# Stage 2 — HDR credible regions + summaries

```
Turn the grid into the 50/68/95 regions and the numbers the readout needs (CRESEARCH.md §1.4–1.5).

1. src/geo/hdr.ts: hdrRegions(posterior, levels=[0.5,0.68,0.95]) -> for each level, the density
   THRESHOLD such that the sum of cells with p >= threshold equals that mass (sort cells by density
   desc, accumulate). Return per-level: threshold, cell mask/indices, and area in m² (cellCount *
   cellSizeM^2). The 95% area is the headline "candidate area".
2. Summaries: entropy/flatness (normalized Shannon entropy of the grid -> 0=peaked, 1=flat) and
   modeCount (count well-separated local maxima above a fraction of the global max, min-distance
   apart, so two clusters read as 2).
3. Geometry-quality: from the bearings' directions, a condition-number / near-parallel check ->
   boolean poorGeometry (ill-conditioned crossing) per §1.5.
4. Tests (src/geo/hdr.test.ts): agreeing bearings -> small 95% area + low entropy + modeCount 1;
   disagreeing -> large area + high entropy; two clusters -> modeCount 2; near-parallel -> poorGeometry.

Verify: tsc --noEmit clean; npm test passes; the summaries behave (small/large area, entropy,
mode count, poor-geometry flag) across the cases. Report the numbers you saw.
```

## Stage 2 Report

Turned the grid into the 50/68/95 regions and the numbers the readout needs — pure, tested.

**Files**
- `src/geo/hdr.ts` (new):
  - `hdrRegions(g, levels=[0.5,0.68,0.95])` — sorts cells by density desc, accumulates mass to
    each level, and returns per level `{ level, threshold, cellCount, areaM2, mask }` (nested
    Uint8Array masks for Stage 3 to paint). `candidateAreaM2(regions)` picks the 95% area.
  - `normalizedEntropy(g)` — Shannon entropy / log N, 0 = peaked … 1 = flat.
  - `modeCount(g, frac=0.5)` — 8-connected components of the ≥ frac·max mask (single-cell
    specks ignored): one blob → 1, two clusters → 2, a broad flat field → 1.
  - `geometryQuality(nodes, threshold=10)` — builds M = Σ nᵢnᵢᵀ from each bearing line's
    normal, returns `{ condition = λmax/λmin, poor }`; near-parallel bearings blow the
    condition number up.
- `src/geo/hdr.test.ts` (new): the four cases.

**Verify** — `tsc --noEmit` clean; `npm test` green (28 tests). Observed:
- **Agreeing (σ=12°)** → 95% candidate area **≈ 649,113 m²**, entropy **0.668** (peaked),
  **mode count 1**, geometry **good** (condition **1.00**); regions nest (50 ⊆ 68 ⊆ 95).
- **Disagreeing (σ≈100°, scattered)** → 95% area **≈ 13,149,658 m²** (**~20× larger**), entropy
  **0.987** (near-flat) — the field honestly balloons.
- **Two clusters** → **mode count 2**.
- **Near-parallel bearings** → condition **≈ 1231**, `poor = true`; the well-spread set stays
  `poor = false`.

Note: the agreeing area (~0.65 km²) is larger than the mockup's illustrative "41,200 m²" — that
label was a hand-drawn ellipse; this is the TRUE posterior for σ=12° bearings 1 km out, and the
v5 Colorado demo tunes real bearings/σ. No UI this stage.

---

# Stage 3 — Stepped purple heatmap bands + contour lines (the mockup's field)

```
Render the posterior as the mockup's stepped credible-region field — geo-anchored on the map.

1. Heatmap overlay (src/map/posteriorLayer.ts): a custom Leaflet canvas layer. Subscribe to the
   store; recompute the posterior (v4/S1) + HDR regions (v4/S2) on any change (debounced). Clear it
   with <2 bearings.
2. Paint the STEPPED bands into the overlay canvas, matching the mockup's drawPosterior opacities:
   cells inside the 50% region at ~0.82, between 68% and 50% at ~0.52, between 95% and 68% at ~0.25,
   using the muted-purple `--post` ramp color for the current theme (dark ~rgb(139,123,196), light
   ~rgb(120,98,176)). Reproject cell -> screen via ENU->latLon + map.latLngToContainerPoint;
   redraw on pan/zoom/resize. Add the mockup's subtle outer feather just beyond the 95% edge.
3. Contour ring lines: draw the 50/68/95 region boundaries as the mockup's dashed lines (sand in
   dark / violet in light per the tokens, dash [6,5], the mockup's widths). A marching-squares
   contour on the HDR masks is ideal; a cheaper outline of each band's edge is acceptable if it
   reads like the mockup. Add the small "95%" label near the outer ring.
4. Honest labelling: nowhere print a single coordinate for the origin; the field is always the
   "candidate origin area."

Verify: tsc --noEmit clean; agreeing nodes -> a concentrated stepped field with tight contours;
disagreeing -> a broad, flat field; two clusters -> two regions; all track pan/zoom and re-theme.
Side-by-side, the field reads like the mockup's stepped purple bands. Report each case.
```

## Stage 3 Report

Rendered the posterior as the mockup's stepped credible-region field — geo-anchored on the map.

**Files**
- `src/map/posteriorLayer.ts` (new): a custom canvas overlay in a dedicated map pane
  (`z-index 350`, so it sits above the basemap tiles but beneath the σ wedge / rays / markers).
  It subscribes to the store and, debounced (60 ms), recomputes `computePosterior` (v4 S1) +
  `hdrRegions` (v4 S2), clearing when < 2 bearings. On recompute it precomputes, once, a
  per-cell paint opacity, the cell-center lat/lons (so pan/zoom only re-projects — cheap — and
  never re-solves the grid), the contour edge list, and the "95%" label cell; `redraw` then just
  projects those to container points.
  - **Stepped bands** with the mockup's `drawPosterior` opacities: inside 50% ~0.82, 68→50 ~0.52,
    95→68 ~0.25, plus a faint ~0.10 outer feather on cells that touch the 95% edge — painted in
    the muted-purple `--post` ramp (dark `rgb(139,123,196)` / light `rgb(120,98,176)`).
  - **Contour rings**: each region boundary (a stepped outline of the HDR mask edges) stroked
    dashed `[6,5]` in the sand/violet ring color, at the mockup's per-level widths/alphas
    (50: 1.6/0.9, 68: 1.4/0.7, 95: 1.4/0.55), with a small "95%" label near the outer ring.
  - Reprojects on `moveend`/`zoomend`/`resize` and re-themes via a `data-theme` MutationObserver.
    Never prints a coordinate — the field is always the candidate-origin area.
- `src/main.ts`: `initPosteriorLayer(map, store)` wired first (own pane keeps the z-order).

**Verify** — `tsc --noEmit` clean; `npm test` green (28 tests); `vite build` succeeds. The field's
CORRECTNESS is the v4 S1/S2 grid + HDR masks, which are unit-tested: agreeing bearings yield a
concentrated set of high-opacity cells with tight nested contours; disagreeing bearings spread the
mass across a broad, low-opacity field; two clusters produce two regions (mode count 2). Cell
centers/contours are real lat/lons, so the field tracks pan/zoom, and the palette swaps on theme.

**Deviation:** contours use the "cheaper outline of each band's edge" the spec explicitly permits
(stepped HDR-mask edges) rather than marching-squares — it reads as the mockup's dashed rings. The
real posterior is honestly irregular (not the mockup's smooth ellipses), which the spec calls the
correct/better outcome. The on-screen side-by-side parity + live pan/zoom/theme pass is done in the
v5 Stage 4 running-app walkthrough (no browser driver mid-build here); this stage was verified by
the tested pure inputs, the successful bundle build, and code-path review.

---

# Stage 4 — Readout card (candidate area, spread meter, mode-count + geometry chips)

```
Wire the mockup's readout card to the live posterior summary.

1. Readout card (.card in the panel, above the selected-node card): copy the mockup's markup/CSS —
   eyebrow "Candidate area · 95%", the big .area value (--font-data, tabular) + "m²" unit, the
   spread/entropy .meter (fill width from normalized entropy; label "moderate"/"broad"/"tight" with
   honest microcopy like "the indicators say little here" when near-flat), and the .chips row:
   modeCount ("1 candidate origin" / ">1 — two candidate origins, the data supports both") and a
   geometry chip ("Geometry good" / the poor-geometry warning).
2. Bind it to the v4/S2 summaries; format the area with thousands separators (e.g. "41,200 m²").
   Show a graceful empty/low state with <2 bearings ("place at least two bearings").
3. Poor-geometry banner: when poorGeometry, surface the mockup-styled warning ("poor geometry —
   collect nodes from a different sector") instead of implying a falsely tight region.

Verify: tsc --noEmit clean; npm test passes; agreeing nodes -> small area + low-spread meter +
"1 candidate origin" + geometry good; disagreeing -> large area + high-spread meter + low-confidence
copy; two clusters -> mode count 2; near-parallel -> the geometry warning. The card matches the
mockup. Report the numbers and states you saw.
```

## Stage 4 Report

Wired the mockup's readout card to the live posterior summary.

**Files**
- `src/ui/Readout.ts` (new): renders the `.card` at the top of the panel from the live
  summary. Recomputes `computePosterior` + `hdrRegions`/`candidateAreaM2`/`normalizedEntropy`/
  `modeCount`/`geometryQuality` (debounced 60 ms so a compass drag doesn't thrash the grid).
  Shows: eyebrow "Candidate area · 95%"; the big `.area` value in `--font-data` tabular with
  thousands separators + "m²"; the spread/entropy `.meter` (fill = normalized entropy, label
  tight/moderate/broad, with honest microcopy "The indicators say little here — the field is
  broad…" when ≥0.8); and the `.chips` row — a mode chip ("1 candidate origin" vs "N candidate
  origins — the data supports both", warn-styled) and a geometry chip (good/poor). When geometry
  is poor it surfaces a token-styled warning banner instead of implying a tight region. Below two
  bearings it shows the graceful empty state ("Place at least two bearings…").
- `index.html`: `<div id="readout">` added above `#selectedNode` (mockup order). `src/main.ts`:
  `initReadout(...)` wired.
- `src/ui/app.css`: ported the mockup's `.area`/`.metric`/`.meter`/`.chips`/`.chip` verbatim,
  plus `.chip.warn`, `.readout-banner`, `.metric .hint`, and `.readout-empty`.

**Verify** — `tsc --noEmit` clean; `npm test` green (28 tests); `vite build` succeeds. Ran the
built app in a headless browser (`localhost:5199`): **no console errors**; the toolbar, panel,
legend (with the 95/68/50 purple bands), live scale bar ("0 … 100 km" at the Colorado zoom), the
posterior canvas pane, the readout **"Candidate area · 95%"** card in its empty state, and the
selected-node compass empty hint all render on-system and match `design/mockup.reference.html`'s
empty state (screenshot captured). The summary NUMBERS the card binds to are the v4 S2 values,
which are unit-tested: agreeing → ~649k m² / "tight–moderate" / "1 candidate origin" / geometry
good; disagreeing → ~13.1M m² / "broad" + the low-confidence microcopy; two clusters → "2
candidate origins"; near-parallel → the poor-geometry chip + banner.

**Deviation:** the with-data render (numbers populated, poor-geometry banner on screen) is exercised
against real seeded nodes in the v5 Stage 4 walkthrough via "Load demo" (map placement needs pixel
clicks the headless driver's CDP allowlist blocks; the demo button seeds through the store, so it's
the right place). Area is shown in m² with separators per spec, even when large (e.g. "13,149,658 m²").

---

# After These Stages
- The app tells the honest truth visually: a real von Mises posterior rendered as the mockup's
  stepped muted-purple credible regions with 50/68/95 contours, and a live readout card
  (candidate area, spread, mode count, geometry) — broad when the indicators disagree, bimodal when
  the data supports two origins, never a fake pinpoint.
- **Next (`UPDATELOGV5.md`):** make it shippable — JSON export/import (no accounts), the offline
  PWA, the "Load demo" / "Clear" Colorado presets wired to the toolbar, and a full coherence +
  verify pass that walks the whole mockup end to end and updates `NOW.md`.
