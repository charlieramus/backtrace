// Backtrace app entry.
//
// v1 (UPDATELOGV1.md): mount the real Leaflet map + the top chrome behavior (theme
// toggle, offline chip).
// v2 (UPDATELOGV2.md): make the map placeable — the indicator picker + spread
// control in the panel, placement mode on the "Add node" button, and the geo-anchored
// spread-shaped markers, all reading/writing the shared store.

import "leaflet/dist/leaflet.css";
import "./ui/tokens.css";
import "./ui/app.css";
import { createMap } from "./map";
import { initMarkers } from "./map/markers";
import { initPlacement } from "./map/placement";
import { initPosteriorLayer } from "./map/posteriorLayer";
import { initWedge } from "./map/wedge";
import { initRays } from "./map/rays";
import { initScaleBar } from "./map/scalebar";
import { applyStoredTheme, initThemeToggle } from "./ui/theme";
import { initOfflineChip } from "./ui/offline";
import { initIndicatorPicker } from "./ui/components/indicatorPicker";
import { initSpreadControl } from "./ui/components/spreadControl";
import { initNodeList } from "./ui/NodeList";
import { initPanelMeta } from "./ui/panelMeta";
import { initSelectedNode } from "./ui/SelectedNode";
import { initReadout } from "./ui/Readout";
import { store } from "./store";

// Restore a persisted theme choice before the map mounts so the first basemap
// (dark vs light) matches without a flash.
applyStoredTheme();

const map = createMap("map");

const themeBtn = document.getElementById("themeBtn");
if (themeBtn) initThemeToggle(themeBtn);

const statusChip = document.getElementById("statusChip");
if (statusChip) initOfflineChip(statusChip);

// --- v2: placeable map -------------------------------------------------------
// The posterior heatmap sits in its own pane (z 350) beneath everything; then the
// direction layers (overlay pane) — σ wedge under rays — under the markers. All
// geo-anchored via the ENU core.
initPosteriorLayer(map, store);
initWedge(map, store);
initRays(map, store);
initMarkers(map, store);

// Live scale bar reflecting the map's real scale (v3 Stage 3).
const scaleEl = document.querySelector<HTMLElement>(".scale");
if (scaleEl) initScaleBar(map, scaleEl);

// Panel controls: pick the armed indicator + set the selected node's spread.
const panelControls = document.getElementById("panelControls");
if (panelControls) {
  initIndicatorPicker(panelControls, store);
  initSpreadControl(panelControls, store);
}

// Candidate-area readout (honest posterior summary) — above the selected-node card.
const readout = document.getElementById("readout");
if (readout) initReadout(readout, store);

// Selected node · bearing card (compass-ring dial + editable azimuth/σ).
const selectedNode = document.getElementById("selectedNode");
if (selectedNode) initSelectedNode(selectedNode, store);

// Node list + live panel meta (count + anchor).
const nodelist = document.getElementById("nodelist");
if (nodelist) initNodeList(nodelist, store);
initPanelMeta(store);

// Placement mode: the primary "Add node" toolbar button arms map clicks.
const addBtn = document.querySelector<HTMLElement>(".toolbar .tbtn.primary");
const placement = addBtn ? initPlacement(map, store, addBtn) : null;

// The dashed "Click the map to place a node" row also arms placement.
const addRow = document.getElementById("addRow");
if (addRow && placement) addRow.addEventListener("click", () => placement.arm());
