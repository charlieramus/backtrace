// Node — one placed fire-pattern indicator on the map.
//
// A Node mirrors the mockup's NODES data ({ indicator, spread, sigma, lat/lon,
// color }) but keyed to the real domain: the color comes from the indicator type
// (not stored on the node), and it carries a real `azimuthTrueDeg` for v3's bearing
// work (null until the compass dial sets it). Shaped so v5's export can serialize
// the store's nodes directly.

import type { IndicatorCode } from "./indicators";
import { getIndicator } from "./indicators";

/**
 * How the fire was spreading where this sign was read. Drives the marker SHAPE
 * (advancing ▲, lateral ◆, backing ■, undetermined ●) — see the mockup's legend.
 */
export type SpreadType = "ADVANCING" | "LATERAL" | "BACKING" | "UNDETERMINED";

export interface Node {
  /** Stable id (also the selection key + serialized key). */
  id: string;
  lat: number;
  lon: number;
  /** Which indicator this is — supplies color, default sigma, MICRO/MACRO scale. */
  indicatorCode: IndicatorCode;
  /** Marker shape / spread direction class. */
  spreadType: SpreadType;
  /** True-north azimuth in degrees, set on the compass dial in v3. Null until then. */
  azimuthTrueDeg: number | null;
  /**
   * Angular uncertainty override in degrees. When null, effectiveSigma() falls back
   * to the indicator's Parker & Babrauskas prior. A non-null value wins.
   */
  sigmaDeg: number | null;
  /** Free-text field note. */
  notes: string;
}

/**
 * The uncertainty (σ, degrees) actually in force for a node: an explicit override
 * wins; otherwise the indicator type's Parker & Babrauskas prior is used. Returns
 * null when neither exists (a macro indicator with no override).
 */
export function effectiveSigma(node: Node): number | null {
  if (node.sigmaDeg != null) return node.sigmaDeg;
  return getIndicator(node.indicatorCode)?.priorSigmaDeg ?? null;
}
