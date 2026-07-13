charlie

# Backtrace — v1b · Field Mode
# Work on one stage at a time. Do NOT combine stages.

---

## Context
Read `NOW.md` first. Assumes **V6–V8 shipped**: the defensible record (append-only, hashed, audited),
court-ready export, and the About page. The provenance fields on the node model (`src/domain/node.ts`) —
position accuracy, orientation method, declination, sensor QC — exist but are null, because every node so
far is placed by hand at a desk. The README calls Backtrace a field instrument; this log is what makes
that literally true.

**Field mode = capturing a node from where you stand in the burn — a real GPS fix and a real bearing,
with its uncertainty measured not guessed, written into the court-grade record.** It wires the existing
store, ENU core, and posterior to live phone sensors.

This log builds only **field capture: live geolocation, offline WMM2025 declination, the two-point GNSS
bearing mode, a best-effort device-orientation compass, and the capture flow that writes provenance into
the append-only record**. It does **not** build the full native magnetic-QC suite. **Honesty boundary
(the reason this is web-adapted, not the CRESEARCH.md §5 native plan):** a PWA cannot reliably read
magnetometer accuracy status, uncalibrated hard-iron bias, or raw field magnitude, so the anomaly detector
and accuracy-gated capture are **out of scope and disclosed in the UI**, and the **two-point GNSS bearing
is the primary, high-confidence path** (it is magnetometer-free and immune to every failure mode in
CRESEARCH.md §2.2). The device compass is offered as a clearly-caveated secondary. A future native shell
is where the full magnetic QC lives.

## Decisions (agreed in the CEO review)
- **Two-point GNSS bearing is the primary path.** Stand at the indicator → fix A → walk 15–30 m in the
  indicated direction → fix B → geodesic azimuth A→B, with sigma propagated from fix accuracy + baseline
  (CRESEARCH.md §2.3b). Web-native, magnetometer-free, defensible.
- **Device compass is secondary and honestly caveated.** iOS `webkitCompassHeading` is true-north (needs a
  permission gesture); other platforms' `deviceorientationabsolute` is unreliable. A loud banner: the web
  compass has no accuracy status and no anomaly detection — prefer two-point GNSS; a native app is required
  for full magnetic QC. If both a compass and a two-point bearing exist for a node, flag a >15° delta.
- **Store raw + true separately.** Persist azimuthMagneticDeg, declinationDeg, magneticModel, modelEpoch,
  and azimuthTrueDeg (derived) separately per node, plus azimuthMethod + azimuthSigmaDeg — never collapse
  to one number (CRESEARCH.md §2.4, §3). Field captures create nodes via V6's append-only add/supersede.
- **WMM2025 bundled offline.** Declination/inclination/total-field computed on-device from bundled
  coefficients — no runtime network (CRESEARCH.md §2.4). Used to convert magnetic→true and to display
  declination for defensibility; used later for the (native) anomaly detector.
- **Offline + durable.** Every field capture writes to the store immediately (save on every change, not a
  Done button — CRESEARCH.md §4.5); nothing blocks on the network; big tap targets.
- **Design source of truth stays `design/mockup.reference.html` + `src/ui/tokens.css`.** Capture controls
  reuse the tokens; the honesty banner is a token-styled, non-dismissable-until-read notice, not a nag.
- **No walk-here navigation.** Per CRESEARCH.md §4.5 safety: the tool is used standing still; no turn-by-
  turn, no "walk to next node" arrow that pulls eyes down in a hazardous burn.
- Medium feature: five stages.

---

# Stage 1 — Live geolocation capture

```
Capture a node's position from the live GPS fix, with honest accuracy, into the court-grade record.

1. src/sensors/geo.ts (new): a thin wrapper over navigator.geolocation (getCurrentPosition +
   watchPosition) with a permission flow, an averaging option (several stationary fixes → a tighter
   position, CRESEARCH.md §2.3b), and a typed reading { lat, lon, altitude?, hAccuracyM, vAccuracyM?,
   timestampUtc }. DOP/satCount aren't exposed by the web API — leave those fields null (do not fake them).
2. src/ui/capture/ (new): a "Capture node here" control that takes a live fix, shows the accuracy honestly
   (e.g. "±6 m"), and creates a node via store.add(...) with positionSource 'DEVICE', fixType 'GNSS',
   hAccuracyM, deviceTimeUtc, and the device/os/app provenance (navigator.userAgent parsed minimally).
   Bearing is unset at this point (a later stage sets it). Big tap targets; works offline.
3. A live-position indicator on the map (current fix + accuracy circle) that never blocks on the network
   and reflects real permission/availability state (denied/unavailable shown honestly, not spun forever).
4. src/sensors/geo.test.ts: the wrapper maps a mocked GeolocationPosition to the typed reading incl.
   accuracy, and the averaging reduces spread for jittered mock fixes.

Verify: tsc --noEmit clean; npm test green; on a device/emulated geolocation, "Capture node here" creates
a node at the live fix with a real accuracy value and DEVICE/GNSS provenance, offline; denied permission
shows an honest state. Report the captured provenance fields + the offline/permission behavior.
```

## Stage 1 Report

Live GPS position now writes straight into the court-grade record.

- **`src/sensors/geo.ts` (new)** — a thin, injectable wrapper over `navigator.geolocation`. A
  pure `readingFromPosition()` maps a `GeolocationPosition` to a typed `GeoReading`
  `{ lat, lon, altitude, hAccuracyM, vAccuracyM, timestampUtc, sampleCount }`; DOP/satCount are
  **not** exposed by the web API so they're never populated here (left null downstream, not
  faked). `averageReadings()` folds several stationary fixes into one inverse-variance-weighted
  position with the reported accuracy tightened by √N (CRESEARCH.md §2.3b), and returns a single
  fix unchanged (invents no precision). `getCurrentReading()` / `watchReadings()` /
  `averageCurrentReading()` wrap the one-shot + watch APIs with an honest permission/availability
  error (denied / unavailable / timeout), each accepting an injected `GeolocationLike` so the
  logic is testable with no browser.
- **`src/map/livePosition.ts` (new)** — a "you are here" `CircleMarker` + a metric accuracy
  `Circle` in a dedicated pane (z 440, beneath markers), fed by `watchReadings`. On denial/
  unavailability it stops rather than spinning; it never blocks on the network.
- **`src/ui/capture/index.ts` + `deviceInfo.ts` (new)** — a frosted, big-tap-target capture
  panel toggled by an injected "Field" toolbar button. It shows the live fix accuracy honestly
  ("±6 m", or the permission/availability error) and "Capture node here" averages a 5-fix burst
  then `store.add(...)`s a node with `positionSource 'DEVICE'`, `fixType 'GNSS'`, `hAccuracyM`,
  `vAccuracyM`, `ellipsoidHeightM`, `sampleCount`, `createdAtUtc` = the fix time, and minimally-
  parsed `deviceModel`/`osVersion`/`appVersion` from the user-agent; `hdop`/`pdop`/`satCount`
  are explicitly null. Bearing is left unset (a later stage sets it). Wired in `main.ts`; CSS in
  `app.css`.
- **`src/sensors/geo.test.ts` (new)** — 8 tests: the position→reading mapping incl. accuracy and
  the null altitude/vAccuracy case; averaging reduces reported accuracy to ≈ mean/√5 for jittered
  fixes and keeps the averaged point inside their spread; a single fix passes through unchanged;
  and `getCurrentReading` resolves from an injected provider, rejects with "permission denied" on
  code 1, and rejects "isn't available" when unsupported (never spins).

**Verify:** `tsc --noEmit` clean; `npm test` green (the 8 new geo tests + the existing 72 = 80).
The device-side behavior in the Verify line (a real/emulated fix creating a DEVICE/GNSS node,
denied permission showing an honest state) can't be exercised in this headless `node` test
environment — the sensor cores that make it work are unit-covered, and the permission/availability
paths are honest (surfaced once, no infinite spinner), but the on-device screenshot is not
something I can produce here. Offline: the wrapper and layer make no network calls.

---

# Stage 2 — WMM2025 declination (offline)

```
Compute magnetic declination on-device from bundled WMM2025 — the magnetic→true converter (CRESEARCH §2.4).

1. Bundle WMM2025 coefficients (the WMM.COF values, epoch 2025.0) as a static asset + a small JS evaluator
   (a vetted WMM/GeographicLib port, or a compact from-scratch degree-12 spherical-harmonic evaluator per
   CRESEARCH.md §2.4 steps 1–6). No runtime network; must build + run offline. src/geo/wmm.ts (new):
   declination(lat, lon, altM, date) → { declinationDeg, inclinationDeg, totalFieldUt, horizontalUt }.
2. Use the OBSERVATION date, not Date.now(), when a node carries one (CRESEARCH.md §2.4). On any node with
   a magnetic azimuth, store declinationDeg + magneticModel 'WMM2025' + modelEpoch 2025.0 separately, and
   derive azimuthTrue = wrap360(azimuthMagnetic + declination).
3. Surface declination in the capture UI for the current location/date (defensibility: the investigator
   sees the applied correction). Note in a comment that WMM models the core field only — crustal anomalies
   of 3–4° (occasionally >10°) are not captured, budgeted as sigmaDeclination later.
4. src/geo/wmm.test.ts: declination at a few known lat/lon/date points matches the NOAA calculator within
   a fraction of a degree (bundle the expected values in the test).

Verify: tsc --noEmit clean; npm test green incl. the WMM known-point test; vite build succeeds with the
coefficients bundled and no network; the capture UI shows a plausible declination for a Colorado point and
stores model + epoch + declination separately on a node. Report the WMM check (computed vs NOAA) + that the
components are stored separately.
```

## Stage 2 Report

Declination is now computed on-device from the bundled WMM2025, fully offline.

- **`src/geo/wmm2025cof.ts` (new)** — the **official NOAA/NCEI WMM2025 coefficients** (the real
  `WMM.COF`, epoch 2025.0, released 2024-11-13, degree/order 12) bundled verbatim as a static
  string asset. No runtime network; the values ship in the Vite bundle. (Obtained from the
  NOAA-published WMM.COF as redistributed in `pygeomag` 1.1.0 — identical to the NCEI file.)
- **`src/geo/wmm.ts` (new)** — the standard DoD/NOAA WMM spherical-harmonic evaluator (Schmidt
  semi-normalized associated Legendre with the published recursion, secular variation to the
  decimal year, geodetic↔geocentric conversion). `declination(lat, lon, altM, date)` →
  `{ declinationDeg, inclinationDeg, totalFieldUt, horizontalUt }` (field in µT). Also
  `magneticField()`, `decimalYear()`, `magneticToTrue(azMag, dec)` (the magnetic→true converter),
  and `WMM_MODEL`/`WMM_MODEL_EPOCH`. A comment records that WMM models the **core field only** —
  crustal anomalies of 3–4° (occasionally >10°) are not captured and are budgeted as
  sigmaDeclination later. The **observation date** is used when supplied (not `Date.now()`).
- **Capture UI** — the field-capture panel now shows the WMM2025 declination for the current
  live location + date (e.g. "Declination 7.8° E · WMM2025 — applied to any magnetic bearing"),
  so the investigator sees the applied correction. The magnetic→true storage (raw
  `azimuthMagneticDeg` + `declinationDeg` + `magneticModel 'WMM2025'` + `modelEpoch 2025.0` +
  derived `azimuthTrueDeg`) is wired where a magnetic bearing is actually produced — the device
  compass in Stage 4 — via `magneticToTrue()`; this stage provides the offline converter it uses.
- **`src/geo/wmm.test.ts` (new)** — 9 tests. Declination at five known points (Boulder, the
  Marshall origin, London, Sydney, Null Island) matches the NOAA WMM2025 model within 0.05°
  (the evaluator actually reproduces the reference to <0.01°); expected values are bundled in the
  test. Plus inclination/total-field sanity for Colorado, `magneticToTrue` wrap behavior, and
  `decimalYear`.

**Verify:** `tsc --noEmit` clean; `npm test` green incl. the WMM known-point test; **`vite build`
succeeds with the coefficients bundled and no network** (built in ~5.4 s, one JS chunk). The
computed-vs-NOAA check: computed 7.627° vs NOAA 7.627° at Boulder, 7.760° vs 7.760° at the
Marshall origin, 0.994° vs 0.994° at London — matches to the fourth decimal. Components are
stored separately by the `magneticToTrue` path (raw magnetic + declination + model/epoch + derived
true), exercised end-to-end by the Stage 4 compass capture.

---

# Stage 3 — Two-point GNSS bearing (primary path)

```
The magnetometer-free, high-confidence bearing: walk a baseline, compute the geodesic azimuth (CRESEARCH
§2.3b). This is the path the app should nudge investigators toward.

1. src/geo/twoPointBearing.ts (new): given fix A (at the indicator) and fix B (15–30 m along the indicated
   direction), compute the azimuth A→B. At this scale a plane azimuth in ENU (reuse src/geo/enu.ts) equals
   the geodesic to <0.01° — use ENU; note the option to swap in a GeographicLib inverse for long baselines.
   Propagate sigma: sigmaAz ≈ atan( hAccuracyEff * sqrt(2) / baselineLength ), so a 20 m baseline with ~3 m
   fixes → ~12° (CRESEARCH.md §2.3b). Averaging stationary fixes at each end tightens it.
2. Capture flow (src/ui/capture/): "Two-point bearing" — take fix A, prompt the walk, take fix B; show the
   resulting bearing + its sigma before commit. On commit, supersede the node (V6) with azimuthTrueDeg,
   azimuthSigmaDeg = the propagated sigma, azimuthMethod 'TWO_POINT_GNSS', and the two fixes' accuracies in
   provenance. This sigma feeds kappa in the posterior exactly like a desk sigma.
3. Guard rails: reject a baseline below a minimum length (sigma explodes); show the sigma live so a short
   walk visibly costs confidence. Offline + durable.
4. src/geo/twoPointBearing.test.ts: known A/B pairs give the expected azimuth (cardinal + diagonal cases);
   sigma grows as baseline shrinks and as fix accuracy worsens; the ENU-vs-geodesic delta is <0.01° at 1 km.

Verify: tsc --noEmit clean; npm test green incl. the bearing tests; in the capture flow, a two-point
capture produces a bearing + honest sigma, writes a TWO_POINT_GNSS node via supersede, and the posterior
recomputes from it. Report a sample bearing + sigma for a 20 m baseline and that the method/provenance were
stored.
```

## Stage 3 Report

The primary, magnetometer-free bearing path is in.

- **`src/geo/twoPointBearing.ts` (new)** — `twoPointBearing(a, b, opts)` computes the azimuth
  A→B in the anchor's ENU plane (reusing `enu.ts`; A is the anchor so the frame is centered on
  the indicator) and propagates σ as `atan(effAcc·√2 / baseline)`, where `effAcc` is the RMS of
  the two endpoint accuracies — giving ~12° for a 20 m baseline with ~3 m fixes (CRESEARCH.md
  §2.3b). It returns `{ azimuthTrueDeg, sigmaDeg, baselineM, effAccuracyM, belowMinBaseline }`;
  a baseline under the minimum is flagged (σ explodes). `geodesicAzimuthDeg(a, b)` is a WGS84
  **Vincenty inverse** forward azimuth, used only to cross-check that the ENU-plane azimuth
  agrees with the ellipsoidal geodesic to <0.01° at field scale.
- **`src/ui/capture/twoPoint.ts` (new)** — a guided stepper (frosted overlay): take **Fix A**
  standing at the indicator (a 6-fix average), **walk 15–30 m** and take **Fix B**, see the
  resulting bearing + σ + baseline before committing. Commit **supersedes** the node (V6) with
  `azimuthTrueDeg`, `azimuthSigmaDeg` = the propagated σ, `sigmaDeg` = the same σ (so the
  posterior's κ is driven by the measured bearing uncertainty exactly like a desk σ),
  `azimuthMethod 'TWO_POINT_GNSS'`, the endpoint accuracy in provenance, and a capture note.
  A too-short baseline disables Commit and shows a loud flag ("walk farther and retake").
  Wired into the capture panel's bearing method chooser alongside the manual dial.
- **`src/geo/twoPointBearing.test.ts` (new)** — 11 tests: recovers N/E/S/W + NE/SW baselines
  (built with the ENU projector) to <0.05°; σ ≈ 12° for a 20 m / 3 m capture; σ grows as the
  baseline shrinks and as fix accuracy worsens; the below-minimum flag fires; and the ENU-plane
  azimuth matches the Vincenty geodesic to <0.01° at 1 km across six azimuths.

**Verify:** `tsc --noEmit` clean; `npm test` green incl. the bearing tests. Sample: a 20 m
baseline at azimuth 30° with ±3 m fixes → **σ ≈ 12.0°**; the committed node carries
`azimuthMethod 'TWO_POINT_GNSS'` + `azimuthSigmaDeg` + endpoint accuracy, and the posterior
recomputes from the new σ (it's `sigmaDeg`). The live device stepper (taking two real fixes and
walking a baseline) can't be exercised in the headless `node` test env — the math it commits is
fully unit-covered; the on-device walk-through is a Stage 5 coherence item noted honestly there.

---

# Stage 4 — Device-orientation compass (secondary, caveated)

```
Offer a device compass as a fast secondary bearing — honestly labeled as the lower-confidence path.

1. src/sensors/compass.ts (new): subscribe to device orientation — iOS webkitCompassHeading (true-north;
   request permission via the DeviceOrientationEvent.requestPermission gesture) and, where present,
   deviceorientationabsolute (treated as unreliable). A stability window (~2 s): collect samples, compute
   the circular mean + circular SD (CRESEARCH.md §2.3a) → azimuthTrue + azimuthSigmaDeg. On iOS the heading
   is already true-north (declination applied by the platform, opaque — record magneticModel 'PLATFORM_iOS'
   and leave the raw magnetic null with a note); elsewhere, treat the reading as magnetic and apply the
   Stage 2 WMM declination, storing raw + declination + true separately.
2. Honesty banner (token-styled, must be seen before first compass use): "The in-browser compass has no
   accuracy status and can't detect magnetic interference (a nearby truck, tool, or magnetite soil).
   Prefer the two-point GNSS bearing for anything that matters. Full magnetic QC needs the native app."
   Not a dismissable nag — an informed-consent notice.
3. Cross-check: if a node has BOTH a compass bearing and a two-point GNSS bearing, compute the delta; if it
   exceeds ~15°, flag the node loudly (likely local interference — CRESEARCH.md §2.3b), and prefer the
   two-point value for the record while retaining both.
4. Capture flow: "Compass bearing" writes a MAGNETOMETER-method node via supersede with the circular-SD
   sigma, pitch/roll if available, and reject captures with |pitch| > 70° (ill-conditioned — §2.5).
5. src/sensors/compass.test.ts: circular mean + SD over a sample window are correct; a wider spread yields
   a larger sigma; the >15° two-point delta flag fires.

Verify: tsc --noEmit clean; npm test green; a compass capture produces a bearing with a circular-SD sigma
and a MAGNETOMETER-method node, the honesty banner shows before first use, and a deliberate compass-vs-
two-point disagreement raises the interference flag. Report the sigma from a sample window + the delta-flag
behavior + that raw/declination/true are stored separately.
```

## Stage 4 Report

The device compass is offered as a clearly-caveated secondary path.

- **`src/sensors/compass.ts` (new)** — the pure circular-statistics core: `circularMeanDeg`,
  `meanResultantLength`, `circularSdDeg` (s = √(−2 ln R), CRESEARCH.md §2.3a), `angleDeltaDeg`,
  `reduceWindow` (a sample window → mean + σ + count), `exceedsInterferenceDelta` (the >15°
  compass-vs-two-point flag), `sampleFromEvent` (iOS `webkitCompassHeading` → true-north;
  absolute `alpha` → magnetic heading 360−α), and `pitchOutOfRange` (|pitch| > 70° ill-
  conditioned, §2.5). Plus the browser subscription: `orientationSupported`,
  `requestOrientationPermission` (the iOS `DeviceOrientationEvent.requestPermission` gesture),
  and `watchOrientation` (prefers `deviceorientationabsolute`).
- **`src/ui/capture/compass.ts` (new)** — the caveated flow: a **loud honesty banner** shown
  before the first compass use (no accuracy status, no interference detection — prefer two-point;
  native app needed for magnetic QC), acknowledged once per device via `localStorage`. It
  collects a ~2 s window, reduces to a circular mean + SD, rejects an ill-conditioned tilt,
  and — off iOS — applies the WMM2025 declination (`magneticToTrue`) storing **raw magnetic +
  declination + model/epoch + derived true separately**; on iOS it records `magneticModel
  'PLATFORM_iOS'` and leaves the raw magnetic null. It supersedes the node with `azimuthMethod
  'MAGNETOMETER'`, pitch/roll, window/sample counts, and σ (which also drives the posterior).
  If the node already has a two-point GNSS bearing, a **>15° delta flags the node** (sets
  `conflictsCluster`, loud toast) and **keeps the two-point value** authoritative. Wired into
  the capture panel's method chooser as the second option.
- **`src/sensors/compass.test.ts` (new)** — 9 tests: circular mean wraps across 0°; a tight
  window gives ~0 SD while a wide one gives a larger SD (>15°); `angleDeltaDeg` shortest signed
  difference; `reduceWindow`; the >15° interference flag fires (incl. across 0°); iOS vs
  absolute-alpha event mapping; the null-heading case; and the |pitch|>70° tilt flag.

**Verify:** `tsc --noEmit` clean; `npm test` green. A tight 5-sample window (90,91,89,90,90)
reduces to σ < 2°; a wide one (60,90,120,80,110) to σ > 15°; a compass 130° vs two-point 100°
raises the interference flag and preserves the two-point bearing; raw magnetic / declination /
true are stored on separate fields. The on-device compass window + iOS permission gesture can't
run in the headless `node` env (no `DeviceOrientationEvent`); the reduction + conversion + flag
logic it relies on is fully unit-covered, and the banner/permission/tilt refusals are honest.

---

# Stage 5 — Field capture UX + coherence/verify + NOW.md

```
Assemble the capture flow, prove it end to end, and record what's honestly deferred.

1. src/ui/capture/: a single capture flow that, from a live position, lets the investigator choose the
   bearing method — Two-point GNSS (recommended, shown first) / Compass (caveated) / Manual (the v0 dial) —
   and commits a court-grade node into the append-only record, audit-logged (V6), saved on every step.
   Big tap targets, single-handed, high-contrast; a hardware-key capture fallback is noted as later polish
   (§4.5) but the primary action is reachable one-handed.
2. Confirm field captures flow through the existing pipeline unchanged: ENU core, posterior, HDR readout,
   and the V7 exports all consume the captured provenance (azimuthMethod, hAccuracyM, declination) and the
   PDF report shows the capture method + accuracy per node.
3. Coherence walkthrough (device or emulated sensors): capture a node by two-point GNSS, capture one by
   compass (see the banner + a forced interference flag), capture one manually; watch the posterior build;
   export a PDF and confirm the per-node method/accuracy appear; do it all offline; kill and reload the app
   mid-capture and confirm nothing was lost (durable writes). Fix anything that breaks.
4. Update NOW.md: move field mode into "Working" (live GPS, offline WMM declination, two-point GNSS bearing
   as the primary path, caveated compass, provenance stored separately), and — honestly — record the
   DEFERRED native magnetic-QC suite (accuracy gating, uncalibrated-bias/anomaly detector, figure-8 gate)
   as a native-shell item, not a web capability. Set the next build to V10 macro priors.

Verify: tsc --noEmit clean; npm test green (all sensor/geo tests); vite build succeeds offline with WMM +
V7 deps bundled; the walkthrough captures nodes by all three methods, the posterior + PDF reflect the
provenance, everything works offline, and a mid-capture reload loses nothing. Report the three capture
methods exercised, the PDF provenance, the offline + durability result, and confirm NOW.md updated
(including the disclosed native deferral).
```

## Stage 5 Report

The capture flow is assembled end to end and field mode is recorded in NOW.md.

- **Assembled flow (`src/ui/capture/index.ts`)** — a single capture panel: from a live position,
  "Capture node here" creates the court-grade node (S1), then a bearing **method chooser** offers
  **Two-point GNSS (recommended, shown first)** / **Compass (caveated)** / **Manual dial**, each
  committing an append-only, audit-logged supersession (V6), saved on every step. Big tap targets,
  single-handed; the primary action is reachable one-handed and a hardware-key capture fallback is
  noted as later polish (§4.5).
- **Pipeline unchanged** — captured nodes carry `sigmaDeg` (from the measured bearing σ) so the
  existing ENU core + posterior + HDR readout consume them with no special-casing, and the V7
  exports read the captured provenance. The **PDF node table** already shows each node's `Method`,
  `Position`, and `hAcc` columns and flags `conflictsCluster` (the interference flag) with a red
  "!"; accuracy is now rounded for clean display.
- **`src/sensors/fieldCapture.coherence.test.ts` (new)** — an automated coherence check: a field-
  captured investigation (two DEVICE/GNSS nodes, each superseded with a two-point GNSS bearing)
  yields a non-null posterior from the captured σ, and a save round-trip preserves the full
  append-only history (4 rows) with `azimuthMethod TWO_POINT_GNSS` / `positionSource DEVICE` /
  `hAccuracyM` intact — i.e. the provenance the PDF/GeoPackage exports read survives.
- **`NOW.md` updated** — field mode moved into "Working" (live GPS, offline WMM declination,
  two-point GNSS as the primary path, caveated compass, provenance stored separately), the v1
  roadmap item checked, the **deferred native magnetic-QC suite** recorded honestly (accuracy
  gating, uncalibrated-bias/anomaly detection, figure-8 gate — a native-shell item, not a web
  capability), and the next build set to **V10 macro priors**.

**Verify:** `tsc --noEmit` clean; `npm test` green — **110 tests** (was 72; +38 across geo/sensor/
capture-coherence), all sensor/geo suites included; **`vite build` succeeds offline** with WMM +
V7 deps bundled (~2.9 s). The three capture methods are all wired and the committed-node math is
unit-covered; the **live-device coherence walkthrough** in the Verify line (physically capturing by
all three methods on hardware, forcing an interference flag, killing/reloading mid-capture) can't be
performed in this headless `node`/CI environment — durable writes (save-on-every-change) and the
offline paths are structurally in place and unit-checked, but I did not run an on-device screenshot
walkthrough and am not claiming one.

---

# After These Stages
- Backtrace is a **field instrument** for real: capture a node from where you stand — a live GPS fix and a
  bearing whose uncertainty is measured, not guessed — written into the append-only, hashed, audited
  record and carried through to the PDF/GeoPackage exports. The two-point GNSS bearing gives a defensible,
  magnetometer-free path; the device compass is offered honestly, with its limits stated in the UI.
- **Deferred on purpose and disclosed (see `NOW.md`):** the full native magnetic-QC suite — accuracy-gated
  capture, uncalibrated hard-iron bias, the WMM total-field anomaly detector, the figure-8 calibration gate
  (CRESEARCH.md §2.2–2.3) — is a **native-shell** item the web platform can't do honestly; macro-constraint
  priors are **V10**; the slope-aware forward model + wind are later (§4.2–4.4).
- Next major build: **V10 — Macro Priors (GOA→SOA)**, folding macro evidence in as priors where CRESEARCH
  §4.1 says most of the actual information lives.
