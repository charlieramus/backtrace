// Backtrace app entry.
//
// Stage 3 (UPDATELOGV1.md): mount the real Leaflet map into the app frame. The
// chrome (toolbar, theme toggle, offline chip, north, scale, legend, panel) is
// added over the map in Stages 4–5.

import "leaflet/dist/leaflet.css";
import "./ui/tokens.css";
import "./ui/app.css";
import { createMap } from "./map";

createMap("map");
