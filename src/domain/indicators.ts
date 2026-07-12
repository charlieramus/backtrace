// Indicator types — the fire-pattern signs a node can carry.
//
// Seeded from Parker & Babrauskas 2024 (SOURCES.MD §1) Table 5: each micro
// indicator's `priorSigmaDeg` is its measured mean directional error (with the
// sample size `n` noted), which becomes a node's default angular uncertainty when
// the user hasn't overridden it. The six colored micro indicators map to the exact
// Okabe-Ito `--ind-*` tokens from design/mockup.reference.html so their markers +
// legend glyphs match the mockup (color = indicator). Macro indicators are direction-
// less priors (v2 "Macro constraints", see NOW.md roadmap) — no prior sigma yet.
//
// `color` holds the CSS custom-property NAME (e.g. "--ind-char"); resolve it to a
// paintable value with indicatorColor() so markers/glyphs stay theme-driven and never
// hard-code a hex (tokens.css owns the actual colors).

export type IndicatorCode =
  | "ANGLE_OF_CHAR"
  | "STAINING"
  | "PROTECTION"
  | "SOOTING"
  | "WHITE_ASH"
  | "GRASS_STEM"
  | "FOLIAGE_FREEZE"
  | "CUPPING"
  | "SPALLING"
  | "CURLING"
  | "V_U_PATTERN";

export type IndicatorScale = "MICRO" | "MACRO";

export interface IndicatorType {
  /** Stable machine code, also the serialized key (v5 export). */
  code: IndicatorCode;
  /** Human label, matching the mockup's node names for the colored micro set. */
  label: string;
  /** MICRO = a local directional sign; MACRO = a directionless area prior (v2). */
  scale: IndicatorScale;
  /**
   * Default angular uncertainty (σ) in degrees — Parker & Babrauskas 2024 Table 5
   * mean directional error. `null` for macro indicators, which carry no bearing.
   */
  priorSigmaDeg: number | null;
  /** Token NAME (e.g. "--ind-char") for the marker/glyph color; null = neutral. */
  color: string | null;
  /** Provenance shown to the investigator so the number is never a bare oracle. */
  evidenceNote: string;
}

// The six colored micro indicators use the mockup's exact --ind-* tokens; the P&B
// sigmas + sample sizes are Table 5. Macro indicators are seeded direction-less for
// v2. Order: micro (legend order) first, then macro.
export const INDICATOR_TYPES: readonly IndicatorType[] = [
  {
    code: "ANGLE_OF_CHAR",
    label: "Angle of char",
    scale: "MICRO",
    priorSigmaDeg: 98,
    color: "--ind-char",
    evidenceNote: "Mean directional error 98° (n=89) — Parker & Babrauskas 2024, Table 5.",
  },
  {
    code: "STAINING",
    label: "Staining",
    scale: "MICRO",
    priorSigmaDeg: 106,
    color: "--ind-stain",
    evidenceNote: "Mean directional error 106° (n=133) — Parker & Babrauskas 2024, Table 5.",
  },
  {
    code: "PROTECTION",
    label: "Protection",
    scale: "MICRO",
    priorSigmaDeg: 81,
    color: "--ind-prot",
    evidenceNote: "Mean directional error 81° (n=39) — Parker & Babrauskas 2024, Table 5.",
  },
  {
    code: "SOOTING",
    label: "Sooting",
    scale: "MICRO",
    priorSigmaDeg: 97,
    color: "--ind-soot",
    evidenceNote: "Mean directional error 97° (n=20) — Parker & Babrauskas 2024, Table 5.",
  },
  {
    code: "WHITE_ASH",
    label: "White ash",
    scale: "MICRO",
    priorSigmaDeg: 81,
    color: "--ind-ash",
    evidenceNote: "Mean directional error 81° (n=6) — Parker & Babrauskas 2024, Table 5.",
  },
  {
    code: "GRASS_STEM",
    label: "Grass stem",
    scale: "MICRO",
    priorSigmaDeg: 98,
    color: "--ind-grass",
    evidenceNote: "Mean directional error 98° (n=7) — Parker & Babrauskas 2024, Table 5.",
  },
  {
    code: "FOLIAGE_FREEZE",
    label: "Foliage freeze",
    scale: "MACRO",
    priorSigmaDeg: null,
    color: null,
    evidenceNote: "Macro area prior; no directional sigma (v2 macro constraints).",
  },
  {
    code: "CUPPING",
    label: "Cupping",
    scale: "MACRO",
    priorSigmaDeg: null,
    color: null,
    evidenceNote: "Macro area prior; no directional sigma (v2 macro constraints).",
  },
  {
    code: "SPALLING",
    label: "Spalling",
    scale: "MACRO",
    priorSigmaDeg: null,
    color: null,
    evidenceNote: "Macro area prior; no directional sigma (v2 macro constraints).",
  },
  {
    code: "CURLING",
    label: "Curling",
    scale: "MACRO",
    priorSigmaDeg: null,
    color: null,
    evidenceNote: "Macro area prior; no directional sigma (v2 macro constraints).",
  },
  {
    code: "V_U_PATTERN",
    label: "V / U pattern",
    scale: "MACRO",
    priorSigmaDeg: null,
    color: null,
    evidenceNote: "Macro area prior; no directional sigma (v2 macro constraints).",
  },
];

const BY_CODE: ReadonlyMap<IndicatorCode, IndicatorType> = new Map(
  INDICATOR_TYPES.map((t) => [t.code, t]),
);

/** Look up an indicator by code. Returns undefined for an unknown code. */
export function getIndicator(code: IndicatorCode): IndicatorType | undefined {
  return BY_CODE.get(code);
}

/**
 * Paintable color for an indicator's marker/glyph — a `var(--ind-*)` reference so
 * it stays theme-driven. Falls back to the muted text token for the direction-less
 * macro indicators (which have no --ind-* color of their own).
 */
export function indicatorColor(code: IndicatorCode): string {
  const token = getIndicator(code)?.color;
  return token ? `var(${token})` : "var(--text-muted)";
}

// Concrete Okabe-Ito hex for each --ind-* token (mirrors src/ui/tokens.css). The court
// exports (V7 GeoJSON/KML/GeoPackage/PDF) run DOM-free, so they can't read a CSS var —
// they resolve the token to this fixed hex. Keep in sync with tokens.css.
const INDICATOR_HEX: Record<string, string> = {
  "--ind-char": "#e24a33",
  "--ind-stain": "#e69f00",
  "--ind-prot": "#56b4e9",
  "--ind-soot": "#009e73",
  "--ind-ash": "#cc79a7",
  "--ind-grass": "#0072b2",
};

/** Concrete `#rrggbb` for an indicator (offline exports). Macro/neutral → a slate grey. */
export function indicatorHex(code: IndicatorCode): string {
  const token = getIndicator(code)?.color;
  return (token && INDICATOR_HEX[token]) || "#8a8f98";
}
