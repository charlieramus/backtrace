charlie

# Backtrace — v1 · Scaffold, Design System & App Shell (build the mockup's chrome for real)
# Work on one stage at a time. Do NOT combine stages.

---

## Context
Read `NOW.md`, then `CRESEARCH.md` §0–§1 and `SOURCES.MD` §1–§3 for the *why*. But the **visual
source of truth for this whole series is `design/mockup.reference.html`** — a complete, working
single-screen mockup of the app. Open it. The build across `UPDATELOGV1.md`–`UPDATELOGV5.md`
turns that mockup into a real, usable app: a Leaflet map with manually placed fire-indicator
nodes, an honest von Mises posterior, offline support, and file save/load — wearing **exactly**
the mockup's skin.

**This log (v1) builds the foundation and the static chrome.** By the end, the app looks like the
mockup's empty state — the dark, map-forward field instrument with the ember-accented frosted
toolbar, the theme toggle, the offline chip, the north arrow, the scale bar, the legend, and the
empty right panel — running over a real, pannable map, in both light and dark themes. No nodes,
no posterior yet (those are v2–v4).

**The reframe that governs the app (`CRESEARCH.md` §0):** fire pattern indicators carry ~103°
mean directional error (Parker & Babrauskas 2024). The app is a documentation + honest-uncertainty
instrument, never an oracle. The design encodes that honesty — a broad probability field, a
*candidate area* never "the point." Keep that spirit in every label and control you build.

## The mockup is the spec
- `design/mockup.reference.html` is the pixel/behavior reference. Match its tokens, layout,
  spacing, radii, fonts, colors, and copy. When this log and the mockup disagree, **the mockup
  wins** — and note the discrepancy in the stage report.
- The mockup fakes the basemap and draws markers/posterior on a `<canvas>` in normalized coords.
  The real app replaces that with a **real Leaflet map** and geo-anchored layers (v2–v4). But the
  mockup's **CSS, tokens, and overlay chrome are copied essentially verbatim** — they already are
  the design.

## Decisions
- **Stack:** Vite + TypeScript + Vitest. Leaflet + a free (no-API-key) **dark** basemap for the
  map. All geometry later lives in a pure, tested `src/geo/` core with no Leaflet/DOM imports.
- **Design tokens are law.** Everything is driven by the CSS custom properties from the mockup
  (`:root` dark defaults + light overrides). No hard-coded colors/radii in components — only
  `var(--…)`. Three color roles stay strictly separate: **ember** chrome, **muted-purple**
  posterior field, **multi-color** indicator markers, over a dark topo-mood basemap.
- **Two themes, token-level.** Dark-first `:root`, light via `:root[data-theme="light"]` and
  `@media (prefers-color-scheme:light) :root:not([data-theme])`, exactly as the mockup does.
- **Fonts:** Inter (UI) + JetBrains Mono (all numerics, tabular figures). Self-host both as
  license-clean local files — do not hot-link a CDN (offline is a baseline).
- **Chrome is components.** The toolbar, top-right cluster (theme toggle + offline chip), north
  arrow, scale bar, legend, and right panel are real components positioned over the map, styled
  by the tokens — 1:1 with the mockup.
- Five logs total; this is #1 (scaffold + shell). v2 nodes, v3 bearings, v4 posterior, v5
  files/PWA/demo + coherence.

---

# Stage 1 — Project scaffold + fonts + Vitest

```
Stand up the project exactly as the series needs it.

1. Initialize a Vite + TypeScript app at the repo root. Do NOT touch README.md, NOW.md,
   SOURCES.MD, CRESEARCH.md, the design/ folder, or any UPDATELOGV*.md. Add .gitignore for
   node_modules, dist, and local env files.
2. Add Leaflet + its CSS. Add Vitest + one trivial passing test so the runner is wired.
3. Self-host the fonts: add Inter and JetBrains Mono as local woff2 files under src/ui/fonts/
   with @font-face declarations (JetBrains Mono must expose tabular figures). No network font
   requests. If you cannot vendor the exact files, use the closest self-hostable faces and note
   it in the report — but the system stack must still resolve to Inter/JetBrains-like faces.
4. Folder shape: src/ui/ (tokens.css, components), src/domain/ (later), src/geo/ (later),
   src/map/ (later), src/store.ts (later). Create the dirs with placeholder index files as
   needed so imports resolve.

Verify: npm run build succeeds; npm test passes; npm run dev serves a blank app that loads the
self-hosted fonts (check the network tab shows no external font requests). Report the commands
run and the font sources used.
```

## Stage 1 Report

Stood up the Vite + TypeScript + Vitest project at the repo root, wearing the offline-first
constraints from the start. Left `README.md`, `NOW.md`, `SOURCES.MD`, `CRESEARCH.md`, `design/`,
and the `UPDATELOGV*.md` files untouched.

**Build wiring**
- `package.json` (name `backtrace`, matching the pre-existing lockfile) with scripts `dev`
  (`vite`), `build` (`tsc --noEmit && vite build`), `typecheck` (`tsc --noEmit`), `preview`, and
  `test` (`vitest run`). Deps: `leaflet@1.9.4`. Dev deps: `vite@6.4.3`, `vitest@2.1.9`,
  `typescript@5.9.3`, `@types/leaflet@1.9.21`, plus the two `@fontsource` packages used only to
  vendor the woff2 files (see below).
- `tsconfig.json` (strict, bundler resolution, ES2022, DOM libs, `vitest/globals` types).
- `vite.config.ts` — `defineConfig` imported from `vitest/config` so the `test` block typechecks;
  Vitest runs `globals: true`, `environment: "node"`.
- `.gitignore` for `node_modules`, `dist`, local `.env*` (keeping `.env.example`), `.vite`, logs.
- `index.html` + `src/main.ts` entry. `main.ts` imports `leaflet/dist/leaflet.css` (Leaflet + its
  CSS wired) and `./ui/tokens.css`, and renders an intentionally blank placeholder shell that
  exercises both font families (Inter body text + a `.num` JetBrains Mono line) so the browser
  actually loads them. Stages 3–5 replace this with the real map + chrome.
- `src/smoke.test.ts` — one trivial passing test proving the runner is wired.

**Fonts (self-hosted, no network requests)**
- Vendored **Inter** (UI) and **JetBrains Mono** (data/numerics) as local `.woff2` under
  `src/ui/fonts/`, weights 400/500/600/700 each (8 files). These are the real faces, copied out of
  the `@fontsource/inter` and `@fontsource/jetbrains-mono` packages (both SIL OFL, latin subset) —
  so the exact intended faces are vendored, not a substitute.
- `src/ui/fonts/fonts.css` declares all 8 `@font-face` rules with `font-display: swap`; every
  JetBrains Mono face pins tabular figures via `font-feature-settings: "tnum" 1`.
- A placeholder `src/ui/tokens.css` imports `fonts.css`, wires `--font-ui`/`--font-data` to those
  families with the mockup's fallback stacks, sets box-sizing/full-height/base font, and defines
  the `.num` helper (Stage 2 ports the full token system here verbatim).

**Folder shape** (placeholder `index.ts` / `store.ts` so imports resolve for later stages):
`src/ui/` (`tokens.css`, `fonts/`, `components/index.ts`), `src/domain/index.ts`,
`src/geo/index.ts`, `src/map/index.ts`, `src/store.ts`.

**Verify (all green)**
- `npm run build` → `tsc --noEmit` clean, then `vite build` succeeds; all 8 woff2 emit to
  `dist/assets/*.woff2` and the built CSS references them only as same-origin `/assets/…` URLs
  (grep for `https?://` in `dist/assets/*.css` → none).
- `npm test` → 1 file, 1 test passed.
- `npm run dev` (Vite on :5173) serves `/`, `/src/main.ts`, and the fonts CSS with HTTP 200; the
  served `fonts.css` contains no external (`http(s)://`) font URLs. No CDN/googleapis/gstatic
  references anywhere in `src/`.

No deviations from the spec. Note carried forward: the pre-existing `node_modules` + lockfile from
an earlier partial attempt were reused; the stale `dist/` was removed and regenerated by this build.

---

# Stage 2 — Design tokens (dark + light), copied from the mockup

```
Port the mockup's entire token system verbatim. This is the backbone of every later stage.

1. Create src/ui/tokens.css by copying the :root, :root[data-theme="light"], and
   @media(prefers-color-scheme:light) blocks from design/mockup.reference.html EXACTLY. This
   includes: --bg, --surface-1/-2, --border, --border-strong, --text, --text-muted, --text-faint,
   --accent (#ff7a45 ember) / --accent-hi / --accent-dim, the posterior ramp
   (--post-lo/-mid/-hi/-ink) and --sand, the indicator colors (--ind-char/-stain/-prot/-soot/
   -ash/-grass, Okabe-Ito), --ok, the semantic overlays (--fill-1/-2/-strong, --inset, --hover,
   --vignette, --scroll), --panel-w:340px, the radius scale (--r-xs 6 … --r-full 999), the type
   tokens (--font-ui Inter, --font-data JetBrains Mono), and motion (--ease, --dur-fast/-base/-slow)
   and elevation (--sh-1/-2/-3).
2. Wire --font-ui/--font-data to the self-hosted @font-face families from Stage 1.
3. Base styles: box-sizing, full-height html/body, body{background:var(--bg); color:var(--text);
   font-family:var(--font-ui)}, the .num helper (font-data + tabular-nums), .eyebrow, and a
   prefers-reduced-motion guard — all copied from the mockup.
4. Import tokens.css once at the app entry.

Verify: tsc --noEmit clean; the token values in src/ui/tokens.css byte-match the mockup's (spot
diff a handful — --accent, --post-hi, --panel-w, the light --bg). Toggling the OS theme (or a
temporary data-theme="light" on <html>) flips background/text/accent per the mockup. Report the
diff check.
```

## Stage 2 Report

_Pending._

---

# Stage 3 — Leaflet map with a dark, topo-mood basemap

```
Replace the mockup's faked canvas map with a real, pannable Leaflet map that carries the same
dark, muted mood.

1. Render a full-viewport Leaflet map centered on Colorado (~39.5, -105.8, zoom ~7). App frame:
   a full-bleed #map plus a .map-vignette and an .overlay layer above it (copy .app/.map-vignette/
   .overlay structure + CSS from the mockup; the vignette uses var(--vignette)).
2. Basemap: use a free, no-API-key DARK basemap (e.g. CARTO dark-matter). For a topographic feel,
   optionally add a low-opacity terrain/hillshade overlay (e.g. an Esri hillshade tile layer) so
   the ground reads like muted contours, matching the mockup's mood. Keep it dark and quiet so
   the (later) purple field and ember chrome stay legible. Note in a code comment that a true dark
   topo raster (OpenTopoMap dark-filtered, or a keyed MapTiler/Thunderforest topo) is a later
   upgrade; do NOT block on it.
3. Light theme: when data-theme is light (or OS light), swap to a light basemap (e.g. CARTO
   positron or a light terrain) so the map matches the light UI — mirror the mockup's light-map
   intent. Switch basemap layers when the theme changes.
4. Disable Leaflet's default attribution styling clash: keep attribution but style it to sit
   quietly with the tokens (small, muted, rounded).

Verify: npm run dev shows a dark, pannable Colorado map filling the screen with the vignette;
zoom/pan work; switching theme swaps to a matching light basemap. Report both basemaps used and
the theme-swap behavior.
```

## Stage 3 Report

_Pending._

---

# Stage 4 — Toolbar + top-right cluster (theme toggle + offline chip)

```
Build the mockup's top chrome as real, working components.

1. Toolbar (top-left, frosted, rounded): copy .toolbar/.brand/.mark/.tdiv/.tbtn markup + CSS from
   the mockup. The brand is the ember .mark tile + "Backtrace / Origin Tracer". Buttons: "Add
   node" (primary, ember), "Load demo", "Import", "Export" with the mockup's inline SVG icons.
   Wire nothing yet except visuals + hover/focus states (actions arrive in v2/v5) — but the
   buttons must be real <button>s with correct labels and keyboard focus rings.
2. Top-right cluster (.topright): the round frosted theme-toggle button (both sun + moon inline
   SVGs, swapped by CSS per theme — copy the mockup's .theme-toggle rules and the two .ico SVGs)
   and the offline status chip (.status). Position .topright to the LEFT of the panel exactly as
   the mockup does (right: calc(var(--panel-w) + 30px)), and the mobile override.
3. Theme toggle behavior (make it actually work here): clicking toggles data-theme on
   document.documentElement between 'light' and 'dark'; the icon swaps via CSS; persist the choice
   to localStorage and restore on load; still honor OS preference when the user hasn't chosen.
   Re-swap the basemap (Stage 3) on change.
4. Offline chip: reflect real connectivity — listen to window online/offline events and
   navigator.onLine; show "Offline-ready · no account" style copy, with the --ok dot when online
   and a muted/altered state when offline. Never imply server sync (there is none).

Verify: tsc --noEmit clean; the toolbar + top-right cluster match the mockup; the theme toggle
flips the whole app (and basemap) and persists across reload; pulling the network (DevTools
offline) updates the chip. Report the toggle + offline behavior.
```

## Stage 4 Report

_Pending._

---

# Stage 5 — North arrow, scale bar, legend, and the empty right panel

```
Finish the static shell so the app equals the mockup's empty state.

1. North arrow (.compass-n) and scale bar (.scale): copy markup + CSS from the mockup, positioned
   as in the mockup (north offset left of the panel; scale bottom-left). The north arrow is
   ember; the scale bar shows a placeholder 0–500 m for now (v3 can make it reflect the map's real
   scale, optional).
2. Legend (.legend, bottom-left, frosted): copy verbatim — the spread SHAPES row (▲ advancing,
   ◆ lateral, ■ backing, ● undetermined), the posterior bands strip (50/68/95 using --post-lo/
   -mid/-hi), and the honest note ("Purple = candidate origin area, not a single point. Color
   marks the indicator; shape marks spread."). This legend is the key to reading the map; it must
   match exactly.
3. Right panel (.panel, frosted, rounded, scrollable, width var(--panel-w)): build the shell +
   the panel head — eyebrow "Investigation", an incident title (use a placeholder like "New
   investigation"), a meta line (node count "0 nodes" + anchor "—" for now), and the honest
   tagline (.p-tag). Leave the body empty with a friendly empty-state hint ("Click the map to
   place your first node") where the node list will go. Copy .panel/.panel-scroll/.p-head/.p-tag
   CSS from the mockup.
4. Load-in motion: apply the mockup's .load-fade / .toolbar rise + fade animations, all under the
   reduced-motion guard.

Verify: npm run build + tsc --noEmit clean; side-by-side with design/mockup.reference.html the
app is visually indistinguishable in its EMPTY state (toolbar, theme toggle, offline chip, north,
scale, legend, empty panel) in BOTH themes; the map pans behind it. Report the side-by-side check
and any pixel gaps you had to reconcile.
```

## Stage 5 Report

_Pending._

---

# After These Stages
- The app is the mockup's empty state, for real: a dark (or light) map-forward field instrument
  with the ember frosted toolbar, a working theme toggle + offline chip, north arrow, scale bar,
  the legend, and the empty investigation panel — all on the shared token system, over a real
  pannable Colorado map.
- **Next (`UPDATELOGV2.md`):** the domain model (indicator types + Node + store), click-to-place
  nodes, the multi-color spread-shaped markers, and the node list — making the legend mean
  something.
- Deferred to later logs: bearings + compass ring (v3), the von Mises posterior + heatmap bands +
  readouts (v4), export/import + offline PWA + the Colorado demo (v5). Live sensors, WMM
  declination, and the forward model remain post-v0 per `NOW.md`.
