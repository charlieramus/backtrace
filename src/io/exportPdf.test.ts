import { describe, it, expect } from "vitest";
import { inflateSync } from "node:zlib";
import { createStore } from "../store";
import { loadMarshallDemo, loadMarshallMacroDemo } from "../demo/presets";
import { buildSolution } from "../geo/solution";
import { buildPdf } from "./exportPdf";

async function marshallPdf() {
  const store = createStore();
  loadMarshallDemo(store);
  const sol = buildSolution(store)!;
  const bytes = await buildPdf(sol, store.activeNodes(), store.getIncident(), store.getInvestigator(), "deadbeefdeadbeefcafe");
  return { store, sol, bytes };
}

/** Decode PDF bytes to a Latin-1 string (for header + object-def checks). */
function asText(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

/** Decode a PDF content stream's `<hex>` Tj strings (pdf-lib emits text hex-encoded). */
function decodeHexStrings(content: string): string {
  let out = "";
  for (const m of content.matchAll(/<([0-9A-Fa-f]+)>/g)) {
    const hex = m[1];
    for (let i = 0; i + 1 < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    out += " ";
  }
  return out;
}

/** Raw text PLUS the decoded text of every inflated (Flate) content stream. */
function pdfText(bytes: Uint8Array): string {
  const rawStr = asText(bytes); // latin1: 1 char per byte, so string index == byte index
  let out = rawStr;
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rawStr))) {
    const start = m.index + m[0].length;
    const end = rawStr.indexOf("endstream", start);
    if (end < 0) continue;
    try {
      out += "\n" + decodeHexStrings(asText(inflateSync(bytes.subarray(start, end))));
    } catch {
      /* not a Flate stream (e.g. an embedded font) — skip */
    }
  }
  return out;
}

describe("PDF report export", () => {
  it("builds a valid, multi-page PDF for the Marshall demo", async () => {
    const { bytes } = await marshallPdf();
    expect(asText(bytes.slice(0, 5))).toBe("%PDF-"); // valid PDF header
    expect(bytes.length).toBeGreaterThan(3000); // non-trivial
    const text = pdfText(bytes);
    // two pages (Type /Page objects)
    const pageCount = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pageCount).toBe(2);
  });

  it("shows the p95 area + confidence + algorithm + node count — never a bare coordinate", async () => {
    const { sol, bytes } = await marshallPdf();
    const text = pdfText(bytes);
    // the region-95 area number (with thousands separators) is present in the content stream
    expect(text).toContain(Math.round(sol.region95AreaM2).toLocaleString("en-US"));
    expect(text).toContain("95% credible-region area");
    expect(text).toContain("GRID_VONMISES_V1");
    // a mode coordinate only ever appears LABELLED as a mode of a credible region
    expect(text).toContain("a mode of the 95% credible region");
    // never a bare labelled coordinate like "Point of Origin: lat,lon"
    expect(text).not.toMatch(/point of origin\s*:/i);
  });

  it("exports the macro-informed demo whose name has a non-WinAnsi glyph (GOA→SOA)", async () => {
    // Regression: the "→" (U+2192) in the incident name has no WinAnsi glyph and used to
    // make pdf-lib's drawText throw, killing the whole report. It must now generate, with
    // the arrow degraded to the WinAnsi-safe "->".
    const store = createStore();
    loadMarshallMacroDemo(store);
    const sol = buildSolution(store)!;
    const bytes = await buildPdf(
      sol,
      store.activeNodes(),
      store.getIncident(),
      store.getInvestigator(),
      "deadbeefdeadbeefcafe",
      store.activeMacros(),
    );
    expect(asText(bytes.slice(0, 5))).toBe("%PDF-");
    const text = pdfText(bytes);
    expect(text).toContain("GOA->SOA"); // arrow safely transliterated in the drawn text
    expect(text).not.toContain("→"); // the raw glyph never reaches a WinAnsi draw
    expect(text).toContain("MACRO EVIDENCE (PRIORS)"); // macros still rendered
  });

  it("the methodology appendix states the known ~103° indicator error rate", async () => {
    const { bytes } = await marshallPdf();
    const text = pdfText(bytes);
    expect(text).toContain("METHODOLOGY APPENDIX");
    expect(text).toContain("103"); // the Parker & Babrauskas mean directional error
    expect(text).toContain("Parker & Babrauskas 2024");
    expect(text).toContain("Daubert");
  });
});
