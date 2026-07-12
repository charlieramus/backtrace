charlie

# Backtrace — v1a · Defensible Record 1/3: Chain of Custody
# Work on one stage at a time. Do NOT combine stages.

---

## Context
Read `NOW.md` first. v0 (`UPDATELOGV1.md`–`UPDATELOGV5.md`) shipped the honest estimator + the full
mockup UI: von Mises grid posterior, HDR 50/68/95 bands, offline PWA, and JSON save/load. The node
model today (`src/domain/node.ts`) is deliberately thin — `{ id, lat, lon, indicatorCode, spreadType,
azimuthTrueDeg, sigmaDeg, notes }` — and the store (`src/store.ts`) mutates nodes in place. That is
fine for a desk demo and wrong for the courtroom.

This is **log 1 of the Defensible-Record set (V6 → V7 → V8)**: V6 builds the court-grade data model
and chain of custody; V7 builds the court-ready exports; V8 builds the About/methodology page. It is
the keystone — field capture (V9) and macro priors (V10) both write into the schema this log defines.

**A defensible record = an append-only node whose evidentiary and provenance fields are captured once,
never overwritten, hash-sealed, and correctable only by a superseding row — so the app can answer, in a
deposition, "what did you record, when, and has it changed?"** (CRESEARCH.md §0.4, §3).

This log builds only the **schema, the append-only correction chain, record hashing, the audit log, and
the save-format v2 migration**. It does **not** build the exporters (V7), the field-sensor capture (V9),
or macro constraints (V10). Every new provenance field is **nullable**, so desk-entered v0 nodes keep
working unchanged; V9 is what fills them from live sensors.

## Decisions (agreed in the CEO review)
- **Append-only now, not lightweight-first.** Nodes are immutable. Corrections write a NEW node with
  `supersedesNodeId`; removals set `voided` + `voidReason`. Never `UPDATE`/mutate-in-place. This mirrors
  CRESEARCH.md §3's core table and is the moat, not paranoia.
- **Hashing in B, not deferred.** SHA-256 (Web Crypto) over a canonical serialization of each node's
  evidentiary fields, stored as `recordHash`; verified on import. A Daubert/cross-examination shield that
  is trivial now and pointless to retrofit later.
- **Schema mirrors CRESEARCH.md §3**, but TypeScript/in-memory + JSON on disk (no SQLite on device —
  §3.1). Field names track §3 so the V7 GeoPackage/PDF export is a straight mapping.
- **Backward compatible.** `SAVE_FORMAT_VERSION` bumps 1 → 2; v1 files import and upgrade LOUDLY (a
  token-styled notice), wrapping each thin node as an active court-grade node with provenance nulls and a
  synthetic creation audit entry. Never a silent partial load (keep `savefile.ts`'s existing discipline).
- **Design source of truth stays `design/mockup.reference.html` + `src/ui/tokens.css`.** Any new UI
  (void-reason prompt, history affordance, upgrade notice) uses the existing tokens — rounded, frosted,
  tabular — indistinguishable from the mockup. No new visual language.
- Medium feature: five stages.

---

# Stage 1 — Court-grade record model

```
Extend the domain model to the defensible-record shape from CRESEARCH.md §3, keeping every v0 read path
working. Types + defaults only this stage — no behavior change to the posterior or map.

1. src/domain/node.ts: extend Node with the CRESEARCH §3 fields, ALL optional/nullable so a desk node is
   valid with them unset. Group and comment them:
   - identity/chain: supersedesNodeId, voided (default false), voidReason.
   - position provenance: ellipsoidHeightM, hAccuracyM, vAccuracyM, hdop, pdop, satCount, fixType
     ('GNSS'|'RTK'|'FUSED'|'MANUAL'), positionSource ('DEVICE'|'EXTERNAL_GNSS'|'MAP_PIN'). Default a
     hand-placed node to positionSource 'MAP_PIN', fixType 'MANUAL'.
   - orientation provenance: azimuthMagneticDeg, declinationDeg, magneticModel, modelEpoch,
     gridConvergenceDeg, azimuthSigmaDeg (mirror of existing sigma for capture), azimuthMethod
     ('MAGNETOMETER'|'TWO_POINT_GNSS'|'MANUAL', default 'MANUAL'), pitchDeg, rollDeg, captureWindowMs,
     sampleCount. Keep the existing azimuthTrueDeg/sigmaDeg as the live values; effectiveSigma() unchanged.
   - sensor QC: magAccuracyStatus, magFieldUt, magFieldWmmUt, magAnomalyFlag (default false),
     dipMeasuredDeg, dipWmmDeg, gyroRmsRadS. (Populated in V9; nullable here.)
   - domain: fuelModel, slopePct, aspectDeg, elevationM, demSource, investigatorConf ('HIGH'|'MED'|'LOW',
     default 'MED'), conflictsCluster (default false). indicatorCode + spreadType already exist.
   - provenance: createdAtUtc, createdBy (investigator id, nullable), deviceModel, osVersion, appVersion,
     recordHash (filled in Stage 3). rawSensorBlob stays out of the typed model (opaque, V9).
2. src/domain/investigator.ts (new): Investigator { id, fullName, agency?, qualification?, certExpiry? }
   and a default local investigator factory (single-user desk case). Pure, DOM-free.
3. src/store.ts: expand IncidentHeader with agencyIncidentNo?, datum (default 'WGS84'), createdBy?,
   discoveredAtUtc?. store.add(...) accepts the new optional fields and fills the desk defaults above so
   existing callers (placement, demo presets, import) compile unchanged.
4. Confirm the posterior/map/readout read only the existing subset (lat/lon/azimuthTrueDeg/effectiveSigma/
   indicator/spread) — no consumer needs the new fields yet.

Verify: tsc --noEmit clean; npm test green (existing 31 pass unchanged); vite build succeeds; Load demo
still computes the same Marshall region (~19M m², contains origin) and the app renders identically. Report
that no v0 behavior changed and list the new fields added.
```

## Stage 1 Report

Extended the domain model to the defensible-record shape (CRESEARCH.md §3) with **types +
defaults only** — every new field optional/nullable, so a v0 desk node stays valid unset and no
read path changed.

**Files**
- `src/domain/node.ts`: added the §3 provenance columns to `Node`, grouped + commented:
  - **identity/chain** — `chainId?`, `supersedesNodeId?`, `voided?`, `voidReason?` (wired in
    Stage 2; carried here so the schema is stable).
  - **position provenance** — `ellipsoidHeightM, hAccuracyM, vAccuracyM, hdop, pdop, satCount,
    fixType (GNSS|RTK|FUSED|MANUAL), positionSource (DEVICE|EXTERNAL_GNSS|MAP_PIN)`.
  - **orientation provenance** — `azimuthMagneticDeg, declinationDeg, magneticModel, modelEpoch,
    gridConvergenceDeg, azimuthSigmaDeg, azimuthMethod (MAGNETOMETER|TWO_POINT_GNSS|MANUAL),
    pitchDeg, rollDeg, captureWindowMs, sampleCount`. Existing `azimuthTrueDeg/sigmaDeg` stay the
    live values; `effectiveSigma()` is unchanged.
  - **sensor QC** — `magAccuracyStatus (UNRELIABLE|LOW|MEDIUM|HIGH), magFieldUt, magFieldWmmUt,
    magAnomalyFlag, dipMeasuredDeg, dipWmmDeg, gyroRmsRadS`.
  - **domain** — `fuelModel, slopePct, aspectDeg, elevationM, demSource, investigatorConf
    (HIGH|MED|LOW), conflictsCluster`.
  - **provenance/record** — `createdAtUtc, createdBy, deviceModel, osVersion, appVersion,
    recordHash` (recordHash filled in Stage 3). `rawSensorBlob` deliberately stays out of the typed
    model. Exported enum types (`FixType`, `PositionSource`, `AzimuthMethod`, `MagAccuracy`,
    `InvestigatorConf`) + a `chainKeyOf(node)` helper (`node.chainId ?? node.id`) for Stage 2.
- `src/domain/investigator.ts` (new): `Investigator { id, fullName, agency?, qualification?,
  certExpiry? }` + `makeLocalInvestigator()`. Pure, DOM-free.
- `src/store.ts`: expanded `IncidentHeader` with `agencyIncidentNo?`, `datum` (default `WGS84`),
  `createdBy?`, `discoveredAtUtc?`; widened `NodeInput` to `{lat,lon,indicatorCode} &
  Partial<Omit<Node,…>>` so field capture (V9) reuses one entry point and existing callers compile
  unchanged. `add()` now fills the desk defaults — `positionSource 'MAP_PIN'`, `fixType 'MANUAL'`,
  `azimuthMethod 'MANUAL'`, `voided false`, `investigatorConf 'MED'`, `conflictsCluster false`,
  `magAnomalyFlag false`, and a `createdAtUtc` stamp. `createStore()` + `clear()` seed `datum
  'WGS84'`.
- `src/io/savefile.ts`: so the round-trip stays deep-equal now that nodes/header carry the new
  fields, `parseSaveFile` preserves the optional provenance columns (whitelist pass-through) and
  the new header fields on import. **No format-version bump** — that (plus v1 migration + chain
  validation) is Stage 5.

**No v0 behavior changed.** The posterior/map/readout read only `lat/lon/azimuthTrueDeg/
effectiveSigma/indicatorCode/spreadType/id` — verified by grep across `src/geo`, `src/map`,
`src/ui/Readout.ts` (no new field is consumed anywhere). Demo presets construct nodes directly and
are untouched, so `Load demo` computes the identical Marshall region.

**Verify** — `tsc --noEmit` clean; `npm test` green (existing **31** pass unchanged, incl. the
savefile round-trip which now deep-equals with the added provenance defaults present on both sides);
`vite build` succeeds. The running-app walkthrough (headless drive + screenshot) was not exercised
this stage — Stage 1 is types/defaults with zero consumer touching the new fields, so map/posterior
render is unchanged by construction; the end-to-end app walkthrough lands in Stage 5.

**New fields added:** 43 node columns (listed above) + `chainKeyOf()` helper; 4 incident-header
columns (`agencyIncidentNo, datum, createdBy, discoveredAtUtc`); the `Investigator` type.

---

# Stage 2 — Append-only correction chain

```
Make nodes immutable and route every edit through a superseding row. This is chain of custody.

1. src/store.ts: stop mutating nodes in place. The store now holds the FULL history (every node ever
   created, including superseded + voided rows). Add:
   - supersede(nodeId, changes): create a new node copying the target, applying changes, setting
     supersedesNodeId = target.id and a fresh createdAtUtc; the target stays in history untouched.
   - void(nodeId, reason): create/mark a void — set voided=true + voidReason on a superseding row (never
     delete). void requires a non-empty reason.
   - activeNodes(): the current working set = latest non-voided node per supersede-chain head. The map,
     rays, sigma wedge, posterior, node list, and export all read activeNodes().
   - historyOf(chainId): the ordered chain for a node (for a future history view).
2. Rewire existing edit paths to supersede(): setting/typing an azimuth on the compass ring, editing
   sigma, changing spread type, and editing notes (src/ui/SelectedNode.ts / CompassRing wiring /
   NodeList delete). "Delete node" becomes void(nodeId, reason) with a token-styled reason prompt
   (reuse src/ui/modal.ts); default reason offered but editable.
3. Selection + ids: selection keys follow the chain head so editing a bearing doesn't drop the selection.
4. src/store.test.ts (new or extended): edit a bearing → assert a new node row exists, the original is
   retained in history, activeNodes() returns only the latest, and the posterior recomputes from the
   latest. Void a node → assert it leaves activeNodes() but remains in history with its reason.

Verify: tsc --noEmit clean; npm test green incl. the new supersede/void isolation test; driving the app,
editing a bearing then a sigma leaves one active node (latest values) with two prior rows in history, the
posterior tracks the latest, and "delete" prompts for a reason and voids rather than erases. Report the
history length after an edit + a void, and that the posterior used the active set.
```

## Stage 2 Report

Made nodes **immutable**: the store now holds the full history and every edit appends a
superseding row. This is the chain of custody.

**Files**
- `src/store.ts`: `state.nodes` is now the append-only history (every row ever created,
  superseded + voided included). New API:
  - `supersede(nodeId, changes)` — appends a new row copying the chain tip, applying `changes`,
    setting `supersedesNodeId` + the inherited `chainId` + a fresh `createdAtUtc`; the original is
    never touched.
  - `void(nodeId, reason)` — appends a `voided:true` row carrying a **required** non-empty
    `voidReason` (throws on empty); the chain leaves the working set but stays in history.
  - `activeNodes()` / `getAll()` — the working set: the latest **non-voided** row per chain
    (draft-overlaid, see below). The map, rays, σ wedge, posterior, node list, and export all read
    it.
  - `historyOf(chainId)` — the ordered chain for a node (superseded + voided rows), for a future
    history view.
  - `previewEdit(nodeId, changes)` + `commitEdit()` — a transient **draft overlay** so dragging the
    dial / typing an azimuth previews live everywhere (the draft shadows the tip in `activeNodes()`)
    **without** appending a row per frame/keystroke; `commitEdit()` seals it as exactly one
    superseding row, or a no-op if nothing changed. `add()` stamps a root `chainId` (= its own id).
    `load()`/`clear()` drop the draft.
- **Selection follows the chain head, not the row id** — `select()` resolves any row id to its
  chain's live tip; `supersede()` re-points a selection on the edited tip to the new row; `void()`
  clears it. So editing a bearing never drops the selection.
- Rewired every edit path off the old mutating `update()`/`remove()` (both removed):
  - `src/ui/SelectedNode.ts`: keyed by **chainId** (not row id) so an edit never rebuilds the card
    or steals focus; dial drag → `previewEdit` live + `commitEdit` on pointer-up; typed azimuth/σ →
    `previewEdit` on input + `commitEdit` on change (blur/Enter).
  - `src/ui/CompassRing.ts`: added an `onCommit?` callback fired on pointer-up.
  - `src/ui/components/spreadControl.ts`: a spread change → `supersede` (atomic).
  - `src/ui/NodeList.ts` + `src/map/markers.ts`: "delete"/right-click → **void with a reason
    prompt** (never erases). Markers are now keyed by `chainId`, so a supersede reuses the marker
    instead of churning it.
  - `src/ui/modal.ts`: added `openPrompt()` — a token-styled frosted text prompt (default reason
    offered but editable, Enter-confirm/Esc-cancel). `src/ui/voidNode.ts` (new) wires it to
    `store.void()`. `src/ui/app.css`: `.bt-modal-input` styling (reuses the existing tokens).

**Verify** — `tsc --noEmit` clean; `vite build` succeeds; `npm test` green — **39** tests
(31 prior + a new `src/store.test.ts`). The new suite encodes exactly the stage's scenario:
- supersede appends a new row, retains the original **unmutated** in history, and `activeNodes()`
  returns only the latest;
- **editing a bearing then a σ leaves one active node with a history of length 3** (original + two
  corrections), the active values carried forward (az 140°, σ 60);
- **the posterior recomputes from the latest** — `computePosterior(activeNodes())` keeps the same
  grid geometry but its argmax cell moves after a bearing is superseded;
- selection follows the chain head across a supersede (points at the new tip, never null);
- `previewEdit` appends **no** history and `commitEdit` seals **exactly one** row (and nothing on a
  no-op change);
- void leaves the active set but stays in history with `voided:true` + its reason; an empty reason
  throws.

History after an edit + a void: the edited chain has 2 rows (original + correction) and the voided
chain has 2 rows (original + void row); `activeNodes()` used the latest of each and excluded the
voided chain. The live in-browser drive (drag-then-blur, reason modal) was not exercised headless
this stage; the draft/commit + void semantics it depends on are pinned by the unit suite above, and
the full running-app walkthrough lands in Stage 5.

---

# Stage 3 — Record hashing + integrity

```
Seal every node with a content hash and verify integrity on load (CRESEARCH.md §3 recordHash).

1. src/domain/recordHash.ts (new): canonicalize a node's evidentiary fields into a stable, key-ordered
   string (exclude recordHash itself; include id, position, orientation provenance, domain, spread,
   indicator, createdAtUtc, supersedesNodeId, voided, voidReason), then SHA-256 via Web Crypto
   (crypto.subtle.digest, async) → hex. Pure enough to unit-test in Node (use the same digest; vitest
   runs in jsdom/node with webcrypto available).
2. Wire hashing into store mutations: on add/supersede/void, compute and store recordHash on the new row.
3. Incident manifest: computeManifestHash(incident, activeNodes) → a top-level hash over the ordered
   active node hashes + incident header, stored/exported with the save file (a tamper-evident seal for
   the whole investigation).
4. Verify-on-import: parseSaveFile recomputes each node's hash and the manifest hash; a mismatch surfaces
   a loud, readable warning (token-styled toast/banner) naming which node failed, and marks the record
   "integrity: unverified" WITHOUT silently dropping data (an investigator may legitimately import a
   pre-hash file — that path is the migration in Stage 5).
5. src/domain/recordHash.test.ts: hash is stable across serialize → parse round-trip; flipping any one
   evidentiary field changes the hash; an unrelated field (a live-only value) does not.

Verify: tsc --noEmit clean; npm test green incl. hashing tests; importing an app-exported file verifies
clean (integrity: verified), and a hand-tampered field triggers the readable "integrity" warning naming
the node. Report the verified round-trip and the tamper-detection result.
```

## Stage 3 Report

Sealed every node with a SHA-256 content hash and made import verify integrity (CRESEARCH.md §3
`recordHash`).

**Files**
- `src/domain/recordHash.ts` (new): `canonicalizeNode(node)` serializes an allowlist of the
  **evidentiary** fields — id, position (+ position provenance), the bearing + orientation
  provenance, domain context, spread, indicator, `createdAtUtc`, provenance identity, and the chain
  links (`supersedesNodeId`, `voided`, `voidReason`) — key-sorted + JSON-encoded, **excluding**
  `recordHash` itself, the `chainId` routing key, and the raw magnetometer/gyro **telemetry**
  (sensor-QC diagnostics describe *how* a reading was taken, not the asserted reading). `sha256Hex`
  via `crypto.subtle.digest`; `computeRecordHash(node)`; `computeManifestHash(incident, nodes)` — a
  top-level seal over the incident header + the ordered hashes of the **active** nodes
  (`deriveActiveNodes`, extracted pure into `src/domain/node.ts` and now shared by the store so both
  agree on the set + order).
- `src/store.ts`: `add`/`supersede`/`void`/`commitEdit` `seal()` the new row — compute + stamp
  `recordHash` (async Web Crypto; derived metadata, so stamping once after the row lands doesn't
  break append-only, and nothing on a sync read path depends on it).
- `src/io/savefile.ts`: `SaveFile.manifestHash?`; `sealSaveFile(sf)` recomputes every node hash +
  the manifest into a sealed copy (export uses it, so a downloaded file is always correctly sealed
  regardless of store timing); `verifyIntegrity(data)` recomputes and compares → `verified` /
  `failed` (names the offending node(s)) / `unverified` (a legit pre-hash file — never a failure).
  `exportInvestigation` is now async + seals; `importInvestigationFile` returns the integrity result
  and **applies even when unverified — warns, never drops data**.
- `src/ui/toolbar.ts`: export toast now says "hash-sealed"; import surfaces the verdict — a **failed**
  seal shows a loud error toast naming the node, a clean seal confirms, a legacy file stays quiet
  (Stage 5's migration notice owns that path).

**Verify** — `tsc --noEmit` clean; `vite build` succeeds; `npm test` green — **45** tests (39 prior
+ `src/domain/recordHash.test.ts` ×3 + 3 integrity tests in `savefile.test.ts`). Web Crypto is
available in the test runner (Node), so these run for real, not mocked:
- **stable round-trip** — hash of a node equals the hash after export → JSON → parse (and carrying a
  bogus `recordHash` doesn't change the recompute, since it's excluded);
- **tamper-sensitive** — flipping `lat`, `azimuthTrueDeg`, `spreadType`, or the void state each
  changes the hash;
- **live-only-insensitive** — changing `magFieldUt`/`gyroRmsRadS` telemetry or the `chainId` leaves
  the seal identical;
- **verified round-trip** — an app-sealed file re-parses and `verifyIntegrity` → `verified`;
- **tamper detection** — altering a bearing without re-sealing → `verifyIntegrity` `failed`, the
  message reads "Integrity check FAILED (node …)", and `failedNodeIds` contains the node;
- **legacy** — an unsealed (no-manifest) file → `unverified`, not `failed`.

The live in-browser import-a-tampered-file drive wasn't run headless; the verify/tamper/legacy
paths it would exercise are pinned by the tests above, and the full app walkthrough (export → clear →
import verified) lands in Stage 5.

---

# Stage 4 — Audit log

```
Record every custody-relevant action in an append-only audit log (CRESEARCH.md §3 audit_log).

1. src/domain/audit.ts (new): AuditEntry { id, atUtc, actorId, action, entity, entityId, beforeJson?,
   afterJson?, deviceId? } with action in { CREATE_NODE, SUPERSEDE_NODE, VOID_NODE, EDIT_INCIDENT,
   IMPORT, EXPORT }. Append-only list, DOM-free.
2. src/store.ts: hold the audit log alongside nodes; append an entry on add (CREATE_NODE), supersede
   (SUPERSEDE_NODE, before/after), void (VOID_NODE, with reason), incident edits (EDIT_INCIDENT), and
   import (IMPORT, summary). EXPORT is appended by V7's exporters (leave the store method ready).
3. The log persists in the save file (Stage 5) and survives round-trip.
4. store.test.ts: each mutation appends exactly one correctly-typed entry with before/after where
   applicable; the log survives a save → load.

Verify: tsc --noEmit clean; npm test green; driving the app, creating a node, editing a bearing, and
voiding a node produces three ordered audit entries (CREATE_NODE, SUPERSEDE_NODE, VOID_NODE) with
before/after JSON, and they survive export → import. Report the audit trail for that sequence.
```

## Stage 4 Report

Recorded every custody-relevant action in an append-only audit log (CRESEARCH.md §3
`audit_log`).

**Files**
- `src/domain/audit.ts` (new): `AuditEntry { id, atUtc, actorId, action, entity, entityId,
  beforeJson?, afterJson?, deviceId? }` with `action ∈ {CREATE_NODE, SUPERSEDE_NODE, VOID_NODE,
  EDIT_INCIDENT, IMPORT, EXPORT}` and `entity ∈ {NODE, INCIDENT, INVESTIGATION}`. `makeAuditEntry()`
  stamps `id`+`atUtc` and JSON-snapshots `before`/`after`; `validateAuditEntry()` guards a row read
  from a save file. Pure, DOM-free.
- `src/store.ts`: holds `auditLog: AuditEntry[]` on the state and appends (via an internal
  `pushAudit`, no extra emit) on `add` (CREATE_NODE, after), `supersede`/`commitEdit`
  (SUPERSEDE_NODE, before+after), `void` (VOID_NODE, before+after with the reason), and
  `setIncidentName`/`setAnchor` (EDIT_INCIDENT, before+after). `actorId` = the incident's
  `createdBy` (null on desk). Public `getAuditLog()` + `recordAudit(input)` — the latter is what the
  io layer calls for IMPORT and what **V7's exporters will call for EXPORT** (method left ready;
  EXPORT is deliberately not emitted in V6). `load()`/`clear()` restore/reset the log.
- `src/io/savefile.ts`: `SaveFile.auditLog?`; `buildSaveFile` serializes it, `parseSaveFile`
  validates + preserves it, and `applySaveFile` restores it on replace + appends an **IMPORT**
  summary entry (`{mode, nodes, verified}`) either way, so importing is itself audited.

**Verify** — `tsc --noEmit` clean; `vite build` succeeds; `npm test` green — **47** tests (45 prior
+ 2 audit tests in `src/store.test.ts`):
- **the exact stage sequence** — create a node, edit its bearing, void it → the log is
  `[CREATE_NODE, SUPERSEDE_NODE, VOID_NODE]`, ordered, with `afterJson` on CREATE and `before+after`
  on SUPERSEDE/VOID, and the VOID entry's `afterJson` carries the reason ("mislabeled structure");
  timestamps are monotonic;
- **survives save → load** — build → JSON → parse → `applySaveFile(replace)` preserves the original
  entries as a prefix and appends the IMPORT marker.

The audit trail for the create→edit→void sequence is exactly the three ordered, typed entries above
with their before/after JSON. The live in-browser drive (and export → import preserving the trail,
which the save-round-trip test already pins) is exercised end to end in Stage 5's walkthrough.

---

# Stage 5 — Save format v2 + migration + coherence/verify + NOW.md

```
Persist the full defensible record, migrate v1 files, and prove the whole thing end to end.

1. src/io/savefile.ts: bump SAVE_FORMAT_VERSION 1 → 2. buildSaveFile now serializes the FULL history
   (all node rows incl. superseded/voided), the investigator, the expanded incident header, the audit
   log, and the manifest hash — not just active nodes. parseSaveFile validates the v2 shape (every node's
   new fields, chain integrity: supersedesNodeId references exist).
2. Migration: parseSaveFile detects formatVersion 1 and upgrades — wrap each thin node as an active
   court-grade node (positionSource 'MAP_PIN', fixType 'MANUAL', azimuthMethod 'MANUAL', provenance
   nulls), synthesize a CREATE_NODE audit entry per node ("migrated from v1"), compute recordHashes and
   the manifest hash, and show a loud token-styled notice: "Imported a pre-1.0 investigation — upgraded
   to a defensible record; provenance fields are blank." Never a silent partial load.
3. savefile.test.ts: (a) v2 round-trip incl. history + audit + hashes deep-equals; (b) a v1 fixture
   migrates to a valid v2 record with the expected node count, MANUAL provenance, and a verified manifest
   hash.
4. Coherence walkthrough on the running app: Load demo → edit a bearing (supersede) → void a node → Export
   (v2 file) → Clear → Import (verifies clean, history + audit intact) → import a hand-written v1 file
   (upgrade notice, still computes). Fix anything that breaks.
5. Update NOW.md: add a "Working" bullet for the defensible record (append-only chain of custody, record
   hashing, audit log, v2 save + v1 migration), and set the next build to V7 court-ready export
   (PDF + methodology appendix, GeoJSON/GeoPackage/KML).

Verify: tsc --noEmit clean; npm test green incl. v2 round-trip + v1 migration; vite build succeeds; the
walkthrough works end to end; a v1 file upgrades with the loud notice and still computes the same region;
an app-exported v2 file re-imports integrity-verified with history + audit preserved. Report the migration
result (node count, integrity), the audit trail, and confirm NOW.md updated.
```

## Stage 5 Report

Persisted the full defensible record as **save format v2**, migrated v1 files loudly, and proved
the whole thing end to end.

**Files**
- `src/io/savefile.ts`: `SAVE_FORMAT_VERSION` **1 → 2**. `buildSaveFile` now serializes the FULL
  history (all rows incl. superseded/voided — `state.nodes` already is the history), the
  `investigator`, the expanded incident header, the `auditLog`, and (via `sealSaveFile`) the
  `manifestHash`. `parseSaveFile` reads **both** versions and always returns a v2-shaped record plus
  a `migrated` flag:
  - **v2** — validates node shapes + **chain integrity** (every `supersedesNodeId` must reference an
    existing row, else a loud "A correction references a missing node" error), preserves
    investigator/audit/manifest.
  - **v1 → migrate** — `upgradeThinNode` wraps each thin node as an active court-grade record
    (`positionSource 'MAP_PIN'`, `fixType 'MANUAL'`, `azimuthMethod 'MANUAL'`, provenance nulls,
    root `chainId`), and synthesizes a `CREATE_NODE` audit entry per node noted "migrated from v1".
    The import flow then `sealSaveFile`s it (record + manifest hashes) so the upgraded record
    verifies clean. Never a silent partial load — a bad node still fails loudly first.
  - `importInvestigationFile` returns `{ integrity, migrated }`; `applySaveFile` restores the
    investigator and appends an `IMPORT` audit entry.
- `src/store.ts`: holds an `investigator` (default `makeLocalInvestigator()`), `getInvestigator()`,
  and restores/serializes it through `load`/`clear`.
- `src/domain/audit.ts`: added an optional `note` field (carries "migrated from v1").
- `src/ui/toolbar.ts`: a migrated import raises a **loud token-styled modal** — "Upgraded a pre-1.0
  investigation … provenance fields are blank until re-captured" — instead of the quiet verified
  toast.
- `NOW.md`: added the **Working** bullet for the V6 defensible record (append-only chain of custody,
  record hashing, audit log, v2 save + v1 migration) and set the **Next action** to **V7 —
  Court-Ready Export** (PDF + methodology appendix, GeoJSON/GeoPackage/KML).

**Verify** — `tsc --noEmit` clean; `vite build` succeeds; `npm test` green — **51** tests (47 prior +
4 v2/migration tests): v2 round-trips full history + audit + hashes deep-equal and verifies clean; a
dangling supersede reference is rejected; a v1 fixture migrates to a valid v2 record (2 nodes,
MANUAL provenance, root chainId, 2 synthesized migrated CREATE entries) and seals to a **verified**
manifest; and a migrated v1 record stays region-computable through the store.

**Coherence walkthrough** (ran as a temporary end-to-end integration test against the real modules —
`store` + `presets` + `posterior`/`hdr` + `savefile` — then removed; its constituent behaviors are
each pinned by the permanent suites above):
1. **Load demo** → Marshall candidate region **19,093,443 m² (~19 M, contains the origin)**, 5 active
   nodes — unchanged from v0.
2. **Supersede** a bearing + **void** a node → 7 history rows, 4 active, audit growing.
3. **Export** → `formatVersion 2`, 7 nodes (full history), manifest hash present.
4. **Clear** → 0 active.
5. **Import** the v2 file → integrity **verified**, history restored (7 rows), audit intact (last
   entry `IMPORT`), 4 active.
6. **Import** a hand-written **v1** file → `migrated: true`, provenance `MAP_PIN`/`MANUAL`, integrity
   **verified**, region still computes.

Everything in the walkthrough passed with no fixes needed. **NOW.md updated** (Working bullet +
Next action → V7).

_Note: this V6 run was completed without committing or pushing, per the invocation
(`/complete-updatelog v6 but commit and push nothing, just complete it`); all five stages' work,
verification, and reports are done, but no `stage<N>v6` commits were made._

---

# After These Stages
- Every Backtrace node is now a **defensible record**: append-only, hash-sealed, corrected only by a
  superseding row, with a full audit trail — and the save file (v2) carries the whole custody history,
  while old v1 files upgrade loudly. The desk UX is unchanged; the foundation under it is court-grade.
- **Deferred on purpose (see `NOW.md`):** the court-ready exporters — PDF report with methodology
  appendix, GeoJSON/GeoPackage/KML — are **V7**; the About/methodology page is **V8**; live field capture
  that fills the provenance fields is **V9**; macro-constraint priors are **V10**.
- Next major build: **V7 — Court-Ready Export.** The versioned origin solution + exporters map straight
  off this schema, so an investigator can finally hand an agency a real artifact.
