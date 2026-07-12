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

Built the About overlay and wired it into the chrome, content stubbed.

- **`src/ui/About.ts` (new).** A full-screen, scrollable, token-styled overlay: a `bt-about-backdrop`
  (frosted, blurred, click-outside-to-close) holding a rounded `.bt-about.frost` panel with a header
  (eyebrow + `<h2>` title + subtitle + a 44px round close button) and six `<section>`s. Reuses the
  modal patterns from `src/ui/modal.ts` — closes on **Esc**, **backdrop click**, and the **close
  button**; focus moves to the close button on open and returns to the launching control on close.
  `role="dialog"` + `aria-modal` + `aria-labelledby`, and each section is `aria-labelledby` its own
  `<h3>`. Content lives in an exported `ABOUT_SECTIONS` data array (pure, testable) so the DOM is only
  touched when `openAbout()` runs; `initAbout(button)` mirrors `initThemeToggle` (button in the chrome,
  behavior here). Stage 1 bodies are one-line stubs — the six headings render: **What this is · Why it
  was built · How it works (the math) · The honesty premise · Sources · About the author.**
- **Entry point.** Added an unobtrusive info affordance (`#aboutBtn`) to the top-right chrome cluster in
  `index.html`, beside the theme toggle (styled as a `.theme-toggle.frost` circle with an info glyph,
  `aria-haspopup="dialog"`) — it does not crowd the field controls (Add node / Load demo / Import /
  Export). Wired in `src/main.ts` alongside the theme toggle. Opening pauses nothing; closing removes the
  overlay element, leaving the map state untouched.
- **Theming / offline / field basics.** The overlay is built entirely from existing tokens
  (`var(--surface-1)`, `--text`, `--accent-hi`, radii, shadows) with no hard-coded colors, so it
  re-themes with the app in light + dark via the existing `data-theme` system — no per-theme JS needed.
  No `fetch`/network and no external assets, so it works fully offline. Readable type sizes, a large
  (44px) close target, `max-width` prose columns, and `clamp()` padding; the backdrop is
  `overflow-y:auto` with `overscroll-behavior:contain` and the panel is `width:min(100%,760px)` so there
  is no horizontal scroll at phone width.

Deviation from the spec: the entry point's click wiring lives in `About.ts` + `main.ts` (parallel to how
`theme.ts` is initialized from `main.ts`) rather than inside `toolbar.ts`, since the About overlay is
independent of the store/export/import/demo wiring that `toolbar.ts` owns — keeping it out avoids
threading an unused dependency through that module.

Verify: `tsc --noEmit` clean; `npm test` green (66 → 68 tests; added `src/ui/About.test.ts` locking the
six-section contract in order, since the node test env has no DOM to exercise open/close). The overlay's
DOM open/close/theming were verified by code inspection — this headless environment has no browser or
jsdom to drive a real click, and V8 doesn't require a screenshot; the styling is pure-token (themes in
both modes) and the module issues no network requests (offline-safe).

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

Wrote the real content for the four core sections — honest, specific, sourced inline — in
`src/ui/About.ts`'s `ABOUT_SECTIONS`.

- **"What this is."** Plain statement of the instrument: drop indicator nodes, set each bearing + σ on
  the compass-ring dial, read the candidate origin as the stepped purple 50/68/95 probability field plus
  the readout. Notes it runs offline, no account, files-not-server — and frames the rest of the page.
- **"Why it was built" (author's voice).** Leads with the one fact that reframes the product: Parker &
  Babrauskas (2024) test burns measured a **mean directional error of ~103°** for NWCG fire-pattern
  indicators, so a tool that collapses them to a confident pin "isn't being precise — it's lying."
  Charlie's framing that **the restraint is the product**, signed with a byline. No hype, no pricing
  language.
- **"The honesty premise."** Why Backtrace shows a probability field that stays broad when indicators
  disagree, tightens on a genuine crossing, and splits into two regions when the data supports two
  origins — mapped to NFPA 921's scientific-method loop and the court-defensibility stance
  (CRESEARCH.md §0.3–0.4). Cross-linked to the live readout vocabulary ("Candidate area · 95%," "spread
  of the field," the bimodal mode-count chip).
- **"How it works (the math)."** Investigator-readable, four bullets with small inline formulas: the
  **ENU tangent plane** (meters on a local plane, lat/lon only at the edges — §1.1); the **von Mises
  likelihood per node** (concentration `κ` from σ via the Fisher 1993 inversion `R = I₁(κ)/I₀(κ)`,
  nearly flat at σ ≈ 90°, plus the 15% uniform outlier mix — §1.3); **HDR credible regions** (50/68/95
  highest-density regions, not error ellipses, honestly bimodal — §1.4); and **why not an oracle / why
  not Kalman** (tightening ≠ correctness; a static origin under heavy-tailed circular noise, not a
  moving Gaussian target — §0.2, §1.6).

**The math matches the app's actual estimator — no invented claims.** Every statement was checked against
`src/geo/posterior.ts`: the residual `δ = wrap(θ − β)` scored by a von Mises likelihood, `κ` from
`kappaFromSigma` (the `R = exp(−σ²/2)` → Fisher three-branch inversion), the **ε ≈ 0.15** uniform outlier
mixture, log-likelihoods accumulated and softmax-normalized to the grid; and against `src/geo/hdr.ts` for
the highest-density 50/68/95 regions and area. The ~103° figure is the same number the PDF methodology
appendix (`src/io/exportPdf.ts`) and CRESEARCH.md §6 carry — pinned in code as `INDICATOR_ERROR_DEG` so
the copy can't drift from the exports. Added supporting CSS for the prose (`.bt-about-list`, inline
`code`, byline), all token-driven so it themes in light + dark.

Verify: `tsc --noEmit` clean; `npm test` green — extended `src/ui/About.test.ts` (now 4 tests) to assert
the ~103° rate appears in both the "why" and "honesty" sections and cites Parker & Babrauskas, and that
the math section names the real mechanics (ENU, von Mises, `κ`, the 15% mix, highest-density, Kalman) and
cites §1.1/§1.3/§1.4. Coherence in both themes was verified by inspection (pure-token styling, `em` mutes
rather than colors, prose columns capped for readability); no browser/jsdom in this environment to render
a screenshot.

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

Finished the Sources + author sections and proved the page is honest and coherent.

- **"Sources."** Rendered from a new exported `ABOUT_SOURCES` data array (`src/ui/About.ts`), formatted
  and linked, ordered as the log asks: **Parker & Babrauskas (2024) Fire 7(1),5 with its DOI first**
  (flagged "Read this first" and visually lifted), then NWCG PMS 412, NFPA 921 (+ NFPA 1033), NOAA/BGS
  **WMM2025**, **Karney (2013) + GeographicLib**, **Rothermel (1972) / Andrews RMRS-GTR-371**, and
  **Fisher (1993)** for the circular statistics. Every external link is `target="_blank"
  rel="noopener noreferrer"`; the page issues no `fetch` of its own, so it's safe offline (links simply
  don't navigate without a connection). A closing note points to `CRESEARCH.md §6` for the full list
  (forward-model + localization-bias references).
- **"About the author."** Charlie Ramus, Colorado wildfire field contributor, with the **Boulder
  Reporting Lab** link (same URL as `README.md`) and one honest paragraph on why a field contributor
  built this — being handed tools that projected more certainty than the evidence carried, and building
  the opposite. The app version reads from the real constant (`APP_VERSION` in `src/io/savefile.ts`) →
  "Backtrace v0.1.0 · v0 desk build," so it can't drift from the exports; no build-date constant exists
  in the codebase, so none was fabricated.
- **Coherence pass.** Read the whole page top to bottom. No claim contradicts `CRESEARCH.md` or the
  app's behavior: the ~103° figure is one named constant (`INDICATOR_ERROR_DEG`) shared by the copy and
  the tests and equal to the PDF appendix's "approximately 103°"; the honesty section quotes the live
  readout's actual chip text ("candidate origins — the data supports both"); the math cites the sections
  the estimator implements (§1.1 ENU, §1.3 von Mises/κ/15% mix, §1.4 HDR) and matches
  `src/geo/posterior.ts` + `hdr.ts`; the why-not-Kalman claim cites §0.2/§1.6. Substance agrees with the
  V7 PDF methodology appendix (same premise, same number, same "candidate area, never a point"
  conclusion). Styling is pure-token so it re-themes light/dark, prose columns are capped and the
  backdrop contains its own scroll, so there's no horizontal scroll at phone width.
- **NOW.md updated.** Added a "Working" bullet for the About/methodology page, noted the
  **Defensible-Record set (V6 → V7 → V8) complete**, and repointed "Next action" to **V9 — Field Mode**.

Verify: `tsc --noEmit` clean; `npm test` green (**72 tests**, 16 files — `src/ui/About.test.ts` now
also locks the sources order/DOI/`noopener` and the author's Boulder Reporting Lab link + real version);
`vite build` succeeds (the pre-existing >500 kB chunk warning is the bundled `sql.js`/`pdf-lib` wasm, not
a regression). The full-page render in both themes at phone width was verified by inspection — this
headless environment has no browser/jsdom to produce a screenshot — but the styling is entirely
token-driven and the module makes no network requests, so light/dark and offline behavior follow from the
existing theme system and the absence of any `fetch`/external asset.

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
