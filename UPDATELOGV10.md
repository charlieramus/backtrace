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

_Pending._

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

_Pending._

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

_Pending._

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

_Pending._

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

_Pending._

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
