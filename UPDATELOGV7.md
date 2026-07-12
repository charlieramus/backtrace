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

_Pending._

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

_Pending._

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

_Pending._

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

_Pending._

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

_Pending._

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
