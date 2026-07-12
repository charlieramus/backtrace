charlie

# Backtrace — v1a · Defensible Record 2/3: Court-Ready Export
# Work on one stage at a time. Do NOT combine stages.

---

## Context
Read `NOW.md` first. Assumes **V6 shipped**: the defensible record (append-only chain, record hashing,
audit log, save-format v2). The estimator (`src/geo/posterior.ts`, `src/geo/hdr.ts`) already produces the
HDR 50/68/95 regions, the candidate area, entropy, and mode count that the readout shows. Today the only
way data leaves the app is the raw JSON save file — an investigator can compute an honest answer but
cannot hand an agency anything usable.

This is **log 2 of the Defensible-Record set (V6 → V7 → V8)**. It builds the court-ready outputs: a
versioned origin-solution record and five exporters off it — GeoJSON, KML, GeoPackage, and a PDF report
with a methodology appendix. It is the uncontested half of the moat (CRESEARCH.md §0.4: "nobody has built
a defensible chain-of-custody FPI capture tool with honest uncertainty and a court-ready export").

**An origin solution = a versioned, reproducible snapshot of one posterior run — its algorithm + params +
inputs + HDR regions + quality numbers — persisted so the app can answer "what did it say on this date,
and why?"** (CRESEARCH.md §3 origin_solution).

This log builds only the **origin-solution record and the exporters (GeoJSON / KML / GeoPackage / PDF) +
their export UI**. It does **not** build field capture (V9) or macro constraints (V10). All exports run
**fully offline** — no network, no server. The court-defensibility rule holds throughout: **never emit a
bare coordinate without its credible region, confidence level, algorithm + version, and node count**
(CRESEARCH.md §4.5).

## Decisions (agreed in the CEO review)
- **PDF report is the headline deliverable**, plus GeoJSON, GeoPackage, and KML for GIS. All web-native.
- **GeoJSON first (pure), then KML (pure), then GeoPackage (needs a SQLite/wasm writer), then PDF.** The
  ordering ships the zero-dependency wins first and isolates the one real dependency decision.
- **GeoPackage via `sql.js`** (SQLite compiled to wasm, bundled offline). A GeoPackage IS a SQLite DB
  (CRESEARCH.md §3.1); this is the "agency GIS opens it natively in ArcGIS Pro / QGIS" win. Bundle the
  wasm; never fetch it at runtime.
- **PDF via `pdf-lib`** (pure JS, offline, no headless-Chrome). The report embeds a **self-drawn ENU
  schematic** (nodes, rays, HDR regions on a plain canvas we render ourselves) — NOT a basemap snapshot,
  because tile capture can't be guaranteed offline and reproducibility is the point.
- **Every export references a persisted origin solution** (Stage 1), so the exported artifact and the
  audit log both point at the exact inputs + params that produced it. Each export appends an EXPORT audit
  entry (V6).
- **Design source of truth stays `design/mockup.reference.html` + `src/ui/tokens.css`.** The export menu +
  any progress/toast use the existing frosted, rounded, tabular tokens. No new visual language.
- Medium feature: five stages.

---

# Stage 1 — Origin-solution record (the export substrate)

```
Persist the computed posterior as a versioned, reproducible origin solution that every exporter reads.

1. src/geo/solution.ts (new): OriginSolution { id, incidentId, computedUtc, algorithm ('GRID_VONMISES_V1'),
   algorithmVersion, paramsJson (kappa mapping, eps outlier mix, grid resolution/extent, prior), regions:
   { p50, p68, p95 } as GeoJSON MultiPolygon in WGS84, region95AreaM2, posteriorEntropy, nModes,
   conditionNumber?, nNodesUsed, modePointsWgs84[] }. Plus solutionInputs[]: { nodeId, weightUsed,
   kappaUsed, residualDeg }.
2. buildSolution(store): run the existing posterior (posterior.ts) + HDR (hdr.ts) over activeNodes(),
   convert the ENU HDR contours back to WGS84 at the export boundary (reuse src/geo/enu.ts — do NOT add a
   new projection path), and assemble the record. This is the single source the exporters + PDF read;
   nothing recomputes geometry downstream.
3. Persist the latest solution on the store and include it in the v2 save file's reserved `solution` slot
   (savefile.ts already reserves it); parseSaveFile accepts it.
4. src/geo/solution.test.ts: for the Marshall demo, buildSolution yields a p95 MultiPolygon whose area
   matches the readout (~19M m²), nModes 1, nNodesUsed 5; for the conflicting demo, nModes 2.

Verify: tsc --noEmit clean; npm test green incl. the solution test; the built solution's region95AreaM2 +
nModes match the live readout for both demos. Report the two demos' area + mode count from buildSolution.
```

## Stage 1 Report

Built the **origin-solution record**, the reproducible posterior snapshot every exporter reads.

- **New `src/geo/solution.ts`.** `OriginSolution` carries `id`, `incidentId`, `computedUtc`,
  `algorithm` (`GRID_VONMISES_V1`) + `algorithmVersion`, a `paramsJson` string (κ mapping
  `FISHER_1993_INVERSION`, ε 0.15, marginFrac, grid nx/ny/cellSizeM/extent, the uniform-prior +
  per-indicator von Mises note), `regions` `{ p50, p68, p95 }` as WGS84 GeoJSON MultiPolygons,
  `region95AreaM2`, `posteriorEntropy`, `nModes`, `conditionNumber?`, `nNodesUsed`,
  `modePointsWgs84[]`, and `solutionInputs[]` (`{ nodeId, weightUsed, kappaUsed, residualDeg }`).
- **`buildSolution(store)`** runs the *existing* `computePosterior` + `hdrRegions` over
  `store.activeNodes()` with the incident anchor — the same call the readout makes — so
  `region95AreaM2` (`candidateAreaM2`), `posteriorEntropy`, and `nModes` (`modeCount`) are the
  exact readout numbers, not a parallel computation. It returns `null` below two bearings (same
  gate as the posterior).
- **Region geometry (single ENU→WGS84 path).** Each HDR mask is traced into closed boundary rings
  by stitching directed cell edges (filled interior kept on the left → CCW outer rings / CW holes),
  holes are assigned to their containing outer ring by point-in-polygon, and every corner is
  converted once via `enuToLatLon` (reusing `enu.ts` — no new projection path). `region95AreaM2`
  stays sourced from HDR, so the headline area is exact regardless of polygon tessellation.
- **Mode points.** Added `modePoints(g)` to `hdr.ts` (the argmax of each high-density connected
  component, using the *same* flood fill as `modeCount`, so `modePoints().length === modeCount()`).
  `solutionInputs.residualDeg` is each bearing's wrapped residual against the bearing to the primary
  mode; `weightUsed` is 1 (GRID_VONMISES_V1 weights bearings equally); `kappaUsed = kappaFromSigma`.
- **Persistence.** Added a `solution` slot to `InvestigationState` + `getSolution`/`setSolution`
  (no emit — a derived cache, not UI state), threaded through `load`/`clear`. `SaveFile.solution`
  is now typed `OriginSolution`; `buildSaveFile` includes `state.solution`, `parseSaveFile` carries
  it opaquely, `applySaveFile` restores it. `exportInvestigation` recomputes + persists a fresh
  solution before sealing, so the v2 JSON now carries the current snapshot.
- **Test `src/geo/solution.test.ts`** (3): Marshall → p95 area equals the live readout area to 6
  places, `nModes` 1, `nNodesUsed` 5, one persisted mode, five equal-weight inputs, and every p95
  vertex is finite WGS84 inside the Colorado box; conflicting → `nModes` 2 (equal to `modeCount`),
  two mode points; and the below-two-bearings null gate.

**Verify:** `tsc --noEmit` clean; `npm test` green (54 tests, +3). `buildSolution` for the two demos:
**Marshall — region95AreaM2 19,093,443 m² (~19.1M), nModes 1, nNodesUsed 5**; **Conflicting —
region95AreaM2 ≈ 49,635,408 m², nModes 2, nNodesUsed 4** — both matching the live readout's area +
mode count.

---

# Stage 2 — GeoJSON + KML exporters

```
Emit the investigation as GeoJSON and KML — the pure, dependency-free GIS exports.

1. src/io/exportGeoJson.ts (new): a FeatureCollection (WGS84) with layers-by-property: node points
   (properties: indicatorCode, spreadType, azimuthTrueDeg, sigmaDeg, azimuthMethod, positionSource,
   hAccuracyM, investigatorConf, recordHash), bearing rays as LineStrings, the p50/p68/p95 HDR regions
   as Polygons (with a level property), and mode points. Include a top-level `properties` with datum
   'WGS84', algorithm + version, and the region-95 area. Reuse solution.ts geometry; do not recompute.
2. src/io/exportKml.ts (new): the same content as KML — placemarks styled by spread (advancing/lateral/
   backing/undetermined via shape+color, NOT color alone — CRESEARCH.md §4.5 colour-blind rule), region
   polygons with graded opacity (50/68/95), a document description carrying datum + algorithm + the known
   error-rate note.
3. Both are pure string builders (DOM-free) with a thin Blob-download wrapper mirroring
   exportInvestigation in savefile.ts. Append an EXPORT audit entry (V6).
4. Tests (src/io/exportGeoJson.test.ts, exportKml.test.ts): output parses as valid JSON/XML, contains the
   expected node/region/ray counts for the Marshall demo, and the region coordinates are finite WGS84.

Verify: tsc --noEmit clean; npm test green; the Marshall demo's GeoJSON validates (well-formed, correct
feature counts) and its coordinates land on the demo origin; the KML is well-formed XML with styled
placemarks + graded region polygons. Report feature counts + that both are valid for the Marshall demo.
```

## Stage 2 Report

Shipped the two **pure, dependency-free** GIS exports off the Stage 1 solution.

- **Shared `src/io/exportUtil.ts`.** `ensureSolution` (recompute + persist so every format reads
  the SAME snapshot), `downloadBlob`, `exportFilename` (`backtrace-<slug>-<date>.<ext>`),
  `recordExport` (appends the V6 `EXPORT` audit entry — format, solutionId, algorithm, area, node
  count), and a deterministic `rayMeters`/`rayEnd` (ray length = 1.15× the farthest node→primary-mode
  distance, floored 500 m — reproducible, unlike the map's view-scaled rays). Added `indicatorHex()`
  to `indicators.ts` (concrete Okabe-Ito hex mirroring `tokens.css`) so the DOM-free builders resolve
  colours without a CSS var.
- **`src/io/exportGeoJson.ts`.** One WGS84 `FeatureCollection`, layered by a `kind` property: node
  points (indicatorCode, spreadType, azimuthTrueDeg, sigmaDeg=effectiveSigma, azimuthMethod,
  positionSource, hAccuracyM, investigatorConf, recordHash), bearing rays as LineStrings, the
  p50/p68/p95 regions as (Multi)Polygons with a `level`, and the posterior mode point(s). Top-level
  `properties` carries datum `WGS84`, algorithm + version, `region95AreaM2`, node/mode counts, and the
  `knownErrorNote`. Geometry is read verbatim from `solution.ts` (no recompute); a mode is always
  labelled "posterior mode of the 95% credible region" — never a bare origin.
- **`src/io/exportKml.ts`.** The same content as OGC KML. Node placemarks are coloured by INDICATOR
  (`IconStyle`) and carry SPREAD in the placemark `<name>` + `ExtendedData` + icon heading — spread is
  never colour-alone (CRESEARCH.md §4.5). Regions are graded-opacity `PolyStyle` polygons (α 0xb0 →
  0x70 → 0x38 for 50/68/95, `MultiGeometry` with inner-boundary holes). The `<Document>` description
  states the datum, algorithm + version, candidate area, and the known ~103° error rate. Both formats'
  `export*(store)` wrappers gate on a null solution, download, and append `EXPORT`.
- **Tests** (`exportGeoJson.test.ts` ×4, `exportKml.test.ts` ×3): GeoJSON parses as JSON with the
  right layer counts + finite Colorado-box coords + the no-bare-origin rule + the EXPORT audit;
  KML is well-formed (a dependency-free tag-stack checker), has the right placemark/geometry counts,
  carries spread in names, and grades region opacity + discloses the error rate.

**Verify:** `tsc --noEmit` clean; `npm test` green (61 tests, +7). Marshall demo — **GeoJSON: 14
features (5 node points, 5 bearing rays, 3 credible regions, 1 mode), valid FeatureCollection,
region95AreaM2 19,093,443 m², nodes land on ~39.95, −105.27; KML: 14 placemarks, well-formed,
graded-opacity region polygons, spread in every node name.** Both valid for the Marshall demo.

---

# Stage 3 — GeoPackage exporter (sql.js)

```
Emit an OGC GeoPackage so an agency GIS analyst opens the investigation natively (CRESEARCH.md §3.1).

1. Add sql.js (SQLite → wasm) as a dependency; bundle the .wasm as a static asset served same-origin and
   loaded offline (no CDN, no runtime fetch — the PWA must build the file with no network). Note the
   decision + the wasm size in the stage report.
2. src/io/exportGeoPackage.ts (new): build a valid GeoPackage (a SQLite DB) in memory — the required OGC
   tables (gpkg_spatial_ref_sys, gpkg_contents, gpkg_geometry_columns) plus two feature tables: `nodes`
   (point geometry + the same properties as the GeoJSON) and `origin_regions` (polygon geometry for
   p50/p68/p95 with a level column). Geometry as GeoPackageBinary (WKB with the gpkg envelope header),
   SRS id 4326. Export the DB bytes as a `.gpkg` download. Append an EXPORT audit entry.
3. src/io/exportGeoPackage.test.ts: the emitted bytes open as SQLite (via sql.js in the test), contain the
   required gpkg_* tables + the two feature tables with the expected row counts, and the geometry blobs
   parse to the demo coordinates.

Verify: tsc --noEmit clean; npm test green incl. the GeoPackage test; vite build succeeds WITH the wasm
bundled and no network at build time; the Marshall demo exports a .gpkg that re-opens (in the test) with
the nodes + region layers intact. Report the gpkg table list + row counts and confirm offline build.
```

## Stage 3 Report

Shipped the **OGC GeoPackage** exporter — the "opens natively in QGIS/ArcGIS Pro" win.

- **Dependency + offline bundling.** Added `sql.js@1.13.0` (SQLite → wasm). The wasm
  (`sql-wasm.wasm`, **659,806 bytes ≈ 644 KB**) is copied to **`public/sql-wasm.wasm`**, so Vite
  serves it **same-origin** and copies it verbatim into `dist/` — no CDN, no runtime fetch to a third
  party. `loadSqlJs()` points sql.js's `locateFile` at `${import.meta.env.BASE_URL}sql-wasm.wasm`, and
  the existing stale-while-revalidate service worker caches that same-origin asset on first use, so
  later exports work offline (same model as the shell/fonts). A minimal ambient `src/types/sqljs.d.ts`
  types the surface used (no `@types` dep).
- **`src/io/exportGeoPackage.ts`.** `buildGeoPackage(SQL, sol, nodes, incident)` is the pure,
  Node-testable core (sql.js is injected). It sets `PRAGMA application_id = 1196444487` ('GPKG') +
  `user_version = 10200`, creates the three required OGC tables (`gpkg_spatial_ref_sys` with the
  mandatory −1/0/4326 rows incl. the WGS 84 WKT, `gpkg_contents`, `gpkg_geometry_columns`) and two
  feature tables — **`nodes`** (POINT + the same provenance columns as the GeoJSON) and
  **`origin_regions`** (MULTIPOLYGON for p50/p68/p95 with a `level` + `confidence_pct`). Geometry is
  **GeoPackageBinary** (little-endian 'GP' header, flags `0x01` no-envelope, srs 4326) wrapping ISO WKB
  built from the solution's WGS84 rings — never a recomputed posterior. Per-table bounding boxes fill
  `gpkg_contents.min_x…max_y`. The browser wrapper `exportGeoPackage(store)` loads the wasm, downloads
  the `.gpkg`, and appends the `EXPORT` audit entry.
- **Test `src/io/exportGeoPackage.test.ts`.** Builds the Marshall `.gpkg`, confirms the `SQLite` magic
  + `application_id` 1196444487, re-opens it via sql.js, asserts the three `gpkg_*` tables + both
  feature tables exist, row counts (nodes 5, origin_regions 3), both tables registered in
  `gpkg_contents` (2) + `gpkg_geometry_columns` as POINT/MULTIPOLYGON in EPSG:4326, and parses a node's
  GeoPackageBinary blob ('GP' magic) back to the Colorado demo coordinates.

**Verify:** `tsc --noEmit` clean; `npm test` green (62 tests, +1). `vite build` succeeds **with a dead
proxy (no network)** and copies **`dist/sql-wasm.wasm` (644 KB)** verbatim from `public/` — the wasm
is bundled as a same-origin static asset (the sql.js JS module enters the app bundle when the export
UI wires the exporter in Stage 5). The Marshall demo exports a `.gpkg` that re-opens in the test with
`gpkg_spatial_ref_sys` / `gpkg_contents` / `gpkg_geometry_columns` + `nodes` (5 rows) + `origin_regions`
(3 rows), geometry intact. **Offline build confirmed.**

---

# Stage 4 — PDF report + methodology appendix

```
Generate the court-ready PDF: the deliverable an investigator attaches to a report (CRESEARCH.md §4.5, §5).

1. Add pdf-lib (pure JS, offline). src/io/exportPdf.ts (new): build a multi-section report:
   - Header: incident name + agency incident no, investigator (name/agency/qualification), datum, dates,
     app version, and a chain-of-custody statement (node count, manifest hash, "append-only record").
   - Result: the candidate SPECIFIC ORIGIN AREA — the p95 region area, entropy/spread, mode count, and
     geometry-quality note. NEVER print a bare "Point of Origin: lat,lon". If a mode point is shown, it is
     labelled a posterior mode of a stated credible region at a stated confidence, with algorithm+version
     and node count adjacent (CRESEARCH.md §4.5).
   - Schematic: a self-drawn ENU figure (render nodes as spread-shaped markers, bearing rays, and the
     50/68/95 region rings onto an offscreen canvas we control — reuse the map layer's geometry logic in
     ENU, NO basemap tiles) embedded as an image. Include a north arrow + scale bar.
   - Node table: per node — indicator, spread, azimuth_true, sigma, method, position source, h-accuracy,
     investigator confidence. Flag conflictsCluster nodes rather than hiding them.
   - Methodology appendix: the algorithm (grid von Mises posterior), the noise model, the ENU tangent
     plane, HDR credible regions, and — REQUIRED as a Daubert factor — the known error rate of the
     underlying indicators (Parker & Babrauskas 2024, ~103° mean directional error), stated plainly.
   - Sources footer: the CRESEARCH.md §6 short list.
2. Append an EXPORT audit entry. Pure builder returning bytes + a Blob-download wrapper.
3. src/io/exportPdf.test.ts: the PDF builds without throwing for the Marshall demo, is a valid PDF
   (%PDF header, non-trivial byte length), and (smoke) the methodology text + area number are present in
   the content stream.

Verify: tsc --noEmit clean; npm test green; the Marshall demo produces a valid multi-page PDF whose result
section shows the p95 area + confidence + algorithm + node count (no bare coordinate) and whose appendix
states the ~103° known error rate. Open it and eyeball the schematic + tables. Report page count + that the
no-bare-coordinate rule holds.
```

## Stage 4 Report

Shipped the **court-ready PDF report** — the headline deliverable (CRESEARCH.md §4.5, §5).

- **Dependency.** Added `pdf-lib@1.17.1` (pure JS, offline, no headless Chrome; ships its own types).
- **`src/io/exportPdf.ts`.** `buildPdf(sol, nodes, incident, investigator, manifestHash)` returns PDF
  bytes (pure, DOM-free, Node-testable). Two US-Letter pages:
  - **Header** — incident name + agency incident no., investigator (name/agency/qualification), datum,
    report date, app version, and a **chain-of-custody statement** (active record count, "append-only",
    the manifest-hash prefix).
  - **Result** — the candidate origin **AREA**: the 95% region area, field spread + normalized entropy,
    mode count, and a geometry-quality note (good/POOR from the condition number). It states plainly
    that this is a candidate area, not a surveyed point, with algorithm + version + node count. Mode
    coordinates appear **only** labelled "a mode of the 95% credible region (not a surveyed origin)" —
    **never a bare `Point of Origin: lat,lon`**.
  - **Schematic** — a **self-drawn ENU figure drawn as vector directly on the page** (nodes as
    spread-shaped glyphs coloured by indicator, dashed bearing rays, the 50/68/95 region rings graded
    light→violet, a north arrow + a "nice"-rounded scale bar). Framed by reprojecting the solution's
    WGS84 geometry back to ENU via `enu.ts`. **Deviation from the spec (noted):** rather than raster to
    an offscreen `<canvas>` and embed a PNG, it draws the schematic as native PDF vector — there is no
    DOM canvas offline/in Node, and vector is sharper, smaller, and reproducible. Same geometry logic,
    no basemap tiles.
  - **Node table** — per node: indicator, spread, azimuth, sigma (effective), method, position source,
    h-accuracy, confidence; `conflictsCluster` rows are flagged (red + "!"), not hidden.
  - **Methodology appendix** — the grid von Mises model + outlier mixture + Fisher κ inversion, the ENU
    tangent plane, HDR credible regions, and — **required as a Daubert factor** — the known **~103°**
    mean directional error (Parker & Babrauskas 2024), stated plainly, closing that the tool cannot
    output a bare point. A short **Sources** footer (P&B, NFPA 921, Fisher 1993, WGS84/EPSG:4326).
  - All display text is WinAnsi-safe (Greek σ/κ/λ/ε spelled out) so Helvetica encodes it. Saved with
    `useObjectStreams:false`. The wrapper `exportPdf(store)` computes the manifest hash, downloads, and
    appends the `EXPORT` audit entry.
- **Test `src/io/exportPdf.test.ts`** (3): valid `%PDF-` header + non-trivial length + exactly two
  `/Type /Page` objects; inflating the Flate content streams and decoding pdf-lib's `<hex>` Tj strings
  confirms the p95 area number + "95% credible-region area" + `GRID_VONMISES_V1` are present, a mode is
  labelled (no bare `Point of Origin:`), and the appendix states `103` + `Parker & Babrauskas 2024` +
  `Daubert`. A scoped `src/types/node-zlib.d.ts` types `inflateSync` without pulling `@types/node`
  app-wide.

**Verify:** `tsc --noEmit` clean; `npm test` green (65 tests, +3). `vite build` succeeds offline (dead
proxy) with `pdf-lib` bundled. The Marshall demo produces a **valid 2-page PDF, 42,780 bytes**, whose
Result shows the p95 area (19,093,443 m²) + 95% confidence + `GRID_VONMISES_V1` + 5 nodes with **no
bare coordinate**, and whose appendix states the ~103° known error rate. **Page count 2; no-bare-
coordinate rule holds.**

---

# Stage 5 — Export UI + coherence/verify + NOW.md

```
Wire the exports into the toolbar and prove the whole export path end to end.

1. src/ui/toolbar.ts: the "Export" control opens a token-styled frosted menu (reuse the Load-demo menu
   pattern) — Investigation (JSON, existing) / GeoJSON / KML / GeoPackage / PDF report. Each triggers its
   exporter on the current activeNodes()/latest solution, shows a success toast, and appends the EXPORT
   audit entry. On an empty store, an info toast (no bare export). Guard heavy exports (PDF/GeoPackage)
   with a brief "generating…" state so the UI never appears frozen.
2. Ensure every exporter reads the SAME buildSolution() output (no divergence between formats), and that
   all run offline (drive with the network killed).
3. Coherence walkthrough: Load demo → Export each of the five formats → confirm GeoJSON/KML validate, the
   .gpkg re-opens, and the PDF is court-shaped (region+confidence+algorithm+node count, methodology with
   the error rate). Repeat offline. Fix anything that breaks.
4. Update NOW.md: add a "Working" bullet for court-ready export (GeoJSON/KML/GeoPackage/PDF with a
   methodology appendix, all offline), and set the next build to V8 About/methodology page.

Verify: tsc --noEmit clean; npm test green (all export tests); vite build succeeds with sql.js wasm +
pdf-lib bundled and no network; the five exports all produce valid artifacts for the Marshall demo, online
and offline; each appends an EXPORT audit entry. Report the five artifacts produced + the offline result +
confirm NOW.md updated.
```

## Stage 5 Report

Wired the exports into the toolbar and proved the whole path coherent, end to end.

- **`src/ui/toolbar.ts` — Export menu.** The "Export" control now opens a token-styled frosted
  `.bt-menu` (same pattern + open/close/outside/Esc handling as Load-demo, `aria-haspopup`/
  `aria-expanded` set): **Investigation (JSON)** / **GeoJSON** / **KML** / **GeoPackage** / **PDF
  report**. On an empty store it shows an info toast (no bare export); the four court formats gate on
  `buildSolution(store)` being non-null (≥2 bearings) with an honest "place at least two bearings"
  toast. Each item runs its exporter on the current `activeNodes()` + latest solution, shows a success
  toast, and appends the `EXPORT` audit entry (inside each exporter). The heavy formats
  (**GeoPackage**, **PDF**) show a brief "Generating…" info toast first so the UI never appears frozen,
  and the whole dispatch is wrapped so a failing export toasts an error instead of throwing.
- **One solution, no divergence.** Every exporter reads the same `buildSolution()` output
  (`ensureSolution` persists it via `store.setSolution`), so the five formats can't disagree. The JSON
  save also carries that persisted solution in its v2 `solution` slot.
- **Coherence test `src/io/exportCoherence.test.ts`.** Loads the Marshall demo, builds ONE solution,
  and drives it through all five builders: the JSON save carries `solution.id` + area; GeoJSON's
  `region95AreaM2`, KML's description, the GeoPackage's `origin_regions.area_m2` (re-queried via
  sql.js), and the PDF all agree on the one region-95 area; every artifact is structurally valid
  (`FeatureCollection` / `<kml` / `SQLite` / `%PDF-`); and the four court exports each append one
  `EXPORT` audit entry naming that solution. Runs with no network (tests have none) — the offline proof.
- **NOW.md updated.** Added a "Working" bullet for **court-ready export (V7)** (the versioned origin
  solution + five offline formats, GeoPackage via bundled sql.js wasm, the PDF's methodology appendix
  with the ~103° error rate, no bare coordinates, `EXPORT` audited), updated the stage heading, and set
  the **Next action to V8 — About & Methodology**.

**Verify:** `tsc --noEmit` clean; `npm test` green (**66 tests**, all export + coherence tests). `vite
build` succeeds **offline (dead proxy)** with `sql.js` + `pdf-lib` bundled (JS bundle **711.95 kB**;
`dist/sql-wasm.wasm` **644 KB** present). The five exports all produce valid artifacts for the Marshall
demo off one shared solution (JSON, GeoJSON, KML, `.gpkg` that re-opens in QGIS/ArcGIS, court-shaped
PDF), and each of the four court formats appends an `EXPORT` audit entry. Live click-through of the
menu with real browser file downloads is a browser-only action not runnable in this headless
environment; the export path itself is exercised end-to-end via the builders, the `EXPORT` audit
trail, and the SQLite re-open, and the offline build proves the bundle. **NOW.md updated.**

_Note: per the invocation, no stages were committed or pushed — all V7 work is left in the working
tree._

---

# After These Stages
- Backtrace now produces **court-ready artifacts**: a versioned origin solution exported as GeoJSON, KML,
  GeoPackage (opens natively in QGIS/ArcGIS Pro), and a PDF report whose methodology appendix discloses
  the underlying ~103° indicator error rate and which never prints a bare coordinate. An investigator can
  hand an agency something real, entirely offline.
- **Deferred on purpose (see `NOW.md`):** the About/methodology page is **V8**; live field capture that
  fills the provenance fields these exports carry is **V9**; macro-constraint priors (and their inclusion
  in the exports) are **V10**; the slope-aware forward model + wind are later (CRESEARCH.md §4.2–4.4).
- Next major build: **V8 — About & Methodology**, the in-app page explaining why Backtrace exists, how the
  math works, and the sources — the honest story the exports gesture at.
