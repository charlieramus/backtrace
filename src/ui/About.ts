// About / methodology overlay (UPDATELOGV8.md) — the honest story the V7 exports
// gesture at, made visible in-app. A full-screen, scrollable, token-styled overlay
// (frosted backdrop + rounded panel) reachable from the toolbar. It reuses the modal
// patterns (close on Esc / backdrop / an explicit close button) and re-themes with the
// app via the existing token system — no gradients, no hero, no network, no external
// assets. It changes nothing about the estimator, the schema, or the exports; opening
// it pauses nothing and closing returns to the exact map state.
//
// Content is data (ABOUT_SECTIONS) so it stays pure and testable in a node env — the
// DOM is only touched when openAbout() actually runs. Stage 1 ships the scaffold with
// stub bodies; Stages 2–3 fill in the real why / math / honesty / sources / author.

import { APP_VERSION } from "../io/savefile";

export interface AboutSection {
  /** Stable id used for the section anchor + heading association. */
  id: string;
  /** Heading text (also the accessible name of the section). */
  title: string;
  /** Section body as trusted, self-authored HTML (no user input, no network). */
  body: string;
}

// Stage 1: headings only, with a short stub body under each. The six sections match
// the log's scaffold. Real content lands in Stages 2 (why / honesty / math) and 3
// (sources / author).
// The mean directional error of NWCG fire-pattern indicators measured in the Parker &
// Babrauskas (2024) test burns — the one number that reframes the whole product. Kept as
// a named constant so the copy below and the tests reference the same figure the exports
// and CRESEARCH.md use (~103°).
export const INDICATOR_ERROR_DEG = 103;

export interface AboutSource {
  /** The formatted citation as trusted HTML (may include emphasis). */
  cite: string;
  /** External URL — opens in a new tab; the page itself never fetches it. */
  href?: string;
  /** The paper that reframes the product — listed and marked first. */
  primary?: boolean;
}

// The CRESEARCH.md §6 list, trimmed to the sources this app actually rests on and ordered
// as the log asks: Parker & Babrauskas first, then the NWCG/NFPA doctrine, WMM2025, the
// geodesy, the forward model, and the circular-statistics reference. External links open in
// a new tab; offline they simply don't navigate (the page issues no fetch of its own).
export const ABOUT_SOURCES: AboutSource[] = [
  {
    primary: true,
    cite: `Parker, K. &amp; Babrauskas, V. (2024). <em>Validation of NWCG Wildfire Directional Indicators in Test Burns in Coastal California.</em> Fire <strong>7</strong>(1), 5. DOI 10.3390/fire7010005.`,
    href: "https://doi.org/10.3390/fire7010005",
  },
  {
    cite: `NWCG (2016). <em>Guide to Wildland Fire Origin and Cause Determination</em>, PMS 412 — the 11 indicator categories and the GOA / SOA doctrine.`,
    href: "https://www.nwcg.gov/publications/pms412",
  },
  {
    cite: `NFPA 921, <em>Guide for Fire and Explosion Investigations</em> (2024 ed.) — the scientific-method and wildfire chapters. NFPA 1033 for investigator qualifications.`,
    href: "https://www.nfpa.org/product/nfpa-921-guide-for-fire-and-explosion-investigations/p0921code",
  },
  {
    cite: `NOAA NCEI / BGS. <em>World Magnetic Model 2025</em> (epoch 2025.0) — declination and the crustal-anomaly error model behind honest compass work.`,
    href: "https://www.ncei.noaa.gov/products/world-magnetic-model",
  },
  {
    cite: `Karney, C. F. F. (2013). <em>Algorithms for geodesics.</em> J. Geodesy <strong>87</strong>(1), 43–55. Implementation: GeographicLib.`,
    href: "https://geographiclib.sourceforge.io/",
  },
  {
    cite: `Rothermel, R. C. (1972). <em>A mathematical model for predicting fire spread in wildland fuels.</em> USDA INT-115. Modern reference: Andrews, P. L. (2018), RMRS-GTR-371.`,
    href: "https://www.fs.usda.gov/research/treesearch/55928",
  },
  {
    cite: `Fisher, N. I. (1993). <em>Statistical Analysis of Circular Data.</em> Cambridge — the von Mises distribution, circular SD, and the κ inversion used by the posterior.`,
    href: "https://doi.org/10.1017/CBO9780511564345",
  },
];

function renderSources(): string {
  const items = ABOUT_SOURCES.map((s) => {
    const inner = s.href
      ? `<a href="${s.href}" target="_blank" rel="noopener noreferrer">${s.cite}</a>`
      : s.cite;
    return `<li class="bt-about-source${s.primary ? " primary" : ""}">${
      s.primary ? `<span class="bt-about-source-tag">Read this first</span>` : ""
    }${inner}</li>`;
  });
  return `
    <p>Every claim on this page traces to the record. Links open in a new tab; the page itself
    fetches nothing, so it stays fully offline (the links just won't navigate without a connection).</p>
    <ul class="bt-about-sources">${items.join("")}</ul>
    <p class="bt-about-note">Full list, including the forward-model and localization-bias references, in
    <code>CRESEARCH.md §6</code>.</p>`;
}

function renderAuthor(): string {
  return `
    <p>Backtrace was built by <strong>Charlie Ramus</strong>, a Colorado wildfire photographer that contributed for the <a href="https://boulderreportinglab.org/2026/03/04/boulder-wildfire-crews-responding-to-vegetation-fire-at-heil-valley-ranch/" target="_blank" rel="noopener noreferrer">Boulder
    Reporting Lab</a> and got interested in what other work he could contribute with. It grew out of standing in burns and being handed tools that projected more
    certainty than the evidence could carry. This one is built to do the opposite: to show the honest
    shape of what the indicators support, and to stay quiet where they don't.</p>
    <p class="bt-about-version"><span class="num">Backtrace v${APP_VERSION}</span> · v0 desk build ·
    runs offline, no account</p>`;
}

export const ABOUT_SECTIONS: AboutSection[] = [
  {
    id: "what",
    title: "What this is",
    body: `
      <p>Backtrace is an honest field instrument for reasoning about where a wildfire started.
      You drop fire-pattern <strong>indicator nodes</strong> on the map, set each one's bearing on
      the compass-ring dial together with an honest angular uncertainty (σ), and Backtrace draws the
      candidate origin as a <strong>probability field</strong> — the stepped purple 50 / 68 / 95 bands
      you see on the map — alongside a plain-language readout.</p>
      <p>It runs offline, keeps no account, and saves investigations as files. Everything on this page
      is the reasoning behind that field: why it's an <em>area</em> and not a dot, how the estimator
      works, and the sources behind every claim.</p>`,
  },
  {
    id: "why",
    title: "Why it was built",
    body: `
      <p>One study reframes the whole problem. In 2024, Parker &amp; Babrauskas ran controlled test
      burns in coastal California and measured how well the standard NWCG fire-pattern indicators
      actually point back at the origin. The answer was humbling: a mean directional error of about
      <strong><span class="num">${INDICATOR_ERROR_DEG}°</span></strong> across indicator types. An
      indicator you'd read as "pointing toward the origin" is, on average, off by more than a right
      angle.</p>
      <p>So a tool that takes those readings and collapses them to a confident pin on the map isn't
      being precise — it's lying. That's the whole reason Backtrace exists. It shows, honestly, how
      much the evidence does and doesn't constrain the origin: a defensible candidate <em>area</em> an
      investigator can stand behind in a report or a courtroom, not a false pinpoint. The restraint
      isn't a limitation of the tool; it <em>is</em> the tool.</p>
      <p class="bt-about-byline">— Charlie Ramus, Colorado wildfire field contributor</p>`,
  },
  {
    id: "math",
    title: "How it works (the math)",
    body: `
      <p>At a working-investigator level (not a statistician's), here is what the estimator does. You
      can watch each idea in the panel readout as you place nodes.</p>
      <ul class="bt-about-list">
        <li><strong>ENU tangent plane.</strong> All the geometry runs in meters on a local flat plane
          — east / north / up — centered on your nodes; latitude and longitude are only touched at the
          very edges. Over an incident-sized area the curvature of the Earth is negligible, and meters
          are the natural unit for the math (CRESEARCH.md §1.1). The readout's <em>geometry</em> chip
          ("good" / "poor") is read off this plane.</li>
        <li><strong>A von Mises likelihood per node.</strong> For any candidate origin cell, each node
          has an expected bearing to that cell; the gap between the node's set azimuth and that
          expected bearing is scored with a <em>von Mises</em> distribution — the circular,
          wrap-around cousin of the bell curve. Its concentration <code>κ</code> comes straight from
          the node's σ (the Fisher 1993 inversion of <code>R = I₁(κ) / I₀(κ)</code>). At σ ≈ 90° the
          <code>κ</code> is tiny and the curve is nearly flat, so the math <em>cannot</em> manufacture
          confidence the reading doesn't contain (CRESEARCH.md §1.3). A 15% uniform outlier mix is
          folded in, so one wildly wrong sign can't veto an otherwise well-supported cell.</li>
        <li><strong>HDR credible regions.</strong> Multiply the node likelihoods across the grid,
          normalize, and the 50 / 68 / 95 bands are <em>highest-density regions</em> — the smallest
          areas holding that much of the probability. They are not error ellipses and assume nothing
          Gaussian: if the field is bimodal, the region is honestly two blobs (CRESEARCH.md §1.4). The
          95% area is the honesty number in the readout's <em>"Candidate area · 95%,"</em> and the
          <em>spread of the field</em> meter summarizes how concentrated it is.</li>
        <li><strong>Why not an oracle, why not a Kalman filter.</strong> Adding nodes tightens the
          estimate — but the true origin can still sit inside a broad region, and tightening is not the
          same as being right. And the origin is a single <em>static</em> point seen through
          heavy-tailed circular noise, not a moving target with tidy Gaussian updates, so a Kalman
          filter is the wrong instrument: it would report a shrinking covariance while the truth sat
          outside it (CRESEARCH.md §0.2, §1.6).</li>
      </ul>`,
  },
  {
    id: "honesty",
    title: "The honesty premise",
    body: `
      <p>Because every indicator carries roughly <span class="num">${INDICATOR_ERROR_DEG}°</span> of
      directional error, Backtrace never prints a bare coordinate. It shows a probability field whose
      credible regions behave the way the evidence behaves: <strong>broad</strong> when the indicators
      disagree, <strong>tighter</strong> when several bearings genuinely cross, and <strong>split into
      two regions</strong> when the data honestly supports two origins.</p>
      <p>That mirrors the NFPA 921 scientific method — form a hypothesis, test it against <em>all</em>
      the data, and never state a conclusion the evidence doesn't carry (CRESEARCH.md §0.3–0.4). It's
      also what makes a result defensible: the readout's <em>"Candidate area · 95%"</em> is the claim,
      the <em>spread of the field</em> says how broad, and the mode-count chip flags when it's bimodal
      ("candidate origins — the data supports both"). Nothing here implies more certainty than the
      indicators support. No export ever prints a single point of origin, and neither does this
      screen.</p>`,
  },
  {
    id: "sources",
    title: "Sources",
    body: renderSources(),
  },
  {
    id: "author",
    title: "About the author",
    body: renderAuthor(),
  },
];

let openBackdrop: HTMLElement | null = null;

/** True while the overlay is on screen (guards double-opens). */
export function isAboutOpen(): boolean {
  return openBackdrop !== null;
}

/**
 * Open the About overlay. Idempotent — a second call while open is a no-op. Returns
 * the backdrop element (mostly for tests / callers that want to close it).
 */
export function openAbout(): HTMLElement {
  if (openBackdrop) return openBackdrop;

  const prevFocus = document.activeElement as HTMLElement | null;

  const backdrop = document.createElement("div");
  backdrop.className = "bt-about-backdrop";

  const panel = document.createElement("div");
  panel.className = "bt-about frost";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "bt-about-title");

  // --- Header: title + a large, always-reachable close target ---------------
  const header = document.createElement("div");
  header.className = "bt-about-head";
  header.innerHTML = `
    <div class="bt-about-heading">
      <div class="eyebrow">Backtrace</div>
      <h2 id="bt-about-title">Why an area, not a dot</h2>
      <p class="bt-about-sub">How the estimator works, why it refuses a pinpoint, and the sources behind it.</p>
    </div>`;

  const closeBtn = document.createElement("button");
  closeBtn.className = "bt-about-close";
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close about");
  closeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`;
  header.appendChild(closeBtn);

  // --- Body: the sections ---------------------------------------------------
  const body = document.createElement("div");
  body.className = "bt-about-body";
  for (const s of ABOUT_SECTIONS) {
    const sec = document.createElement("section");
    sec.className = "bt-about-section";
    sec.id = `about-${s.id}`;
    sec.setAttribute("aria-labelledby", `about-${s.id}-h`);
    sec.innerHTML = `<h3 id="about-${s.id}-h">${s.title}</h3>${s.body}`;
    body.appendChild(sec);
  }

  panel.append(header, body);
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);
  openBackdrop = backdrop;

  const finish = (): void => {
    if (openBackdrop !== backdrop) return;
    openBackdrop = null;
    window.removeEventListener("keydown", onKey);
    backdrop.remove();
    // Return focus to whatever launched the overlay (the toolbar affordance).
    prevFocus?.focus?.();
  };

  function onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") finish();
  }

  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) finish();
  });
  closeBtn.addEventListener("click", finish);
  window.addEventListener("keydown", onKey);

  closeBtn.focus();
  return backdrop;
}

/**
 * Wire a toolbar affordance to open the About overlay. Mirrors initThemeToggle: the
 * button lives in the chrome, the behavior lives here.
 */
export function initAbout(button: HTMLElement): void {
  button.addEventListener("click", () => openAbout());
}
