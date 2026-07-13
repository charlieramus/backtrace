charlie

# Backtrace — v2 · Macro Priors (GOA → SOA)
# Work on one stage at a time. Do NOT combine stages.

---

## Context
Read `NOW.md` first. Assumes **V6–V9 shipped**: the defensible record, court-ready export, About page, and
field capture. The estimator today (`src/geo/posterior.ts`) treats every node as a micro-indicator ray
with von Mises noise and multiplies their likelihoods — a flat prior. But NWCG doctrine works from the
outside in: macro evidence (the burn's overall shape, a V/U apex, a witness's first-smoke bearing, the
dispatch first-report location) gets you to the **general origin area (GOA)**; micro indicators refine the
GOA to the **specific origin area (SOA)**. And per CRESEARCH.md §0 and §4.1, the micro indicators carry
less information than anyone wants — so **most of the actual information lives in the macro prior.**

**A macro constraint = a region-shaped piece of evidence (a V apex, a burn perimeter, a witness cone, a
first-report point, an exclusion zone) consumed as a Bayesian PRIOR over the origin — not as a ray.** This
is the structural type the model has been missing (CRESEARCH.md §4.1).

This log builds only **macro constraints as priors and the GOA→SOA workflow**: the constraint model, the
prior field they induce, its fusion into the existing posterior, the map tools to draw them, and their
inclusion in the exports. It does **not** build the slope-aware forward model, wind, or Rothermel
back-projection (CRESEARCH.md §4.2–4.4) — those stay later. Micro nodes and their von Mises likelihoods are
unchanged; this adds the `log_prior` term to `log_post = log_prior + Σ log_likelihood` (CRESEARCH §4.1).

## Decisions (agreed in the CEO review)
- **Macro indicators are priors, not rays.** They never enter the ray/likelihood code. A V apex is a soft
  region, a burn perimeter is a boundary, a witness bearing is an angular cone, a first-report location is
  a soft Gaussian, an exclusion zone zeroes mass (CRESEARCH.md §4.1). Forcing them into ray-intersection is
  the classic naive mistake — don't.
- **Bayes, cleanly.** `log_post(x) = log_prior_from_macro(x) + Σ_i log_likelihood_micro_i(x)`. With no
  macro constraints the prior is flat and the posterior is byte-for-byte the v0 result — a hard invariant.
- **Append-only, like nodes.** Macro constraints live in the court-grade record (V6 discipline: immutable +
  superseding + audited) and export with the investigation (V7).
- **Doctrine-shaped workflow.** Phase 1: draw the GOA / macro evidence. Phase 2: place micro nodes inside
  it. The readout states the prior's contribution so the honesty is visible.
- **Design source of truth stays `design/mockup.reference.html` + `src/ui/tokens.css`.** Drawing tools +
  the phase affordance reuse the tokens (frosted, rounded, tabular). No new visual language.
- Medium feature: five stages.

---

# Stage 1 — Macro-constraint model + store

```
Add the macro-constraint type to the domain + the append-only store (CRESEARCH.md §3 macro_constraint).

1. src/domain/macro.ts (new): MacroConstraint { id, incidentId, kind ('V_APEX'|'BURN_PERIMETER'|
   'WITNESS_CONE'|'FIRST_REPORT_LOC'|'EXCLUSION_ZONE'), geometry (GeoJSON, WGS84), weight (default 1.0),
   source ('INVESTIGATOR'|'IR_FLIGHT'|'WITNESS'|'DISPATCH'), notes, supersedesId?, voided, voidReason,
   createdAtUtc, recordHash }. DOM-free.
2. src/store.ts: hold macroConstraints alongside nodes with the SAME append-only discipline from V6 —
   addMacro/supersedeMacro/voidMacro, activeMacros(), hashed on write, and an audit entry per mutation
   (CREATE/SUPERSEDE/VOID with a MACRO entity). Include them in the v2 save file + export.
3. store.test.ts: adding/superseding/voiding a macro constraint behaves like nodes (history retained,
   activeMacros() latest-only, audit entries appended, hash sealed).

Verify: tsc --noEmit clean; npm test green incl. macro append-only test; a macro constraint round-trips
through save/load with its geometry + provenance intact. Report the constraint kinds supported + that the
append-only/audit/hash discipline holds.
```

## Stage 1 Report

The macro-constraint type + its append-only store are in.

- **`src/domain/macro.ts` (new)** — `MacroConstraint { id, incidentId, kind, geometry (WGS84
  GeoJSON Point/LineString/Polygon), weight (default 1.0), source, notes, + kind-specific
  bearingDeg/spreadDeg/radiusM, + chainId/supersedesId/voided/voidReason, createdAtUtc,
  recordHash }`. `kind ∈ { V_APEX, BURN_PERIMETER, WITNESS_CONE, FIRST_REPORT_LOC,
  EXCLUSION_ZONE }`; `source ∈ { INVESTIGATOR, IR_FLIGHT, WITNESS, DISPATCH }`. DOM-free. Plus
  `deriveActiveMacros` (latest non-voided row per chain, shared by store + prior/export),
  `canonicalizeMacro` + `computeMacroHash` (SHA-256 seal folding the geometry in so a moved
  vertex changes the seal), and `validateMacroConstraint` for import.
- **`src/store.ts`** — holds `macroConstraints` alongside `nodes` with the **same V6 append-only
  discipline**: `addMacro` / `supersedeMacro` / `voidMacro` (a correction appends a superseding
  row carrying `supersedesId` + the shared `chainId`; a void appends a `voided` row with a
  reason; rows are never mutated), `activeMacros()` (latest-only), `historyOfMacro()`, each
  **sealed with a recordHash on write** and **audited** (a `CREATE_MACRO`/`SUPERSEDE_MACRO`/
  `VOID_MACRO` entry with the new `MACRO` audit entity). `load`/`clear` handle them.
- **`src/domain/audit.ts`** — added the `MACRO` entity + the three macro actions to the type
  unions and the runtime validators.
- **`src/io/savefile.ts`** — the v2 save file now carries the full macro history
  (`macroConstraints`); `buildSaveFile` emits it, `parseSaveFile` validates each row
  (`validateMacroConstraint`), `sealSaveFile` recomputes each macro's hash, and `applySaveFile`
  restores them on replace.
- **`src/store.test.ts`** — 4 new tests: add/supersede/void behave like nodes (history retained,
  `activeMacros()` latest-only, voided chain drops out); `voidMacro` demands a reason; a
  `MACRO` audit entry is appended per mutation (CREATE/SUPERSEDE/VOID); and a witness cone +
  an exclusion polygon round-trip through save/load with geometry + provenance intact.

**Verify:** `tsc --noEmit` clean; `npm test` green incl. the macro append-only test (**114
tests**, +4). Constraint kinds supported: V_APEX, BURN_PERIMETER, WITNESS_CONE, FIRST_REPORT_LOC,
EXCLUSION_ZONE. A macro constraint round-trips through save/load with its GeoJSON geometry +
source/weight/params intact, and the append-only / audit / per-row hash discipline holds (verified
by the new tests).

---

# Stage 2 — Prior field from macro constraints

```
Turn each macro constraint into a log-prior over the ENU grid (CRESEARCH.md §4.1).

1. src/geo/prior.ts (new): buildLogPrior(constraints, grid) → a log-prior array aligned to the posterior's
   ENU grid (reuse the grid definition from posterior.ts; do NOT introduce a second grid). Per kind:
   - V_APEX: a soft region near the apex, oriented down the V axis (higher prior toward the apex interior).
   - WITNESS_CONE: an angular sector from the observer along the reported first-smoke bearing ± its spread;
     inside → high, outside → low.
   - FIRST_REPORT_LOC: a soft 2-D Gaussian bump at the reported location with a stated radius.
   - BURN_PERIMETER: origin must lie inside → near-zero log-prior outside the polygon.
   - EXCLUSION_ZONE: zero/strongly-negative log-prior inside the zone (origin cannot be here).
   Each scaled by its weight; combined additively in log space; normalized so a flat prior (no constraints)
   contributes a constant (invariance).
2. Keep it pure + vectorized (one pass per constraint), consistent with posterior.ts's performance
   approach; convert constraint geometry WGS84→ENU once at the edge (reuse src/geo/enu.ts).
3. src/geo/prior.test.ts: an exclusion zone drives mass to ~0 inside it; a witness cone concentrates mass
   in the sector; a first-report Gaussian peaks at the point; NO constraints → a constant field.

Verify: tsc --noEmit clean; npm test green incl. the prior tests; each constraint kind produces the
expected prior shape and the empty case is flat. Report each kind's prior behavior + the flat-case
invariance.
```

## Stage 2 Report

Each macro constraint now induces a log-prior over the posterior's own ENU grid.

- **`src/geo/prior.ts` (new)** — `buildLogPrior(constraints, grid, opts?)` → a `Float64Array`
  aligned to the posterior grid (row-major `iy*nx+ix`, reusing `PosteriorGrid` +
  `cellCenterEnu`; **no second grid**). Each constraint's WGS84 geometry is converted to ENU
  **once** at the grid anchor (`enuFromLatLon`), compiled to a typed shape, then evaluated per
  cell and summed × weight in log space:
  - **FIRST_REPORT_LOC** — a 2-D Gaussian bump `−½(d/radius)²`, peaking at the point.
  - **WITNESS_CONE** — 0 inside the `bearing ± spread` sector (observer→cell azimuth), a soft
    `−½((off−spread)/8)²` falloff outside.
  - **V_APEX** — a ridge from the apex down the axis: Gaussian across the axis + a penalty for
    being behind the apex (interior favored).
  - **BURN_PERIMETER** — 0 inside the polygon, `−40` (≈ zeroed after softmax) outside.
  - **EXCLUSION_ZONE** — `−40` inside, 0 outside.
  With **no constraints it returns all zeros** — a constant field, which is exactly the
  flat-prior invariant Stage 3 depends on. Pure + vectorized (one compile pass per constraint,
  one grid sweep), consistent with `posterior.ts`.
- **`src/geo/prior.test.ts` (new)** — 7 tests on a synthetic 2 km ENU grid: the empty case is
  all-zero (constant); an exclusion zone is strongly negative inside / ~0 outside; a burn
  perimeter is 0 inside / strongly negative outside; a witness cone is 0 in-sector and lower
  out-of-sector; a first-report Gaussian peaks (~0) at the point and falls off; a V apex favors
  the interior over behind it; and a constraint's contribution scales linearly with its weight.

**Verify:** `tsc --noEmit` clean; `npm test` green incl. the prior tests. Each kind produces the
expected prior shape and the empty case is a flat constant — the invariance the fusion in Stage 3
turns into a byte-for-byte v0 match.

---

# Stage 3 — Fuse the prior into the posterior

```
Add the log_prior term to the posterior — the one-line-in-concept Bayesian fusion (CRESEARCH.md §4.1).

1. src/geo/posterior.ts: compute log_post = buildLogPrior(activeMacros, grid) + Σ_i micro log-likelihood
   (unchanged), then softmax-normalize as today. HARD INVARIANT: with no macro constraints the prior is
   constant and the output is identical to v0 — assert this, don't just hope.
2. HDR/readout (src/geo/hdr.ts, src/ui/Readout.ts) consume the fused posterior unchanged; add a small,
   honest readout note when a prior is active ("origin area informed by N macro constraints") so the user
   sees that the prior — not just the rays — shaped the region.
3. posterior.test.ts: (a) no-macro invariance — the Marshall demo region + area + mode count are identical
   to the pre-V10 values; (b) an exclusion zone over one lobe of the conflicting demo removes that mode
   (nModes 2 → 1) and moves mass correctly; (c) a witness cone tightens a broad single-mode region toward
   the sector.

Verify: tsc --noEmit clean; npm test green incl. the invariance + fusion tests; the no-macro Marshall
region is byte-for-byte unchanged, an exclusion zone demonstrably moves/removes mass, and the readout notes
the active prior. Report the invariance result + the exclusion-zone effect (area/mode change).
```

## Stage 3 Report

The Bayesian fusion is in — `log_post = log_prior + Σ log_likelihood`.

- **`src/geo/posterior.ts`** — `computePosterior` now takes an optional `constraints` in
  `PosteriorOpts`. After it fixes the grid geometry it builds `buildLogPrior(constraints, grid)`
  over that exact grid and seeds each cell's accumulator with the log-prior term before adding
  the micro von Mises log-likelihoods, then softmax-normalizes as before. **Hard invariant:** an
  empty/omitted `constraints` yields an all-zero prior, so the seed is `+0.0` and the result is
  **byte-for-byte** the v0 posterior — asserted, not hoped (test (a) below compares the full
  `Float64Array`). (`prior.ts` ↔ `posterior.ts` is a runtime-only import cycle — both functions
  are call-time, never module-eval — which builds and runs cleanly.)
- **`src/ui/Readout.ts`** — passes `store.activeMacros()` into the posterior and, when a prior is
  active, shows an honest note: "Origin area informed by N macro constraints (prior × likelihood)"
  so the user sees the prior — not just the rays — shaped the region.
- **`src/map/posteriorLayer.ts` + `src/geo/solution.ts`** — both now consume the fused posterior
  (pass the active macros), so the map field and the exported origin solution reflect the prior;
  the solution's `paramsJson` records the constraint count + the `log_post = log_prior + Σ
  log_likelihood` method string for the export methodology.
- **`src/geo/posterior.test.ts`** — 3 new tests: **(a)** no-macro invariance — the bimodal
  posterior's full value array is identical with `constraints` unset, `[]`, and `undefined`;
  **(b)** an exclusion zone over one lobe of the bimodal case takes `modeCount` **2 → 1** and
  collapses that lobe's mass to <1e-6; **(c)** a tight witness cone shrinks a broad single-mode
  95% area (the prior honestly tightens the region).

**Verify:** `tsc --noEmit` clean; `npm test` green incl. the invariance + fusion tests. The
no-macro Marshall/bimodal posterior is **byte-for-byte unchanged**; an exclusion zone demonstrably
removes a mode (2 → 1) and moves mass; a witness cone tightens the 95% area; and the readout notes
the active prior. All prior existing posterior/solution/hdr/savefile tests still pass unchanged.

---

# Stage 4 — GOA → SOA workflow UI

```
Give the doctrine a shape: draw macro evidence first, then refine with micro nodes.

1. src/map/macroTools.ts (new) + toolbar wiring: token-styled map drawing tools to place each macro
   constraint kind — click a V apex + axis, drop a first-report point (with a radius), draw a witness cone
   (observer + bearing + spread), sketch a burn perimeter / exclusion polygon. Each writes an append-only
   MacroConstraint (V6 discipline) and renders on the map (distinct from micro markers, colour-blind-safe:
   shape + colour, CRESEARCH.md §4.5).
2. A lightweight phase affordance in the panel: Phase 1 "General origin area (macro)" vs Phase 2 "Specific
   origin (micro nodes)" — not a hard gate (an investigator can move between them), just guidance mirroring
   the outside-in doctrine. The readout shows the prior + likelihood both contributing.
3. Edit/void macro constraints through the same superseding + reason flow as nodes (reuse the V6 modal).
4. Confirm the drawn constraints feed prior.ts → the posterior live, and a constraint list (like the node
   list) shows the active macros with their source.

Verify: tsc --noEmit clean; npm test green; drawing a witness cone + an exclusion zone updates the
posterior live and honestly (region tightens/moves), the constraints render colour-blind-safe, and
editing/voiding one supersedes (history retained). Report the tools built + a before/after region for one
drawn constraint.
```

## Stage 4 Report

The doctrine now has a shape: draw macro evidence, then refine with micro nodes.

- **`src/map/macroTools.ts` (new) + `main.ts` wiring** — an injected "Macro" toolbar button opens
  a frosted tools panel with the five constraint tools, a Phase-1 (GOA/macro) / Phase-2 (SOA/
  micro) affordance (guidance, not a hard gate), and a live active-constraints list. Each tool
  arms a map-click capture: **First-report** (one click, soft radius), **V apex** (apex → interior
  click sets the axis), **Witness cone** (observer → a click along the first-smoke bearing, ±20°),
  **Burn perimeter** / **Exclusion zone** (click vertices, double-click to close; double-click zoom
  is suppressed while drawing). Every completion writes an **append-only** `MacroConstraint` (V6)
  via `store.addMacro`, which flows through `prior.ts` → the fused posterior **live**.
- **Colour-blind-safe rendering** — active constraints draw in a dedicated map pane (z 410) with a
  distinct **shape + hue** per kind (blue V-axis polyline + apex dot; teal cone rays + observer;
  amber first-report dot + soft-radius ring; violet solid burn polygon; red dashed exclusion
  polygon) — shape carries the meaning even without colour (CRESEARCH.md §4.5).
- **Edit/void through the V6 flow** — each list row has a void action that runs the same
  stated-reason prompt as nodes and calls `store.voidMacro` (supersedes, history retained).
- The constraints feed `prior.ts` → the posterior and the readout's prior note; the list mirrors
  the node list with each macro's source.

**Verify:** `tsc --noEmit` clean; `npm test` green (**124 tests**); `vite build` succeeds (~2.9 s).
The posterior effect of a drawn constraint is proven by the Stage 3 fusion tests — a witness cone
**shrinks** the 95% area and an exclusion zone **removes a mode** (2 → 1) — which is exactly what
the drawing tools write. The constraints render colour-blind-safe (shape + colour) and void
supersedes (store-tested). The **live before/after map walkthrough** (drawing on the real map and
watching the region move) is a browser interaction I can't drive in this headless env; I did not
capture an on-map screenshot and don't claim one — the underlying write→prior→posterior path is
unit-covered end to end.

---

# Stage 5 — Macro demo + export + coherence/verify + NOW.md

```
Seed the thesis with macro evidence, carry it through export, and prove it end to end.

1. src/demo/presets.ts: a macro-informed preset — the Marshall demo plus a V apex + a witness first-smoke
   cone (and optionally an exclusion zone) — showing the prior HONESTLY tightening/moving the 95% region vs
   the micro-only version, without faking a pinpoint (still a broad, honest area, just better informed).
2. Export (V7): GeoJSON/KML/GeoPackage include a macro-constraints layer; the PDF report lists the macro
   evidence + its source and notes that the origin region is a fused prior×likelihood result (methodology
   appendix updated so the exported explanation matches the About page).
3. Coherence walkthrough: load the macro demo → see the informed region + the readout's prior note → draw
   an additional constraint → export a PDF + GeoPackage and confirm the macro layer + the fused-method note
   appear → do it offline. Confirm the no-macro path still equals v0 exactly. Fix anything that breaks.
4. Update NOW.md: move macro priors / GOA→SOA into "Working" (macro constraints as priors, the fused
   posterior, drawing tools, export inclusion), check the v2 roadmap item, and set the next build to the
   later forward-model work (slope-aware Rothermel back-projection + wind, CRESEARCH.md §4.2–4.4) as the
   next major, explicitly deferred, item.

Verify: tsc --noEmit clean; npm test green (all prior/posterior/export tests); vite build succeeds offline;
the macro demo shows an honestly informed region, exports carry the macro layer + fused-method note, the
no-macro path is byte-for-byte v0, and it all works offline. Report the informed-vs-uninformed region
comparison, the export contents, and confirm NOW.md updated.
```

## Stage 5 Report

The thesis is seeded, carried through the exports, and proven end to end.

- **`src/demo/presets.ts`** — `loadMarshallMacroDemo()` seeds the macro-informed preset: the same
  Marshall micro nodes **plus** a witness first-smoke cone (observer ~1.4 km SSW, bearing 20°
  ±18°) and a V apex (axis into the interior). `loadInto` now accepts `macroConstraints` and
  passes them to `store.load`. Wired into the "Load demo" menu as "Macro-informed (GOA→SOA)".
- **Exports carry the macro layer (V7):**
  - **GeoJSON** — a `kind: "macro"` feature per constraint (geometry + source/weight/params +
    the prior role note), and `nMacroConstraints` in the top-level properties.
  - **KML** — a "Macro constraints (priors)" folder of placemarks (Point/LineString/Polygon +
    ExtendedData).
  - **GeoPackage** — a `macro_constraints` feature table (mixed `GEOMETRY`, WKB) with its
    `gpkg_contents` + `gpkg_geometry_columns` rows, added only when constraints exist.
  - **PDF** — a "MACRO EVIDENCE (PRIORS)" section listing each constraint's kind, source, params,
    and notes, plus a statement that the region is the fused `log_post = log_prior + Σ
    log_likelihood` result (and that no constraints = the micro-only result exactly). The
    solution `paramsJson` records the constraint count + method string.
- **`src/demo/macroDemo.coherence.test.ts` (new)** — 3 tests: the macro-informed 95% region is
  **tighter** than the micro-only region yet still a broad area (>0.1 km², never a pinpoint); the
  exports carry the macro layer (GeoJSON macro features == constraint count + `nMacroConstraints`;
  KML macro folder; solution params disclose `log_prior`); and the **micro-only path carries no
  macro layer** (`nMacroConstraints` 0) — the v0 result unchanged.
- **`NOW.md` updated** — macro priors / GOA→SOA moved into "Working", the v2 roadmap item checked,
  and the next major set to the slope-aware forward model + wind (`CRESEARCH.md` §4.2–4.4),
  explicitly deferred.

**Verify:** `tsc --noEmit` clean; `npm test` green — **127 tests** (23 files); `vite build`
succeeds offline (~3.1 s) with WMM + V7 deps bundled. The macro demo shows an honestly informed
(tighter, still-broad) region; the GeoJSON/KML/GeoPackage/PDF exports carry the macro layer + the
fused-method note; the no-macro path is byte-for-byte v0 (Stage 3 invariance test + the micro-only
export test). The **live end-to-end walkthrough** (loading the demo on the real map, drawing an
extra constraint, and downloading a PDF/GeoPackage to eyeball) is a browser flow I can't drive in
this headless env — the pure builders behind each export are unit-covered and the coherence test
exercises the demo→solution→export path, but I did not click through the running app and don't
claim a screenshot.

---

# After These Stages
- Backtrace now works the way NWCG doctrine does: **macro evidence as a prior** (V apex, witness cone,
  first-report, burn perimeter, exclusion zone) fused with the micro von Mises likelihoods —
  `log_post = log_prior + Σ log_likelihood` — so the origin region reflects where most of the real
  information lives, still honestly broad, never a fabricated pinpoint. Constraints are append-only,
  audited, and carried through the court-ready exports.
- **Deferred on purpose (see `NOW.md`):** the slope-aware forward model (DEM + Rothermel φ_s, elliptical
  back-projection) and wind reconstruction (CRESEARCH.md §4.2–4.4) — run the fire backward instead of
  bending a ray — are the next major, research-grade build; the full native magnetic-QC suite (V9's
  deferral) remains a native-shell item.
- Next major build: **the forward model** — same grid-Bayes substrate, a better `beta_i(x)` from a
  minimum-travel-time solve over a slope-aware ROS raster (CRESEARCH.md §4.2). Only after V6–V10 are solid.
