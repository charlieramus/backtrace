charlie

# Backtrace — v1a · Defensible Record 3/3: About & Methodology
# Work on one stage at a time. Do NOT combine stages.

---

## Context
Read `NOW.md` first. Assumes **V6 + V7 shipped**: the defensible record and the court-ready exports. The
app now computes an honest posterior and exports it with a methodology appendix — but inside the app there
is nowhere that explains, to a first-time user or a skeptical investigator, *why* Backtrace refuses to
print a pinpoint, how the math works, or who built it and from what sources.

This is **log 3 of the Defensible-Record set (V6 → V7 → V8)** — the honest story the exports gesture at,
made visible in-app. It is a thin content feature: an About/methodology page.

**The About page = the app's honesty, stated in plain language — why fire-pattern indicators can't be
triangulated, why Backtrace shows an area not a dot, how the estimator works, and the sources behind every
claim.** It is trust infrastructure (CRESEARCH.md §0), not marketing.

This log builds only the **About view, its content (why / methodology / math / sources / author), and its
entry point**. It does **not** change the estimator, the schema, or the exports. It ships **fully offline**
— external source links open in a new tab when online, but the page itself uses no network and no external
assets (self-hosted fonts already exist from v0).

## Decisions (agreed in the CEO review)
- **A dedicated in-app About page**, reachable from the toolbar — a full-screen token-styled overlay
  (reuse the modal/overlay pattern), not a separate route (the app is single-page).
- **Charlie's voice, honest and specific.** The "why it was built" section is the author's note (Charlie
  Ramus, Colorado wildfire field contributor); it names the real problem (indicators carry ~103° of
  directional error) rather than overselling.
- **The math is explained, not hidden.** von Mises grid posterior, ENU tangent plane, HDR credible
  regions, why-not-an-oracle, why-not-Kalman — at a level a working investigator (not a statistician) can
  follow, cross-linked to the exact numbers the app shows.
- **Sources are cited** from CRESEARCH.md §6 — Parker & Babrauskas 2024 first (the paper that reframes the
  whole product), then NWCG PMS 412, NFPA 921, WMM2025, Karney/GeographicLib, Rothermel.
- **Design source of truth stays `design/mockup.reference.html` + `src/ui/tokens.css`.** The About page is
  built from the existing tokens (rounded, frosted, tabular, the same type ramp), themes light/dark, and
  reads as part of the same instrument. No gradients, no AI-slop hero, no dollar/pricing language.
- Thin feature: three stages.

---

# Stage 1 — About view scaffold + entry point

```
Build the About overlay and wire it into the chrome, content stubbed.

1. src/ui/About.ts (new): a full-screen, scrollable, token-styled overlay (frosted backdrop, rounded
   panel, close on Esc / backdrop / an explicit close button — reuse src/ui/modal.ts patterns). Section
   scaffolding with headings only: "What this is", "Why it was built", "How it works (the math)", "The
   honesty premise", "Sources", "About the author". Themed via the existing theme system (src/ui/theme.ts)
   so it re-themes with the app.
2. Entry point: add an unobtrusive "About" affordance to the toolbar (src/ui/toolbar.ts) consistent with
   the mockup's chrome (e.g. an info control near the brand/theme toggle) — do not crowd the field
   controls. Opening it pauses nothing; closing returns to the exact map state.
3. Accessibility/field basics: readable at arm's length, high contrast in both themes, large close target
   (CRESEARCH.md §4.5 — big tap targets), no horizontal scroll on a phone width.

Verify: tsc --noEmit clean; npm test green; the About control opens the overlay, all six sections render
(stub text), it themes correctly in light + dark, closes via Esc/backdrop/button, and works offline (no
network requests). Report open/close + theming + offline.
```

## Stage 1 Report

_Pending._

---

# Stage 2 — Content: why, the honesty premise, and the math

```
Write the real content for the core sections — honest, specific, sourced inline.

1. "What this is" + "Why it was built": Backtrace is an honest field instrument for reasoning about a
   wildfire's origin. State the core fact plainly (Parker & Babrauskas 2024: fire-pattern indicators carry
   ~103° mean directional error — a tool that collapses to a confident dot would be lying) and Charlie's
   framing that the restraint IS the product. Author's voice, no hype.
2. "The honesty premise": why Backtrace shows a probability field with credible regions, stays broad when
   indicators disagree, splits into two regions when the data supports two origins, and never prints a
   bare coordinate — mapped to NFPA 921's scientific-method loop and the court-defensibility stance
   (CRESEARCH.md §0.3–0.4).
3. "How it works (the math)": at an investigator-readable level, with small inline formulas —
   - ENU tangent plane: all geometry in meters on a local plane, lat/lon only at the edges (CRESEARCH §1.1).
   - von Mises likelihood per node: circular noise, kappa from the node's sigma; sigma≈90° → nearly flat,
     so the math refuses false confidence (CRESEARCH §1.3). Note the 15% uniform outlier mix for robustness.
   - HDR credible regions: the 50/68/95 bands are highest-density regions, not error ellipses; area is the
     honesty number the readout shows; multimodality is a feature (CRESEARCH §1.4).
   - Why not an oracle / why not Kalman: adding nodes tightens the estimator while truth stays outside;
     the origin is static with heavy-tailed circular noise (CRESEARCH §0.2, §1.6).
   Cross-link the wording to the live readout labels (candidate area, spread/entropy, mode count, geometry)
   so a user sees the same vocabulary in both places.

Verify: tsc --noEmit clean; npm test green; the three sections render with correct inline formulas/figures,
read coherently in both themes, and the vocabulary matches the live readout. Report that the math section
matches the app's actual estimator (no invented claims) and cites Parker & Babrauskas + the CRESEARCH
sections.
```

## Stage 2 Report

_Pending._

---

# Stage 3 — Sources + author + coherence/verify + NOW.md

```
Finish the Sources + author sections and prove the page is honest and coherent.

1. "Sources": the CRESEARCH.md §6 list, formatted and linked — Parker & Babrauskas (2024) Fire 7(1),5 with
   its DOI first; NWCG PMS 412; NFPA 921; NOAA/BGS WMM2025; Karney (2013) + GeographicLib; Rothermel (1972)
   / Andrews RMRS-GTR-371; Fisher (1993) for the circular statistics. External links open in a new tab and
   are safe offline (no fetch; links simply won't navigate without a connection).
2. "About the author": Charlie Ramus, Colorado wildfire field contributor, with the Boulder Reporting Lab
   link (as in README.md), one honest paragraph on why a field contributor built this. App version + build
   date from the existing version constants (savefile.ts APP_VERSION).
3. Coherence pass: read the whole page top to bottom in both themes on a phone-width viewport; confirm no
   claim in it contradicts CRESEARCH.md or the app's behavior (especially the honesty/no-pinpoint stance
   and the error-rate number), every source resolves, and it matches the PDF report's methodology appendix
   (V7) in substance so the in-app and exported explanations agree.
4. Update NOW.md: add a "Working" bullet for the About/methodology page, note the Defensible-Record set
   (V6–V8) complete, and set the next build to V9 field mode.

Verify: tsc --noEmit clean; npm test green; vite build succeeds; the full page reads coherently in light +
dark at phone width, all sources resolve, and the content agrees with CRESEARCH.md + the V7 methodology
appendix. Report the source list rendered, author section present, and confirm NOW.md updated.
```

## Stage 3 Report

_Pending._

---

# After These Stages
- Backtrace now **explains itself**: an in-app About/methodology page carries Charlie's why, the honesty
  premise, an investigator-readable account of the von Mises/ENU/HDR math, and the sources — agreeing with
  the exported PDF appendix and never overstating what the indicators can do. The Defensible-Record set
  (V6 schema → V7 export → V8 about) is complete.
- **Deferred on purpose (see `NOW.md`):** live field capture (GPS + two-point GNSS bearing + honest
  compass) that fills the provenance fields is **V9**; macro-constraint priors and the GOA→SOA workflow
  are **V10**; the slope-aware forward model + wind are later (CRESEARCH.md §4.2–4.4).
- Next major build: **V9 — Field Mode**, wiring the same store, ENU core, posterior, and design system to
  live phone sensors so the app can be used standing in the burn, not just at the desk.
