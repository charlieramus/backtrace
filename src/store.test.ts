import { describe, it, expect } from "vitest";
import { createStore } from "./store";
import { chainKeyOf } from "./domain/node";
import { computePosterior, type PosteriorGrid } from "./geo/posterior";
import { buildSaveFile, saveFileToJson, parseSaveFile, applySaveFile } from "./io/savefile";

function argmax(g: PosteriorGrid): number {
  let mi = 0;
  for (let i = 1; i < g.values.length; i++) if (g.values[i] > g.values[mi]) mi = i;
  return mi;
}

describe("append-only correction chain", () => {
  it("supersede appends a new row, retains the original untouched, and activeNodes returns only the latest", () => {
    const store = createStore();
    const a = store.add({
      lat: 39.95,
      lon: -105.28,
      indicatorCode: "ANGLE_OF_CHAR",
      azimuthTrueDeg: 100,
      sigmaDeg: 90,
    });
    const chain = chainKeyOf(a);

    const b = store.supersede(a.id, { azimuthTrueDeg: 200 });
    expect(b.id).not.toBe(a.id);
    expect(b.supersedesNodeId).toBe(a.id);
    expect(chainKeyOf(b)).toBe(chain);

    // The original row is retained in history and never mutated.
    const hist = store.historyOf(chain);
    expect(hist.map((n) => n.id)).toEqual([a.id, b.id]);
    expect(hist[0].azimuthTrueDeg).toBe(100);

    // The working set is just the latest.
    const active = store.activeNodes();
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(b.id);
    expect(active[0].azimuthTrueDeg).toBe(200);
  });

  it("editing a bearing then a σ leaves one active node with two prior rows in history", () => {
    const store = createStore();
    const a = store.add({
      lat: 39.95,
      lon: -105.28,
      indicatorCode: "ANGLE_OF_CHAR",
      azimuthTrueDeg: 100,
      sigmaDeg: 90,
    });
    const chain = chainKeyOf(a);
    store.supersede(a.id, { azimuthTrueDeg: 140 }); // edit the bearing
    const c = store.supersede(a.id, { sigmaDeg: 60 }); // edit σ

    expect(store.activeNodes()).toHaveLength(1);
    expect(store.historyOf(chain)).toHaveLength(3); // original + two corrections
    expect(store.activeNodes()[0].id).toBe(c.id);
    expect(store.activeNodes()[0].azimuthTrueDeg).toBe(140); // carried forward
    expect(store.activeNodes()[0].sigmaDeg).toBe(60);
  });

  it("the posterior recomputes from the latest superseding row", () => {
    const store = createStore();
    const a = store.add({ lat: 39.95, lon: -105.3, indicatorCode: "ANGLE_OF_CHAR", azimuthTrueDeg: 90, sigmaDeg: 25 });
    store.add({ lat: 39.95, lon: -105.2, indicatorCode: "STAINING", azimuthTrueDeg: 270, sigmaDeg: 25 });
    store.setAnchor(a.lat, a.lon);
    const anchor = { lat: a.lat, lon: a.lon };

    const before = computePosterior(store.activeNodes(), { anchor })!;
    store.supersede(a.id, { azimuthTrueDeg: 150 }); // swing the first bearing
    const after = computePosterior(store.activeNodes(), { anchor })!;

    // Same node positions → identical grid geometry; only the mode moves.
    expect(after.nx).toBe(before.nx);
    expect(argmax(after)).not.toBe(argmax(before));
  });

  it("selection follows the chain head across a supersede (never drops)", () => {
    const store = createStore();
    const a = store.add({ lat: 1, lon: 2, indicatorCode: "SOOTING", azimuthTrueDeg: 10, sigmaDeg: 90 });
    store.select(a.id);
    const b = store.supersede(a.id, { azimuthTrueDeg: 42 });
    const sel = store.getSelected();
    expect(sel).not.toBeNull();
    expect(sel!.id).toBe(b.id); // now points at the new tip
    expect(sel!.azimuthTrueDeg).toBe(42);
  });

  it("previewEdit does not append history; commitEdit seals exactly one row", () => {
    const store = createStore();
    const a = store.add({ lat: 1, lon: 2, indicatorCode: "SOOTING", azimuthTrueDeg: 10, sigmaDeg: 90 });
    const chain = chainKeyOf(a);
    store.previewEdit(a.id, { azimuthTrueDeg: 20 });
    store.previewEdit(a.id, { azimuthTrueDeg: 33 }); // typing more digits
    // still only the original sealed row; the draft shows live
    expect(store.historyOf(chain)).toHaveLength(1);
    expect(store.activeNodes()[0].azimuthTrueDeg).toBe(33);
    store.commitEdit();
    expect(store.historyOf(chain)).toHaveLength(2); // one sealed correction
    expect(store.activeNodes()[0].azimuthTrueDeg).toBe(33);
    // committing again with no draft is a no-op
    expect(store.commitEdit()).toBeNull();
    expect(store.historyOf(chain)).toHaveLength(2);
  });

  it("commitEdit with no real change appends nothing", () => {
    const store = createStore();
    const a = store.add({ lat: 1, lon: 2, indicatorCode: "SOOTING", azimuthTrueDeg: 10, sigmaDeg: 90 });
    const chain = chainKeyOf(a);
    store.previewEdit(a.id, { azimuthTrueDeg: 10 }); // same value
    expect(store.commitEdit()).toBeNull();
    expect(store.historyOf(chain)).toHaveLength(1);
  });

  it("void leaves the active set but stays in history with its reason", () => {
    const store = createStore();
    const a = store.add({ lat: 1, lon: 2, indicatorCode: "SOOTING" });
    const chain = chainKeyOf(a);
    const v = store.void(a.id, "mis-attributed to the wrong structure");

    expect(store.activeNodes()).toHaveLength(0);
    const hist = store.historyOf(chain);
    expect(hist).toHaveLength(2);
    expect(hist[1].id).toBe(v.id);
    expect(hist[1].voided).toBe(true);
    expect(hist[1].voidReason).toBe("mis-attributed to the wrong structure");
  });

  it("void requires a non-empty reason", () => {
    const store = createStore();
    const a = store.add({ lat: 1, lon: 2, indicatorCode: "SOOTING" });
    expect(() => store.void(a.id, "   ")).toThrow();
  });
});

describe("audit log", () => {
  it("create → edit → void appends three ordered, typed entries with before/after", () => {
    const store = createStore();
    const a = store.add({
      lat: 39.95,
      lon: -105.28,
      indicatorCode: "ANGLE_OF_CHAR",
      azimuthTrueDeg: 100,
      sigmaDeg: 90,
    });
    store.supersede(a.id, { azimuthTrueDeg: 140 });
    store.void(a.id, "mislabeled structure");

    const log = store.getAuditLog();
    expect(log.map((e) => e.action)).toEqual(["CREATE_NODE", "SUPERSEDE_NODE", "VOID_NODE"]);
    // CREATE has an after only; SUPERSEDE + VOID carry before + after
    expect(log[0].beforeJson).toBeUndefined();
    expect(log[0].afterJson).toBeTruthy();
    expect(log[1].beforeJson).toBeTruthy();
    expect(log[1].afterJson).toBeTruthy();
    expect(log[2].beforeJson).toBeTruthy();
    expect(log[2].afterJson).toContain("mislabeled structure");
    // monotonic, well-formed timestamps
    expect(new Date(log[0].atUtc).getTime()).toBeLessThanOrEqual(new Date(log[2].atUtc).getTime());
  });

  it("the audit trail survives a save → load round-trip", () => {
    const store = createStore();
    const a = store.add({ lat: 1, lon: 2, indicatorCode: "SOOTING", azimuthTrueDeg: 10, sigmaDeg: 90 });
    store.supersede(a.id, { azimuthTrueDeg: 20 });
    const orig = store.getAuditLog().map((e) => ({ ...e }));

    const parsed = parseSaveFile(saveFileToJson(buildSaveFile(store.getState())));
    if (!parsed.ok) throw new Error(parsed.error);
    const fresh = createStore();
    applySaveFile(fresh, parsed.data, "replace");

    const after = fresh.getAuditLog();
    expect(after.slice(0, orig.length)).toEqual(orig); // preserved as a prefix
    expect(after[after.length - 1].action).toBe("IMPORT"); // + an import marker
  });
});
