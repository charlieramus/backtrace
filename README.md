# Backtrace

**An honest field instrument for reasoning about where a wildland fire started.**

You walk the burn with a map, flag physical fire-pattern indicators, and record the
direction each one points. Backtrace fuses those bearings — each with its own angular
uncertainty — into a probability field for the origin: a heatmap with credible regions,
not a single false-precision dot.

The restraint is the whole idea. Peer-reviewed testing found fire-pattern indicators
carry roughly **103° of mean directional error** (Parker & Babrauskas, 2024), so a tool
that collapses to a confident coordinate would be lying. Backtrace stays deliberately
broad when the signs disagree, splits into two regions when the data supports two
origins, and never prints a bare point — only a candidate *area*, sized honestly.

Under the hood: a von Mises grid posterior over a local ENU tangent plane (all math in
meters), rendered as stepped credible-region bands (50 / 68 / 95%). It runs entirely in
the browser as an installable PWA — offline, no account, no server — and saves and loads
investigations as plain JSON files.

Built by [Charlie Ramus](https://boulderreportinglab.org/), a Colorado wildfire field
contributor, as a study in making forensic geometry legible without overstating it.

---

*Leaflet + OpenStreetMap · TypeScript · von Mises grid estimator · offline PWA*

See [NOW.md](NOW.md) for status and [CRESEARCH.md](CRESEARCH.md) for the math and geodesy.
