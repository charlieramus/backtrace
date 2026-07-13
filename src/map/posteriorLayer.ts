// Posterior heatmap — the mockup's stepped muted-purple credible-region field, rendered
// as a real canvas overlay from the TRUE von Mises grid (v4 S1) + HDR regions (v4 S2).
//
// A canvas lives in a custom map pane BELOW the bearing rays / σ wedge / markers but above
// the basemap. It subscribes to the store, recomputes the posterior + HDR regions on any
// change (debounced), and paints the stepped bands with the mockup's drawPosterior
// opacities — 50% core ~0.82, 68→50 ~0.52, 95→68 ~0.25, plus a faint outer feather just
// past the 95% edge — using the muted-purple `--post` ramp for the current theme. The
// 50/68/95 region boundaries are stroked as the mockup's dashed contour rings (sand in
// dark / violet in light), with a small "95%" label. Everything reprojects on pan/zoom/
// resize and re-themes. Cleared when fewer than two bearings exist. It never prints a
// coordinate — the field is always the candidate-origin AREA.

import L from "leaflet";
import type { Store } from "../store";
import type { LatLon } from "../geo/enu";
import { enuToLatLon } from "../geo/enu";
import { computePosterior, type PosteriorGrid } from "../geo/posterior";
import { hdrRegions } from "../geo/hdr";
import { getEffectiveTheme } from "./index";

// Canvas palettes ported from the mockup's PALETTES (post ramp + contour ring color).
const POST_DARK: [number, number, number] = [139, 123, 196];
const POST_LIGHT: [number, number, number] = [120, 98, 176];
const RING_DARK: [number, number, number] = [231, 216, 180]; // sand
const RING_LIGHT: [number, number, number] = [96, 74, 128]; // violet

// Stepped band opacities (mockup drawPosterior) + a faint outer feather.
const A_CORE = 0.82; // inside 50%
const A_MID = 0.52; // 68 -> 50
const A_OUT = 0.25; // 95 -> 68
const A_FEATHER = 0.1; // just past 95%

// Contour styling per level (mockup hdr[]): width + alpha, dashed [6,5].
const CONTOUR: Record<string, { w: number; a: number }> = {
  "0.5": { w: 1.6, a: 0.9 },
  "0.68": { w: 1.4, a: 0.7 },
  "0.95": { w: 1.4, a: 0.55 },
};

interface Edge {
  a: LatLon;
  b: LatLon;
  level: number;
}

function isLight(): boolean {
  return getEffectiveTheme() === "light";
}

export interface PosteriorLayer {
  destroy(): void;
}

/** Create + maintain the posterior heatmap overlay. */
export function initPosteriorLayer(map: L.Map, store: Store): PosteriorLayer {
  const paneName = "bt-posterior";
  if (!map.getPane(paneName)) {
    const p = map.createPane(paneName);
    p.style.zIndex = "350"; // above tiles (200), below overlay SVG (400) + markers (600)
    p.style.pointerEvents = "none";
  }
  const pane = map.getPane(paneName)!;
  const canvas = L.DomUtil.create("canvas", "bt-posterior-canvas", pane) as HTMLCanvasElement;
  canvas.style.position = "absolute";
  const ctx = canvas.getContext("2d")!;

  let grid: PosteriorGrid | null = null;
  let alpha: Float32Array | null = null; // per-cell paint opacity
  let cellLat: Float64Array | null = null;
  let cellLon: Float64Array | null = null;
  let edges: Edge[] = [];
  let labelIdx = -1; // representative outer cell for the "95%" label

  function recompute(): void {
    const inc = store.getIncident();
    const anchor: LatLon | undefined =
      inc.anchorLat != null && inc.anchorLon != null
        ? { lat: inc.anchorLat, lon: inc.anchorLon }
        : undefined;
    const constraints = store.activeMacros();
    grid = computePosterior(store.getAll(), { ...(anchor ? { anchor } : {}), constraints });
    if (!grid) {
      alpha = cellLat = cellLon = null;
      edges = [];
      labelIdx = -1;
      redraw();
      return;
    }
    precompute(grid);
    redraw();
  }

  function precompute(g: PosteriorGrid): void {
    const { nx, ny, cellSizeM, extent, anchor } = g;
    const n = nx * ny;
    const regions = hdrRegions(g);
    const m50 = regions[0].mask;
    const m68 = regions[1].mask;
    const m95 = regions[2].mask;

    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      a[i] = m50[i] ? A_CORE : m68[i] ? A_MID : m95[i] ? A_OUT : 0;
    }
    // outer feather: cells just outside the 95% region that touch it
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const i = y * nx + x;
        if (a[i] > 0 || m95[i]) continue;
        let touches = false;
        for (let dy = -1; dy <= 1 && !touches; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= nx || yy >= ny) continue;
            if (m95[yy * nx + xx]) {
              touches = true;
              break;
            }
          }
        }
        if (touches) a[i] = A_FEATHER;
      }
    }
    // Grid-edge fade: the box is a computational window, not a credible boundary. When the
    // field reaches the box it must dissolve, not end in a hard rectangle — so taper every
    // cell's opacity toward the outer FADE_CELLS ring. Fully-contained fields are unaffected
    // (their edge cells are already transparent).
    const FADE_CELLS = 4;
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const i = y * nx + x;
        if (a[i] <= 0) continue;
        const d = Math.min(x, y, nx - 1 - x, ny - 1 - y);
        if (d < FADE_CELLS) a[i] *= (d + 0.5) / FADE_CELLS;
      }
    }
    alpha = a;

    // cache cell-center lat/lon so pan/zoom repaint only re-projects (cheap), not re-solves
    const lat = new Float64Array(n);
    const lon = new Float64Array(n);
    for (let y = 0; y < ny; y++) {
      const cn = extent.minN + (y + 0.5) * cellSizeM;
      for (let x = 0; x < nx; x++) {
        const ce = extent.minE + (x + 0.5) * cellSizeM;
        const ll = enuToLatLon(ce, cn, anchor);
        lat[y * nx + x] = ll.lat;
        lon[y * nx + x] = ll.lon;
      }
    }
    cellLat = lat;
    cellLon = lon;

    // contour edges: a cell in the region whose neighbor is outside contributes that edge
    const h = cellSizeM / 2;
    const corner = (e: number, nn: number): LatLon => enuToLatLon(e, nn, anchor);
    const out: Edge[] = [];
    const masks: { level: number; mask: Uint8Array }[] = [
      { level: 0.5, mask: m50 },
      { level: 0.68, mask: m68 },
      { level: 0.95, mask: m95 },
    ];
    for (const { level, mask } of masks) {
      for (let y = 0; y < ny; y++) {
        for (let x = 0; x < nx; x++) {
          if (!mask[y * nx + x]) continue;
          const ce = extent.minE + (x + 0.5) * cellSizeM;
          const cn = extent.minN + (y + 0.5) * cellSizeM;
          // Only stroke a boundary against a real in-grid neighbor that is OUTSIDE the region.
          // A cell on the grid's own edge draws nothing there — the box is a computational
          // window, not a credible boundary, so the ring fades out rather than being closed
          // off by a straight line along the rectangle.
          if (x + 1 < nx && !mask[y * nx + x + 1])
            out.push({ a: corner(ce + h, cn - h), b: corner(ce + h, cn + h), level });
          if (x - 1 >= 0 && !mask[y * nx + x - 1])
            out.push({ a: corner(ce - h, cn - h), b: corner(ce - h, cn + h), level });
          if (y + 1 < ny && !mask[(y + 1) * nx + x])
            out.push({ a: corner(ce - h, cn + h), b: corner(ce + h, cn + h), level });
          if (y - 1 >= 0 && !mask[(y - 1) * nx + x])
            out.push({ a: corner(ce - h, cn - h), b: corner(ce + h, cn - h), level });
        }
      }
    }
    edges = out;

    // label anchor: the north-most cell of the 95% region (top of the ring on screen)
    labelIdx = -1;
    for (let y = ny - 1; y >= 0 && labelIdx < 0; y--) {
      for (let x = 0; x < nx; x++) {
        if (m95[y * nx + x]) {
          labelIdx = y * nx + x;
          break;
        }
      }
    }
  }

  function redraw(): void {
    const size = map.getSize();
    const topLeft = map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(canvas, topLeft);
    if (canvas.width !== size.x || canvas.height !== size.y) {
      canvas.width = size.x;
      canvas.height = size.y;
    }
    canvas.style.width = `${size.x}px`;
    canvas.style.height = `${size.y}px`;
    ctx.clearRect(0, 0, size.x, size.y);
    if (!grid || !alpha || !cellLat || !cellLon) return;

    const { nx, ny } = grid;
    // cell footprint in screen pixels from two neighbor centers
    const p00 = map.latLngToContainerPoint([cellLat[0], cellLon[0]]);
    const p10 = map.latLngToContainerPoint([cellLat[1], cellLon[1]]);
    const pRow = map.latLngToContainerPoint([cellLat[nx], cellLon[nx]]);
    const w = Math.ceil(Math.abs(p10.x - p00.x)) + 1;
    const hgt = Math.ceil(Math.abs(pRow.y - p00.y)) + 1;
    const [pr, pg, pb] = isLight() ? POST_LIGHT : POST_DARK;

    for (let i = 0; i < nx * ny; i++) {
      const av = alpha[i];
      if (av <= 0) continue;
      const cp = map.latLngToContainerPoint([cellLat[i], cellLon[i]]);
      if (cp.x < -w || cp.x > size.x + w || cp.y < -hgt || cp.y > size.y + hgt) continue;
      ctx.fillStyle = `rgba(${pr},${pg},${pb},${av})`;
      ctx.fillRect(cp.x - w / 2, cp.y - hgt / 2, w, hgt);
    }

    // contour rings (dashed)
    const [rr, rg, rb] = isLight() ? RING_LIGHT : RING_DARK;
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.lineCap = "round";
    for (const e of edges) {
      const s = CONTOUR[String(e.level)];
      const pa = map.latLngToContainerPoint([e.a.lat, e.a.lon]);
      const pb2 = map.latLngToContainerPoint([e.b.lat, e.b.lon]);
      ctx.strokeStyle = `rgba(${rr},${rg},${rb},${s.a})`;
      ctx.lineWidth = s.w;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb2.x, pb2.y);
      ctx.stroke();
    }
    ctx.restore();

    // "95%" label near the outer ring
    if (labelIdx >= 0) {
      const lp = map.latLngToContainerPoint([cellLat[labelIdx], cellLon[labelIdx]]);
      ctx.save();
      ctx.font = "11px ui-monospace, Consolas, monospace";
      ctx.fillStyle = `rgba(${rr},${rg},${rb},0.9)`;
      ctx.fillText("95%", lp.x + 6, lp.y - 4);
      ctx.restore();
    }
  }

  // --- lifecycle --------------------------------------------------------------
  let debounce = 0;
  function scheduleRecompute(): void {
    clearTimeout(debounce);
    debounce = window.setTimeout(recompute, 60);
  }

  recompute();
  const unsub = store.subscribe(scheduleRecompute);
  map.on("moveend zoomend resize", redraw);
  const themeObserver = new MutationObserver(redraw);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  return {
    destroy() {
      clearTimeout(debounce);
      unsub();
      map.off("moveend zoomend resize", redraw);
      themeObserver.disconnect();
      canvas.remove();
    },
  };
}
