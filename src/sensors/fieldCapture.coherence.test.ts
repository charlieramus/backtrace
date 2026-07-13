import { describe, it, expect } from "vitest";
import { createStore } from "../store";
import { computePosterior } from "../geo/posterior";
import { twoPointBearing } from "../geo/twoPointBearing";
import { projectAlong, type LatLon } from "../geo/enu";
import { buildSaveFile, parseSaveFile } from "../io/savefile";

// Coherence: a field-captured investigation (DEVICE/GNSS position + a two-point GNSS bearing)
// must flow through the EXISTING pipeline unchanged — the posterior consumes the captured σ,
// and the save round-trip preserves the field provenance the PDF/GeoPackage exports read.

const O: LatLon = { lat: 39.953, lon: -105.273 };

/** Simulate a field capture: add a DEVICE/GNSS node, then supersede with a two-point bearing. */
function captureNode(store: ReturnType<typeof createStore>, atAz: number, indicator: "ANGLE_OF_CHAR" | "STAINING"): void {
  const at = projectAlong(O, O, atAz, 800); // node sits 800 m out from the origin
  const node = store.add({
    lat: at.lat,
    lon: at.lon,
    indicatorCode: indicator,
    positionSource: "DEVICE",
    fixType: "GNSS",
    hAccuracyM: 4.2,
    sampleCount: 6,
  });
  if (store.getIncident().anchorLat == null) store.setAnchor(node.lat, node.lon);
  // Two-point bearing pointing back at the origin (fix A at the node, fix B toward origin).
  const b = projectAlong(O, at, (atAz + 180) % 360, 22);
  const bearing = twoPointBearing(
    { lat: at.lat, lon: at.lon, hAccuracyM: 4.2 },
    { lat: b.lat, lon: b.lon, hAccuracyM: 4.2 },
  );
  store.supersede(node.id, {
    azimuthTrueDeg: bearing.azimuthTrueDeg,
    sigmaDeg: bearing.sigmaDeg,
    azimuthSigmaDeg: bearing.sigmaDeg,
    azimuthMethod: "TWO_POINT_GNSS",
    hAccuracyM: 4.2,
  });
}

describe("field-capture coherence", () => {
  it("captured nodes drive the posterior and round-trip with provenance intact", () => {
    const store = createStore();
    captureNode(store, 35, "ANGLE_OF_CHAR");
    captureNode(store, 200, "STAINING");

    // The posterior computes from the captured bearings (two crossings) and points near O.
    const nodes = store.activeNodes();
    expect(nodes).toHaveLength(2);
    for (const n of nodes) {
      expect(n.positionSource).toBe("DEVICE");
      expect(n.fixType).toBe("GNSS");
      expect(n.azimuthMethod).toBe("TWO_POINT_GNSS");
      expect(n.azimuthTrueDeg).not.toBeNull();
      expect(n.sigmaDeg).toBeGreaterThan(0);
    }
    const g = computePosterior(nodes, { anchor: O });
    expect(g).not.toBeNull();

    // Save round-trip preserves the field provenance the exports read.
    const sf = buildSaveFile(store.getState());
    const parsed = parseSaveFile(JSON.stringify(sf));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      // Full append-only history: 2 creates + 2 bearing supersessions = 4 rows.
      expect(parsed.data.nodes).toHaveLength(4);
      const tip = parsed.data.nodes.find((n) => n.azimuthMethod === "TWO_POINT_GNSS");
      expect(tip).toBeTruthy();
      expect(tip?.positionSource).toBe("DEVICE");
      expect(tip?.hAccuracyM).toBe(4.2);
    }
  });
});
