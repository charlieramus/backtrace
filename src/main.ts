// Backtrace app entry.
//
// Stage 3–4 (UPDATELOGV1.md): mount the real Leaflet map, then wire the top chrome
// behavior (theme toggle + offline chip). The remaining static chrome (north,
// scale, legend, panel) is added in Stage 5.

import "leaflet/dist/leaflet.css";
import "./ui/tokens.css";
import "./ui/app.css";
import { createMap } from "./map";
import { applyStoredTheme, initThemeToggle } from "./ui/theme";
import { initOfflineChip } from "./ui/offline";

// Restore a persisted theme choice before the map mounts so the first basemap
// (dark vs light) matches without a flash.
applyStoredTheme();

createMap("map");

const themeBtn = document.getElementById("themeBtn");
if (themeBtn) initThemeToggle(themeBtn);

const statusChip = document.getElementById("statusChip");
if (statusChip) initOfflineChip(statusChip);
