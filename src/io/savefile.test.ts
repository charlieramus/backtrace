import { describe, it, expect } from "vitest";
import {
  buildSaveFile,
  saveFileToJson,
  parseSaveFile,
  applySaveFile,
  sealSaveFile,
  verifyIntegrity,
} from "./savefile";
import { createStore } from "../store";
import { computePosterior } from "../geo/posterior";

function seed() {
  const store = createStore();
  store.setIncidentName("Marshall Fire — desk trace");
  const a = store.add({
    lat: 39.95,
    lon: -105.28,
    indicatorCode: "ANGLE_OF_CHAR",
    spreadType: "ADVANCING",
    azimuthTrueDeg: 284,
    sigmaDeg: 98,
    notes: "char on the fence line",
  });
  store.setAnchor(a.lat, a.lon);
  store.add({
    lat: 39.96,
    lon: -105.27,
    indicatorCode: "STAINING",
    spreadType: "LATERAL",
    azimuthTrueDeg: 12,
    sigmaDeg: 106,
  });
  store.add({
    lat: 39.94,
    lon: -105.3,
    indicatorCode: "PROTECTION",
    spreadType: "BACKING",
    azimuthTrueDeg: null,
    sigmaDeg: null,
  });
  return store;
}

describe("save files", () => {
  it("round-trips an investigation: export -> JSON -> import into a fresh store", () => {
    const src = seed();
    const json = saveFileToJson(buildSaveFile(src.getState()));

    const parsed = parseSaveFile(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const fresh = createStore();
    applySaveFile(fresh, parsed.data, "replace");

    // deep equality of nodes + incident
    expect(fresh.getAll()).toEqual(src.getAll());
    expect(fresh.getIncident()).toEqual(src.getIncident());
    // azimuth + σ + spread survived intact
    const n0 = fresh.getAll()[0];
    expect(n0.azimuthTrueDeg).toBe(284);
    expect(n0.sigmaDeg).toBe(98);
    expect(fresh.getIncident().anchorLat).toBe(39.95);
  });

  it("merge appends imported nodes and keeps the existing ones", () => {
    const src = seed();
    const json = saveFileToJson(buildSaveFile(src.getState()));
    const parsed = parseSaveFile(json);
    if (!parsed.ok) throw new Error(parsed.error);

    const existing = createStore();
    existing.add({ lat: 40, lon: -105, indicatorCode: "SOOTING" });
    applySaveFile(existing, parsed.data, "merge");
    expect(existing.getAll()).toHaveLength(1 + 3);
  });

  it("rejects bad files loudly with a readable message (never a silent load)", () => {
    expect(parseSaveFile("{ not json").ok).toBe(false);

    const notOurs = parseSaveFile(JSON.stringify({ hello: "world" }));
    expect(notOurs.ok).toBe(false);
    if (!notOurs.ok) expect(notOurs.error).toMatch(/not a Backtrace/i);

    const badVersion = parseSaveFile(
      JSON.stringify({ format: "backtrace-investigation", formatVersion: 99, incident: {}, nodes: [] }),
    );
    expect(badVersion.ok).toBe(false);
    if (!badVersion.ok) expect(badVersion.error).toMatch(/version/i);

    const badNode = parseSaveFile(
      JSON.stringify({
        format: "backtrace-investigation",
        formatVersion: 1,
        incident: { id: "x", name: "n", anchorLat: null, anchorLon: null },
        nodes: [{ id: "a", lat: 1, lon: 2, indicatorCode: "NOPE", spreadType: "ADVANCING" }],
      }),
    );
    expect(badNode.ok).toBe(false);
    if (!badNode.ok) expect(badNode.error).toMatch(/unknown indicator/i);
  });
});

describe("integrity", () => {
  it("an app-sealed file verifies clean", async () => {
    const src = seed();
    const sealed = await sealSaveFile(buildSaveFile(src.getState()));
    const parsed = parseSaveFile(saveFileToJson(sealed));
    if (!parsed.ok) throw new Error(parsed.error);
    const res = await verifyIntegrity(parsed.data);
    expect(res.status).toBe("verified");
  });

  it("a hand-tampered field fails integrity and names the node", async () => {
    const src = seed();
    const sealed = await sealSaveFile(buildSaveFile(src.getState()));
    // Alter a bearing WITHOUT re-sealing — the stored hash no longer matches.
    const tampered = {
      ...sealed,
      nodes: sealed.nodes.map((n, i) => (i === 0 ? { ...n, azimuthTrueDeg: 1 } : n)),
    };
    const parsed = parseSaveFile(saveFileToJson(tampered));
    if (!parsed.ok) throw new Error(parsed.error);
    const res = await verifyIntegrity(parsed.data);
    expect(res.status).toBe("failed");
    expect(res.failedNodeIds).toContain(sealed.nodes[0].id);
    expect(res.message).toMatch(/FAILED/);
  });

  it("a legacy (unsealed) file is unverified, not failed", async () => {
    const src = seed();
    const parsed = parseSaveFile(saveFileToJson(buildSaveFile(src.getState())));
    if (!parsed.ok) throw new Error(parsed.error);
    const res = await verifyIntegrity(parsed.data);
    expect(res.status).toBe("unverified");
  });
});

function seedHistory() {
  const store = createStore();
  store.setIncidentName("Marshall — with history");
  const a = store.add({ lat: 39.95, lon: -105.28, indicatorCode: "ANGLE_OF_CHAR", azimuthTrueDeg: 100, sigmaDeg: 98 });
  store.setAnchor(a.lat, a.lon);
  const b = store.add({ lat: 39.96, lon: -105.27, indicatorCode: "STAINING", azimuthTrueDeg: 12, sigmaDeg: 106 });
  store.supersede(a.id, { azimuthTrueDeg: 150 }); // a correction
  store.void(b.id, "duplicate reading"); // a void
  return store;
}

describe("v2 format + migration", () => {
  it("v2 round-trips full history + audit + hashes (deep-equal) and verifies clean", async () => {
    const store = seedHistory();
    const sealed = await sealSaveFile(buildSaveFile(store.getState()));
    const parsed = parseSaveFile(saveFileToJson(sealed));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.migrated).toBe(false);
    expect(parsed.data.formatVersion).toBe(2);
    expect(parsed.data.nodes).toEqual(sealed.nodes); // full history incl superseded + voided
    expect(parsed.data.auditLog).toEqual(sealed.auditLog);
    expect(parsed.data.manifestHash).toBe(sealed.manifestHash);
    expect((await verifyIntegrity(parsed.data)).status).toBe("verified");

    // history is genuinely fuller than the active set (a, b, a', b-void = 4 rows > 1 active)
    expect(sealed.nodes.length).toBe(store.getState().nodes.length);
    expect(sealed.nodes.length).toBeGreaterThan(store.activeNodes().length);
  });

  it("rejects a v2 file whose correction references a missing node", () => {
    const store = seedHistory();
    const sf = buildSaveFile(store.getState());
    // find a superseding row and drop the exact row it points at → dangling chain
    const child = sf.nodes.find((n) => n.supersedesNodeId != null)!;
    const dangling = { ...sf, nodes: sf.nodes.filter((n) => n.id !== child.supersedesNodeId) };
    const parsed = parseSaveFile(saveFileToJson(dangling));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error).toMatch(/missing node/i);
  });

  it("migrates a v1 fixture to a valid, verifiable v2 record", async () => {
    const v1 = {
      format: "backtrace-investigation",
      formatVersion: 1,
      appVersion: "0.0.9",
      incident: { id: "inc1", name: "Old case", createdAtUtc: "2024-01-01T00:00:00.000Z", anchorLat: 39.95, anchorLon: -105.28 },
      nodes: [
        { id: "n1", lat: 39.95, lon: -105.28, indicatorCode: "ANGLE_OF_CHAR", spreadType: "ADVANCING", azimuthTrueDeg: 284, sigmaDeg: 98, notes: "" },
        { id: "n2", lat: 39.96, lon: -105.27, indicatorCode: "STAINING", spreadType: "LATERAL", azimuthTrueDeg: 12, sigmaDeg: 106, notes: "" },
      ],
    };
    const parsed = parseSaveFile(JSON.stringify(v1));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.migrated).toBe(true);
    expect(parsed.data.formatVersion).toBe(2);
    expect(parsed.data.nodes).toHaveLength(2);
    const n0 = parsed.data.nodes[0];
    expect(n0.positionSource).toBe("MAP_PIN");
    expect(n0.fixType).toBe("MANUAL");
    expect(n0.azimuthMethod).toBe("MANUAL");
    expect(n0.chainId).toBe("n1");
    expect(n0.azimuthTrueDeg).toBe(284); // original bearing preserved

    // one synthesized CREATE_NODE per node, marked "migrated from v1"
    expect(parsed.data.auditLog).toHaveLength(2);
    expect(parsed.data.auditLog!.every((e) => e.action === "CREATE_NODE" && e.note === "migrated from v1")).toBe(true);

    // sealing the upgraded record yields a verified manifest
    const sealed = await sealSaveFile(parsed.data);
    expect((await verifyIntegrity(sealed)).status).toBe("verified");
  });

  it("migrating end-to-end through the store keeps the region computable", async () => {
    const v1 = {
      format: "backtrace-investigation",
      formatVersion: 1,
      incident: { id: "inc2", name: "Old", createdAtUtc: "2024-01-01T00:00:00.000Z", anchorLat: 39.95, anchorLon: -105.28 },
      nodes: [
        { id: "n1", lat: 39.95, lon: -105.3, indicatorCode: "ANGLE_OF_CHAR", spreadType: "ADVANCING", azimuthTrueDeg: 90, sigmaDeg: 40, notes: "" },
        { id: "n2", lat: 39.95, lon: -105.2, indicatorCode: "STAINING", spreadType: "LATERAL", azimuthTrueDeg: 270, sigmaDeg: 40, notes: "" },
      ],
    };
    const parsed = parseSaveFile(JSON.stringify(v1));
    if (!parsed.ok) throw new Error(parsed.error);
    const data = parsed.migrated ? await sealSaveFile(parsed.data) : parsed.data;
    const store = createStore();
    applySaveFile(store, data, "replace");
    // two crossing bearings still produce a posterior after migration
    const g = computePosterior(store.activeNodes(), { anchor: { lat: 39.95, lon: -105.28 } });
    expect(g).not.toBeNull();
    // and the import itself was audited (migration CREATEs + an IMPORT marker)
    expect(store.getAuditLog().some((e) => e.action === "IMPORT")).toBe(true);
  });
});
