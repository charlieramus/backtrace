// CompassRing — the mockup's signature compass dial, made interactive.
//
// Reproduces design/mockup.reference.html's compass() SVG exactly (the backing disc,
// the outer ring, the 30° ticks with heavier cardinals, the cardinal "N", the
// vermillion σ WEDGE, the ember NEEDLE, the center dot, and the center degree reading
// in --font-data) — then wires drag-to-set. Pointer drag anywhere on the ring sets the
// azimuth (touch-friendly via Pointer Events) and calls back; `set()` re-renders the
// needle + wedge from external (store) state. Colors come from the tokens via style
// var(), so it re-themes for free like the mockup.

const NS = "http://www.w3.org/2000/svg";
const VERMILLION = "rgba(226,74,51,"; // mockup's σ-wedge / warning red
const EMBER = "#ff7a45";
const EMBER_HI = "#ff9a70";

const CX = 60;
const CY = 60;
const R = 48;

/**
 * Screen displacement from the dial center -> azimuth (0–359, clockwise from north).
 * Screen y grows downward, so north (up) is −dy: az = atan2(east, north) = atan2(dx, −dy).
 * Pure + exported so the drag geometry is unit-testable without a browser.
 */
export function screenVectorToAzimuth(dx: number, dy: number): number {
  let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  deg = ((deg % 360) + 360) % 360;
  return Math.round(deg);
}

/** Polar helper: az measured clockwise from up (north). x=cx+r·sin, y=cy−r·cos. */
function P(deg: number, rad: number): [number, number] {
  const a = deg * (Math.PI / 180);
  return [CX + rad * Math.sin(a), CY - rad * Math.cos(a)];
}

function el<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  return e;
}

export interface CompassRingHandle {
  /** Update the dial from state: azimuth (deg, null = unset) + σ (deg, wedge width). */
  set(azDeg: number | null, sigmaDeg: number | null): void;
  destroy(): void;
}

export interface CompassRingOpts {
  /** Called with a normalized 0–359 azimuth whenever the user drags the ring. */
  onAzimuth: (deg: number) => void;
}

/** Wire an <svg viewBox="0 0 120 120"> into an interactive compass dial. */
export function initCompassRing(
  svg: SVGSVGElement,
  opts: CompassRingOpts,
): CompassRingHandle {
  let az: number | null = null;
  let sigma: number | null = null;

  function draw(): void {
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // backing disc + outer ring
    svg.appendChild(el("circle", { cx: CX, cy: CY, r: R + 7, style: "fill:var(--inset)" }));
    svg.appendChild(
      el("circle", {
        cx: CX,
        cy: CY,
        r: R,
        fill: "none",
        style: "stroke:var(--border-strong);stroke-width:1",
      }),
    );

    // 30° ticks (cardinals heavier)
    for (let d = 0; d < 360; d += 30) {
      const card = d % 90 === 0;
      const [x1, y1] = P(d, R);
      const [x2, y2] = P(d, card ? R - 8 : R - 5);
      svg.appendChild(
        el("line", {
          x1,
          y1,
          x2,
          y2,
          style: `stroke:${card ? "var(--text-muted)" : "var(--text-faint)"};stroke-width:${card ? 1.5 : 1}`,
        }),
      );
    }

    // cardinal N
    const [nx, ny] = P(0, R - 16);
    const nt = el("text", {
      x: nx,
      y: ny + 4,
      "text-anchor": "middle",
      "font-size": 10,
      "font-family": "var(--font-data)",
      style: "fill:var(--text-muted)",
    });
    nt.textContent = "N";
    svg.appendChild(nt);

    if (az != null) {
      // σ wedge spanning az ± σ/2 (the dial's honest fan; keep the mockup's visual)
      const half = (sigma ?? 0) / 2;
      if (half > 0) {
        const [wx1, wy1] = P(az - half, R - 2);
        const [wx2, wy2] = P(az + half, R - 2);
        const large = 2 * half > 180 ? 1 : 0;
        svg.appendChild(
          el("path", {
            d: `M${CX} ${CY} L${wx1} ${wy1} A${R - 2} ${R - 2} 0 ${large} 1 ${wx2} ${wy2} Z`,
            fill: `${VERMILLION}.16)`,
            stroke: `${VERMILLION}.4)`,
            "stroke-width": 1,
          }),
        );
      }

      // ember needle + tip + hub
      const [ex, ey] = P(az, R - 6);
      svg.appendChild(
        el("line", {
          x1: CX,
          y1: CY,
          x2: ex,
          y2: ey,
          stroke: EMBER,
          "stroke-width": 2.5,
          "stroke-linecap": "round",
        }),
      );
      svg.appendChild(el("circle", { cx: ex, cy: ey, r: 3, fill: EMBER_HI }));
    }
    // center hub (drawn even when unset, matching the mockup's resting dot)
    svg.appendChild(
      el("circle", {
        cx: CX,
        cy: CY,
        r: 4,
        stroke: EMBER,
        "stroke-width": 1.5,
        style: "fill:var(--surface-1)",
      }),
    );

    // center degree reading
    const rt = el("text", {
      x: CX,
      y: CY + 22,
      "text-anchor": "middle",
      "font-size": 11,
      "font-family": "var(--font-data)",
      "font-weight": 600,
      style: "fill:var(--text)",
    });
    rt.textContent = az == null ? "—" : `${Math.round(az)}°`;
    svg.appendChild(rt);
  }

  // --- drag to set the bearing ------------------------------------------------
  let dragging = false;

  function azFromEvent(e: PointerEvent): number {
    const rect = svg.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return screenVectorToAzimuth(e.clientX - cx, e.clientY - cy);
  }

  function onDown(e: PointerEvent): void {
    dragging = true;
    svg.setPointerCapture(e.pointerId);
    opts.onAzimuth(azFromEvent(e));
    e.preventDefault();
  }
  function onMove(e: PointerEvent): void {
    if (!dragging) return;
    opts.onAzimuth(azFromEvent(e));
    e.preventDefault();
  }
  function onUp(e: PointerEvent): void {
    if (!dragging) return;
    dragging = false;
    try {
      svg.releasePointerCapture(e.pointerId);
    } catch {
      /* capture may already be released */
    }
  }

  svg.style.touchAction = "none";
  svg.style.cursor = "grab";
  svg.addEventListener("pointerdown", onDown);
  svg.addEventListener("pointermove", onMove);
  svg.addEventListener("pointerup", onUp);
  svg.addEventListener("pointercancel", onUp);

  draw();

  return {
    set(azDeg, sigmaDeg) {
      az = azDeg;
      sigma = sigmaDeg;
      draw();
    },
    destroy() {
      svg.removeEventListener("pointerdown", onDown);
      svg.removeEventListener("pointermove", onMove);
      svg.removeEventListener("pointerup", onUp);
      svg.removeEventListener("pointercancel", onUp);
      while (svg.firstChild) svg.removeChild(svg.firstChild);
    },
  };
}
