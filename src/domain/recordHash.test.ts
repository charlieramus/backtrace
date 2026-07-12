import { describe, it, expect } from "vitest";
import { computeRecordHash } from "./recordHash";
import { createStore } from "../store";
import { buildSaveFile, saveFileToJson, parseSaveFile } from "../io/savefile";

function seedOne() {
  const store = createStore();
  const a = store.add({
    lat: 39.953,
    lon: -105.273,
    indicatorCode: "ANGLE_OF_CHAR",
    spreadType: "ADVANCING",
    azimuthTrueDeg: 284,
    sigmaDeg: 98,
    notes: "char on the fence line",
  });
  return { store, a };
}

describe("record hashing", () => {
  it("is stable across a serialize → parse round-trip", async () => {
    const { store, a } = seedOne();
    const h1 = await computeRecordHash(a);

    const json = saveFileToJson(buildSaveFile(store.getState()));
    const parsed = parseSaveFile(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const a2 = parsed.data.nodes[0];
    const h2 = await computeRecordHash(a2);

    expect(h2).toBe(h1);
    // recordHash is excluded from its own canonicalization, so carrying it doesn't
    // change the recompute either.
    const h3 = await computeRecordHash({ ...a2, recordHash: "deadbeef" });
    expect(h3).toBe(h1);
  });

  it("changes when any evidentiary field flips", async () => {
    const { a } = seedOne();
    const h1 = await computeRecordHash(a);
    expect(await computeRecordHash({ ...a, lat: a.lat + 0.001 })).not.toBe(h1);
    expect(await computeRecordHash({ ...a, azimuthTrueDeg: 123 })).not.toBe(h1);
    expect(await computeRecordHash({ ...a, spreadType: "BACKING" })).not.toBe(h1);
    expect(await computeRecordHash({ ...a, voided: true, voidReason: "x" })).not.toBe(h1);
  });

  it("ignores a non-evidentiary telemetry / live-only value", async () => {
    const { a } = seedOne();
    const h1 = await computeRecordHash(a);
    // raw magnetometer/gyro telemetry + the chain routing key aren't part of the
    // asserted record, so changing them leaves the seal identical.
    expect(await computeRecordHash({ ...a, magFieldUt: 48.2, gyroRmsRadS: 0.01 })).toBe(h1);
    expect(await computeRecordHash({ ...a, chainId: "some-other-key" })).toBe(h1);
  });
});
