// Backtrace app entry.
//
// Stage 1 (UPDATELOGV1.md): the app is an intentionally blank shell. It wires up
// the build — Leaflet's CSS, the design-token entry, and the self-hosted fonts —
// and renders a minimal placeholder that exercises both font families (Inter for
// UI, JetBrains Mono for numerics) so they load from our own origin, never a CDN.
// Stages 3–5 replace this with the real map + chrome.

import "leaflet/dist/leaflet.css";
import "./ui/tokens.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (app) {
  app.innerHTML = `
    <main style="display:grid;place-content:center;gap:8px;height:100vh;text-align:center">
      <p style="font-family:var(--font-ui);margin:0;opacity:.7">Backtrace</p>
      <p class="num" style="margin:0;opacity:.5">v0 · 00.0000, -000.0000</p>
    </main>
  `;
}
