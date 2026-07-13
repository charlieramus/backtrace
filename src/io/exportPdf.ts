// PDF report exporter — the court-ready deliverable an investigator attaches to a case
// file (CRESEARCH.md §4.5, §5). Built with pdf-lib (pure JS, offline, no headless Chrome).
//
// Sections: a header (incident + investigator + datum + chain-of-custody statement), the
// RESULT (the candidate specific-origin AREA — p95 area, spread, mode count, geometry note —
// never a bare "Point of Origin: lat,lon"; a mode point is always labelled a mode of a stated
// credible region with algorithm + node count adjacent), a SELF-DRAWN ENU schematic (nodes as
// spread shapes, bearing rays, the 50/68/95 region rings, a north arrow + scale bar — drawn as
// vector directly on the page, NOT a basemap snapshot), the NODE table, a METHODOLOGY appendix
// (the grid von Mises model, the ENU tangent plane, HDR regions, and — a required Daubert
// factor — the known ~103° indicator error rate stated plainly), and a sources footer.
//
// Geometry comes verbatim from the origin solution (Stage 1); the posterior is never recomputed.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import type { Store, IncidentHeader } from "../store";
import type { Node, SpreadType } from "../domain/node";
import { effectiveSigma } from "../domain/node";
import { getIndicator, indicatorHex } from "../domain/indicators";
import type { Investigator } from "../domain/investigator";
import type { MacroConstraint } from "../domain/macro";
import { enuFromLatLon, type LatLon, type Enu } from "../geo/enu";
import type { OriginSolution } from "../geo/solution";
import { computeManifestHash } from "../domain/recordHash";
import { APP_VERSION } from "./savefile";
import {
  ensureSolution,
  downloadBlob,
  exportFilename,
  recordExport,
  rayMeters,
  rayEnd,
} from "./exportUtil";

const PAGE_W = 612; // US Letter
const PAGE_H = 792;
const MARGIN = 54;
const INK = rgb(0.11, 0.1, 0.09);
const MUTED = rgb(0.42, 0.4, 0.38);
const VIOLET = rgb(0.549, 0.263, 0.965); // #8C43F6
const LINE = rgb(0.82, 0.8, 0.78);

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  return rgb(parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255);
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function spreadLabel(entropy: number): string {
  if (entropy < 0.5) return "tight";
  if (entropy < 0.8) return "moderate";
  return "broad";
}

/** A tiny top-down text cursor for one page. */
class Cursor {
  y: number;
  constructor(
    private page: PDFPage,
    private reg: PDFFont,
    private bold: PDFFont,
    startY = PAGE_H - MARGIN,
  ) {
    this.y = startY;
  }
  text(s: string, size = 10, opts: { bold?: boolean; color?: RGB; x?: number } = {}): void {
    this.page.drawText(s, {
      x: opts.x ?? MARGIN,
      y: this.y,
      size,
      font: opts.bold ? this.bold : this.reg,
      color: opts.color ?? INK,
    });
  }
  line(s: string, size = 10, opts: { bold?: boolean; color?: RGB; gap?: number } = {}): void {
    this.text(s, size, opts);
    this.y -= (opts.gap ?? size + 4);
  }
  wrapped(s: string, size = 10, maxW = PAGE_W - 2 * MARGIN, color: RGB = INK): void {
    const words = s.split(/\s+/);
    let cur = "";
    const flush = (): void => {
      if (cur) {
        this.text(cur, size, { color });
        this.y -= size + 3;
        cur = "";
      }
    };
    for (const w of words) {
      const trial = cur ? `${cur} ${w}` : w;
      if (this.reg.widthOfTextAtSize(trial, size) > maxW) {
        flush();
        cur = w;
      } else cur = trial;
    }
    flush();
  }
  gap(px: number): void {
    this.y -= px;
  }
  rule(): void {
    this.page.drawLine({
      start: { x: MARGIN, y: this.y + 4 },
      end: { x: PAGE_W - MARGIN, y: this.y + 4 },
      thickness: 0.75,
      color: LINE,
    });
    this.y -= 8;
  }
}

// --- the self-drawn ENU schematic -------------------------------------------

function drawSchematic(
  page: PDFPage,
  sol: OriginSolution,
  nodes: Node[],
  anchor: LatLon,
  box: { x: number; y: number; w: number; h: number },
  font: PDFFont,
): void {
  const bearingNodes = nodes.filter((n) => n.azimuthTrueDeg != null);
  const meters = rayMeters(sol, nodes, anchor);

  // collect ENU points to frame: nodes, ray ends, p95 outer rings, modes
  const pts: Enu[] = [];
  const nodeEnu = nodes.map((n) => {
    const e = enuFromLatLon(n.lat, n.lon, anchor);
    pts.push(e);
    return e;
  });
  const rayEndEnu = bearingNodes.map((n) => {
    const end = rayEnd(anchor, { lat: n.lat, lon: n.lon }, n.azimuthTrueDeg as number, meters);
    const e = enuFromLatLon(end.lat, end.lon, anchor);
    pts.push(e);
    return e;
  });
  const regionRingsEnu = (["p95", "p68", "p50"] as const).map((k) =>
    sol.regions[k].coordinates.map((poly) =>
      poly[0].map(([lon, lat]) => {
        const e = enuFromLatLon(lat, lon, anchor);
        pts.push(e);
        return e;
      }),
    ),
  );
  for (const m of sol.modePointsWgs84) pts.push(enuFromLatLon(m.lat, m.lon, anchor));

  let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
  for (const p of pts) {
    if (p.e < minE) minE = p.e;
    if (p.e > maxE) maxE = p.e;
    if (p.n < minN) minN = p.n;
    if (p.n > maxN) maxN = p.n;
  }
  const spanE = Math.max(1, maxE - minE);
  const spanN = Math.max(1, maxN - minN);
  const pad = 16;
  const scale = Math.min((box.w - 2 * pad) / spanE, (box.h - 2 * pad) / spanN);
  const cx = (minE + maxE) / 2;
  const cn = (minN + maxN) / 2;
  const toXY = (e: Enu): { x: number; y: number } => ({
    x: box.x + box.w / 2 + (e.e - cx) * scale,
    y: box.y + box.h / 2 + (e.n - cn) * scale, // north up (page y-up)
  });

  // frame
  page.drawRectangle({ x: box.x, y: box.y, width: box.w, height: box.h, borderColor: LINE, borderWidth: 1 });

  // region rings — p95 (light) → p50 (dark violet), stroked
  const ringStyle: Record<string, { w: number; dash?: number[]; c: RGB }> = {
    p95: { w: 1, dash: [4, 3], c: rgb(0.72, 0.66, 0.86) },
    p68: { w: 1.2, dash: [4, 3], c: rgb(0.62, 0.5, 0.78) },
    p50: { w: 1.4, c: VIOLET },
  };
  (["p95", "p68", "p50"] as const).forEach((k, i) => {
    const st = ringStyle[k];
    for (const ring of regionRingsEnu[i]) {
      for (let j = 0; j < ring.length - 1; j++) {
        const a = toXY(ring[j]);
        const b = toXY(ring[j + 1]);
        page.drawLine({ start: a, end: b, thickness: st.w, color: st.c, dashArray: st.dash });
      }
    }
  });

  // bearing rays
  bearingNodes.forEach((n, i) => {
    const a = toXY(nodeEnu[nodes.indexOf(n)]);
    const b = toXY(rayEndEnu[i]);
    page.drawLine({ start: a, end: b, thickness: 0.8, color: hexToRgb(indicatorHex(n.indicatorCode)), dashArray: [3, 3] });
  });

  // nodes — spread shapes, indicator colour
  nodes.forEach((n, i) => {
    const p = toXY(nodeEnu[i]);
    drawSpreadGlyph(page, n.spreadType, p.x, p.y, hexToRgb(indicatorHex(n.indicatorCode)));
  });

  // mode points — small violet crosshair (labelled in the Result text, not here)
  for (const m of sol.modePointsWgs84) {
    const p = toXY(enuFromLatLon(m.lat, m.lon, anchor));
    page.drawLine({ start: { x: p.x - 4, y: p.y }, end: { x: p.x + 4, y: p.y }, thickness: 1, color: VIOLET });
    page.drawLine({ start: { x: p.x, y: p.y - 4 }, end: { x: p.x, y: p.y + 4 }, thickness: 1, color: VIOLET });
  }

  // north arrow (top-right of the box)
  const nax = box.x + box.w - 18;
  const nay = box.y + box.h - 30;
  page.drawLine({ start: { x: nax, y: nay }, end: { x: nax, y: nay + 16 }, thickness: 1.2, color: INK });
  page.drawLine({ start: { x: nax, y: nay + 16 }, end: { x: nax - 3, y: nay + 11 }, thickness: 1.2, color: INK });
  page.drawLine({ start: { x: nax, y: nay + 16 }, end: { x: nax + 3, y: nay + 11 }, thickness: 1.2, color: INK });
  page.drawText("N", { x: nax - 3, y: nay + 18, size: 8, font, color: INK });

  // scale bar (bottom-left): a "nice" ground length
  const targetM = (box.w * 0.3) / scale;
  const nice = niceRound(Math.max(1, targetM));
  const barPt = nice * scale;
  const sbx = box.x + 12;
  const sby = box.y + 12;
  page.drawLine({ start: { x: sbx, y: sby }, end: { x: sbx + barPt, y: sby }, thickness: 1.4, color: INK });
  page.drawText(nice >= 1000 ? `${nice / 1000} km` : `${nice} m`, { x: sbx, y: sby + 4, size: 7, font, color: MUTED });
}

function drawSpreadGlyph(page: PDFPage, spread: SpreadType, x: number, y: number, color: RGB): void {
  const r = 4.5;
  const stroke = rgb(0.08, 0.07, 0.05);
  switch (spread) {
    case "ADVANCING": {
      const p = [
        { x, y: y + r },
        { x: x + r, y: y - r * 0.75 },
        { x: x - r, y: y - r * 0.75 },
      ];
      for (let i = 0; i < 3; i++)
        page.drawLine({ start: p[i], end: p[(i + 1) % 3], thickness: 1.5, color });
      break;
    }
    case "LATERAL": {
      const p = [
        { x, y: y + r },
        { x: x + r, y },
        { x, y: y - r },
        { x: x - r, y },
      ];
      for (let i = 0; i < 4; i++)
        page.drawLine({ start: p[i], end: p[(i + 1) % 4], thickness: 1.5, color });
      break;
    }
    case "BACKING":
      page.drawRectangle({ x: x - r * 0.8, y: y - r * 0.8, width: r * 1.6, height: r * 1.6, color, borderColor: stroke, borderWidth: 0.5 });
      break;
    case "UNDETERMINED":
      page.drawCircle({ x, y, size: r * 0.85, color, borderColor: stroke, borderWidth: 0.5 });
      break;
  }
}

function niceRound(m: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(m)));
  const f = m / pow;
  const n = f >= 5 ? 5 : f >= 2 ? 2 : 1;
  return n * pow;
}

// --- report body ------------------------------------------------------------

/** Build the court-ready PDF bytes from a solution + the record (pure; DOM-free). */
export async function buildPdf(
  sol: OriginSolution,
  nodes: Node[],
  incident: IncidentHeader,
  investigator: Investigator,
  manifestHash: string | null,
  macros: MacroConstraint[] = [],
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Backtrace origin report — ${incident.name}`);
  doc.setProducer(`Backtrace ${APP_VERSION}`);
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // ---- Page 1: header + result + schematic ----
  const page1 = doc.addPage([PAGE_W, PAGE_H]);
  const c = new Cursor(page1, reg, bold);

  c.line("BACKTRACE — FIRE ORIGIN ANALYSIS", 16, { bold: true });
  c.line("Candidate specific-origin area with honest uncertainty", 10, { color: MUTED, gap: 16 });
  c.rule();

  c.line(`Incident: ${incident.name}`, 11, { bold: true });
  if (incident.agencyIncidentNo) c.line(`Agency incident no.: ${incident.agencyIncidentNo}`, 10, { color: MUTED });
  const invLine = [investigator.fullName, investigator.agency, investigator.qualification].filter(Boolean).join(" · ");
  c.line(`Investigator: ${invLine || "—"}`, 10, { color: MUTED });
  c.line(`Datum: ${incident.datum ?? "WGS84"}   ·   Report generated: ${new Date().toISOString().slice(0, 10)}   ·   App: Backtrace ${APP_VERSION}`, 9, { color: MUTED });
  const active = nodes.length;
  c.line(
    `Chain of custody: ${active} active record${active === 1 ? "" : "s"}, append-only. Manifest hash: ${manifestHash ? manifestHash.slice(0, 16) + "..." : "(unsealed)"}.`,
    9,
    { color: MUTED, gap: 16 },
  );
  c.rule();

  // Result
  c.line("RESULT — CANDIDATE ORIGIN AREA", 12, { bold: true, gap: 18 });
  c.line(`95% credible-region area: ${fmt(sol.region95AreaM2)} m²`, 13, { bold: true });
  c.line(`Field spread: ${spreadLabel(sol.posteriorEntropy)} (normalized entropy ${sol.posteriorEntropy.toFixed(2)})`, 10, { color: MUTED });
  const geomNote =
    sol.conditionNumber == null
      ? "geometry: n/a"
      : sol.conditionNumber > 10
        ? `geometry: POOR (near-parallel bearings, condition ${sol.conditionNumber.toFixed(1)})`
        : `geometry: good (condition ${sol.conditionNumber.toFixed(1)})`;
  c.line(
    `Candidate origins: ${sol.nModes} (${sol.nModes >= 2 ? "the data supports more than one" : "single mode"})   ·   ${geomNote}`,
    10,
    { color: MUTED, gap: 14 },
  );
  c.wrapped(
    "This is a candidate AREA at a stated confidence, not a surveyed point of origin. " +
      `Algorithm ${sol.algorithm} v${sol.algorithmVersion}, ${sol.nNodesUsed} bearing nodes.`,
    9,
    PAGE_W - 2 * MARGIN,
    MUTED,
  );
  // modes — labelled, never bare
  sol.modePointsWgs84.forEach((m, i) => {
    c.line(
      `Posterior mode ${i + 1}: ${m.lat.toFixed(5)}, ${m.lon.toFixed(5)} — a mode of the 95% credible region (not a surveyed origin).`,
      9,
      { color: MUTED },
    );
  });
  c.gap(10);

  // Schematic
  c.line("SCHEMATIC (ENU, self-drawn — nodes, bearings, 50/68/95 regions)", 10, { bold: true, gap: 14 });
  const anchor: LatLon =
    incident.anchorLat != null && incident.anchorLon != null
      ? { lat: incident.anchorLat, lon: incident.anchorLon }
      : { lat: nodes[0]?.lat ?? 0, lon: nodes[0]?.lon ?? 0 };
  const boxH = 230;
  drawSchematic(page1, sol, nodes, anchor, { x: MARGIN, y: c.y - boxH, w: PAGE_W - 2 * MARGIN, h: boxH }, reg);

  // ---- Page 2: node table + methodology ----
  const page2 = doc.addPage([PAGE_W, PAGE_H]);
  const c2 = new Cursor(page2, reg, bold);
  c2.line("INDICATOR NODES", 12, { bold: true, gap: 16 });

  const cols = [
    { h: "Indicator", x: MARGIN, w: 90 },
    { h: "Spread", x: MARGIN + 92, w: 62 },
    { h: "Az deg", x: MARGIN + 156, w: 34 },
    { h: "sigma", x: MARGIN + 192, w: 30 },
    { h: "Method", x: MARGIN + 224, w: 70 },
    { h: "Position", x: MARGIN + 296, w: 66 },
    { h: "hAcc", x: MARGIN + 364, w: 40 },
    { h: "Conf", x: MARGIN + 406, w: 40 },
  ];
  for (const col of cols) page2.drawText(col.h, { x: col.x, y: c2.y, size: 8, font: bold, color: INK });
  c2.y -= 4;
  c2.rule();
  for (const n of nodes) {
    const ind = getIndicator(n.indicatorCode)?.label ?? n.indicatorCode;
    const cells = [
      ind.slice(0, 16),
      n.spreadType.slice(0, 9),
      n.azimuthTrueDeg == null ? "—" : String(Math.round(n.azimuthTrueDeg)),
      effectiveSigma(n) == null ? "—" : String(Math.round(effectiveSigma(n) as number)),
      (n.azimuthMethod ?? "—").slice(0, 12),
      (n.positionSource ?? "—").slice(0, 11),
      n.hAccuracyM == null ? "—" : `${Math.round(n.hAccuracyM)}m`,
      n.investigatorConf ?? "—",
    ];
    const flagged = n.conflictsCluster === true;
    cells.forEach((cell, i) =>
      page2.drawText(cell, { x: cols[i].x, y: c2.y, size: 8, font: reg, color: flagged ? rgb(0.7, 0.2, 0.1) : INK }),
    );
    if (flagged) page2.drawText("!", { x: PAGE_W - MARGIN - 10, y: c2.y, size: 8, font: bold, color: rgb(0.7, 0.2, 0.1) });
    c2.y -= 13;
  }
  c2.gap(16);
  c2.rule();

  // Macro evidence (V10) — the priors that shaped the region, with their source.
  if (macros.length > 0) {
    c2.line("MACRO EVIDENCE (PRIORS)", 12, { bold: true, gap: 12 });
    for (const m of macros) {
      const params: string[] = [];
      if (m.bearingDeg != null) params.push(`bearing ${Math.round(m.bearingDeg)}°`);
      if (m.spreadDeg != null) params.push(`±${Math.round(m.spreadDeg)}°`);
      if (m.radiusM != null) params.push(`radius ${Math.round(m.radiusM)} m`);
      params.push(`weight ${m.weight}`);
      c2.wrapped(`• ${m.kind} — source ${m.source}; ${params.join(", ")}.${m.notes ? ` ${m.notes}` : ""}`, 9);
      c2.gap(2);
    }
    c2.gap(4);
    c2.wrapped(
      "These macro constraints are consumed as a Bayesian PRIOR over the origin location (a region, never a ray). " +
        "The candidate region above is the fused result: log_post = log_prior + sum(log_likelihood). With no macro " +
        "constraints the prior is flat and the region equals the micro-only (indicator) result exactly.",
      9,
    );
    c2.gap(10);
    c2.rule();
  }

  // Methodology appendix
  c2.line("METHODOLOGY APPENDIX", 12, { bold: true, gap: 16 });
  c2.wrapped(
    "Algorithm (GRID_VONMISES_V1). Each indicator provides a true-north back-azimuth toward the origin " +
      "with a large angular uncertainty sigma. Over a grid of candidate origin cells in a local East-North-Up " +
      "(ENU) tangent plane, the likelihood of each cell is the product across nodes of a von Mises density " +
      "in the bearing residual, mixed with a uniform outlier term (epsilon ~= 0.15) so a single wild reading " +
      "cannot veto a cell. Kappa is derived from sigma by Fisher's (1993) inversion. A softmax normalizes the grid.",
    9,
  );
  c2.gap(4);
  c2.wrapped(
    "Credible regions. The 50/68/95% highest-density regions (HDR) are the smallest cell sets holding that " +
      "probability mass; the 95% region is the reported candidate area. Field spread is the normalized entropy; " +
      "the mode count is the number of separated high-density components; geometry conditioning is lambda_max/" +
      "lambda_min of the bearing structure matrix (near-parallel bearings are flagged POOR). Coordinates are " +
      "WGS84 (EPSG:4326).",
    9,
  );
  c2.gap(4);
  c2.wrapped(
    "Known error rate (Daubert factor). The underlying fire-pattern direction indicators carry LARGE directional " +
      "error — a mean of approximately 103° across indicator types (Parker & Babrauskas 2024). The credible " +
      "regions above reflect that error honestly: the result is a candidate area, and it stays broad when the " +
      "indicators disagree. This tool does not, and cannot, output a bare point of origin.",
    9,
    PAGE_W - 2 * MARGIN,
    INK,
  );
  c2.gap(10);
  c2.rule();
  c2.line("SOURCES", 9, { bold: true, gap: 12 });
  c2.wrapped(
    "Parker & Babrauskas (2024), fire-pattern directional-indicator error rates. · NFPA 921, Guide for Fire and " +
      "Explosion Investigations. · Fisher, N. (1993), Statistical Analysis of Circular Data (von Mises / kappa). · " +
      "WGS84 / EPSG:4326 geodetic datum. See CRESEARCH.md §6 for the full source list.",
    8,
    PAGE_W - 2 * MARGIN,
    MUTED,
  );

  return doc.save({ useObjectStreams: false });
}

/** Export the current investigation as a downloaded court-ready `.pdf` (offline). */
export async function exportPdf(store: Store): Promise<void> {
  const sol = ensureSolution(store);
  const incident = store.getIncident();
  if (!sol) return;
  const nodes = store.activeNodes();
  let manifestHash: string | null = null;
  try {
    manifestHash = await computeManifestHash(incident, store.getState().nodes);
  } catch {
    /* Web Crypto unavailable — the report notes "(unsealed)" */
  }
  const bytes = await buildPdf(sol, nodes, incident, store.getInvestigator(), manifestHash, store.activeMacros());
  downloadBlob(bytes, exportFilename(incident.name, "pdf"), "application/pdf");
  recordExport(store, "pdf", sol);
}
