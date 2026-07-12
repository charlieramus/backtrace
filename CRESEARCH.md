# Origin Matrix: Architecture and Geodesy Brief

**Scope:** vector math, sensor fusion, offline schema, NWCG domain integration, field UX.
**Status:** research brief, not a build plan. Read Section 0 before anything else.

---

## 0. The design premise you have to fix first

You described the core mechanic as: aim, log, intersect, shrink the polygon. That mechanic assumes fire pattern indicators (FPIs) give you a bearing with small angular error. The peer-reviewed validation literature says otherwise, and this single fact should shape every other decision in the app.

**Parker and Babrauskas (2024), *Fire* 7(1), 5, DOI 10.3390/fire7010005.** Three single-point-ignition test burns at Camp San Luis Obispo, level scrubland, mild wind, ground truth established by drone video. Four senior investigators (all FI-210 qualified, all court-qualified experts, 130+ combined years) assessed 101 artifacts each, 404 total assessments, using the exact photographic methodology PMS 412 and FI-210 teach.

| Metric | Result |
|---|---|
| Mean absolute directional error | **103 degrees** |
| Error if you only count correctly-typed spread (advancing/lateral/backing) | 103 degrees (no improvement) |
| Error when assessed as an indicator *cluster* rather than individually | 109 degrees (slightly worse) |
| Random-number-generator baseline | 90 degrees |

Per-indicator (Table 5 of the paper):

| Indicator | Mean error | n |
|---|---|---|
| Protection | 81 deg | 39 |
| White ash | 81 deg | 6 |
| Sooting | 97 deg | 20 |
| Angle of char | 98 deg | 89 |
| Grass stem | 98 deg | 7 |
| Staining | 106 deg | 133 |
| Foliage freeze, cupping, spalling, curling, V/U | insufficient data | 0 to 2 |

The authors' own words, paraphrased: an error band that large will not let an investigator triangulate back to the correct origin. They still believe experienced investigators regularly find the specific origin area, but by integrating witness statements, video, perimeter timing, and fire behavior context, not by summing indicator vectors.

Counterweight, so you get both sides: Simeoni et al. (2017), *J. Fire Sci.* 35, 359 to 378, found FPIs useful but only "within the frame of a global analysis." Parker and Babrauskas re-scored that study's 17 artifacts and got 5 of 13 determinate ones within 45 degrees. The IAWF and NWCG position is that the 11 FPIs have been validated through decades of field application. NWCG has published no underlying validation science, which is exactly the criticism.

### What follows from this

1. **Your magnetometer is not your bottleneck.** A phone magnetometer under field conditions gives you something like 5 to 15 degrees of heading error. The human reading the char pattern gives you 80 to 106 degrees. Spending your first month on a hand-rolled Kalman filter is optimizing a term that is roughly 1/50th of your total variance. Do the sensor work properly (it is cheap, and it matters for defensibility), but do not mistake it for the hard problem.

2. **Do not build an oracle.** A "predicted origin polygon" that tightens as nodes are added is exactly the wrong affordance, because with von Mises noise this wide, adding nodes tightens the *estimator* while the *truth* stays outside the polygon. You will build a machine that produces confident wrong answers, and it will be used in criminal prosecutions and in utility cost-recovery cases worth hundreds of millions of dollars.

3. **The correct product is a documentation and hypothesis-testing instrument.** It records what the investigator observed, with full provenance, and it shows the *posterior over the origin area* including how flat and multimodal that posterior is. It supports the NFPA 921 scientific method loop: form hypothesis, test it against data, discard it. It never prints a coordinate without a stated method, a stated confidence level, and a stated known error rate.

4. **This is not a hedge, it is your moat.** Every competitor can draw lines on a map. Nobody has built a defensible chain-of-custody FPI capture tool with honest uncertainty quantification and a court-ready export. That is the product.

Everything below assumes you accept this reframing.

---

## 1. Vector mathematics and spatial formulas

### 1.1 First: stop thinking about the globe

A wildfire general origin area (GOA) is on the order of 10 m to 1 km across. Specific origin area (SOA) is often a few meters. Over 1 km, the difference between a great-circle bearing and a plane bearing is under 0.01 degrees, and the difference between the sphere and the WGS84 ellipsoid is a few parts per million.

**Haversine, Vincenty, and great-circle intersection are the wrong tools at this scale.** Vincenty in particular is a trap: it fails to converge for near-antipodal points and it buys you nothing here.

Do this instead:

```
1. Pick an anchor point A (first node, or the centroid of the burn perimeter).
2. Convert every lat/lon/alt to a local East-North-Up (ENU) tangent plane at A.
   WGS84 -> ECEF -> ENU. Exact, standard, no approximation error worth naming.
3. Do ALL geometry in ENU meters. Plane geometry. Simple. Debuggable.
4. Convert results back to lat/lon only at the display and export boundary.
```

ENU forward transform (this is the whole thing):

```python
a  = 6378137.0
f  = 1/298.257223563
e2 = f*(2-f)

def geodetic_to_ecef(lat, lon, h):
    N = a / sqrt(1 - e2*sin(lat)**2)          # prime vertical radius
    return ((N+h)*cos(lat)*cos(lon),
            (N+h)*cos(lat)*sin(lon),
            (N*(1-e2)+h)*sin(lat))

def ecef_to_enu(p, p0, lat0, lon0):
    d = p - p0
    R = [[-sin(lon0),             cos(lon0),            0        ],
         [-sin(lat0)*cos(lon0),  -sin(lat0)*sin(lon0),  cos(lat0)],
         [ cos(lat0)*cos(lon0),   cos(lat0)*sin(lon0),  sin(lat0)]]
    return R @ d                              # -> (E, N, U) in metres
```

Azimuth to ENU unit vector (azimuth is clockwise from North, so it is **not** the usual math convention):

```python
d = (sin(az_true), cos(az_true))   # (E, N). Note sin on East, cos on North.
```

Where you *do* want proper geodesy: exporting to a GIS, computing long distances, and anything involving the geodetic azimuth between two GPS fixes (see the compass-free capture mode in Section 2). For that, use **GeographicLib** (Karney, *Algorithms for geodesics*, J. Geodesy 87(1):43 to 55, 2013). It has ports in C, C++, Java, JavaScript, Python, and Swift. If you ever genuinely need geodesic-to-geodesic intersection on the ellipsoid, Karney solved it two ways: the ellipsoidal gnomonic projection method (geodesics map to nearly straight lines, iterate to round-off, valid when the intersection is reasonably close) and the newer complete treatment in arXiv:2308.00495. Use the library, do not reimplement.

### 1.2 The naive answer, and why it is a trap

Everyone reaches for the same estimator: the point minimising the sum of squared perpendicular distances to n lines. In 2D it collapses to something very clean. Let node i have ENU position `p_i` and unit direction `d_i`, with unit normal `n_i = (-d_i.y, d_i.x)`. The perpendicular distance from candidate `x` to line i is `n_i . (x - p_i)`. So:

```
minimise  J(x) = Σ w_i * ( n_i · (x - p_i) )^2

d J/dx = 0  =>   ( Σ w_i n_i n_iᵀ ) x  =  Σ w_i n_i n_iᵀ p_i
                        M                          b

x_hat = M^-1 b      # 2x2 solve, closed form
```

This is fast, it is what most people ship, and it is **biased**. Three reasons:

- **The noise is in the angle, not in the perpendicular offset.** A 10 degree error at 20 m produces a 3.5 m residual; the same 10 degree error at 400 m produces 69 m. Weighting perpendicular residuals equally silently over-trusts distant nodes. This bias is well documented in the bearings-only localisation literature (Stansfield 1947; Gavish and Weiss, *IEEE Trans. AES* 28(3), 1992).
- **It solves for lines, not rays.** A node "pointing away" from the true origin will still contribute, because the infinite line passes near the solution. You must enforce `t_i = d_i · (x - p_i) > 0`.
- **It has no robustness.** With 100 degree indicator noise you will have gross outliers, and one bad node drags `x_hat` arbitrarily far.

Partial fix (Stansfield weighting): set `w_i = 1 / (σ_i² · r_i²)` where `r_i = |x - p_i|`, then iterate (r depends on x). Better fix below.

### 1.3 What I would actually build: a grid posterior with von Mises likelihoods

This is the method that survives your error budget, and it directly answers your "probability heatmap" question. It is not a workaround. It is the correct estimator for circular, heavy-tailed, possibly-multimodal bearing data.

**Setup.** Rasterise the search region in ENU: for a 1 km AOI at 2 m cells that is 500 x 500 = 250k cells. For each cell `x` and each node `i`:

```python
# expected back-azimuth from node i to candidate origin x
beta = atan2(x.E - p_i.E, x.N - p_i.N)        # radians, clockwise from N
delta = wrap_pi(theta_i - beta)               # theta_i = observed back-azimuth
```

**Likelihood.** Angular error is circular, so use the **von Mises** distribution (the circular Gaussian):

```
p(theta_i | x) = exp( kappa_i * cos(delta) ) / (2*pi*I0(kappa_i))
```

`kappa_i` is the concentration parameter. Recover it from the node's circular standard deviation `sigma_i` (radians):

```python
R = exp(-sigma**2 / 2)                        # mean resultant length
# Fisher (1993) inversion of R = I1(k)/I0(k):
if   R < 0.53: kappa = 2*R + R**3 + 5*R**5/6
elif R < 0.85: kappa = -0.4 + 1.39*R + 0.43/(1-R)
else:          kappa = 1/(R**3 - 4*R**2 + 3*R)
```

Sanity check the numbers: `sigma = 90 deg = 1.571 rad` gives `R = 0.29`, `kappa ≈ 0.61`. A von Mises with kappa 0.6 is nearly flat. **The math will refuse to be confident, which is exactly what you want.** If a node's likelihood surface is nearly uniform, it should not shrink the polygon, and this formulation guarantees it does not.

**Robustness for free.** Mix in a uniform outlier component:

```python
eps = 0.15                                    # ~15% of FPIs are grossly misread
L_i = (1-eps) * vonmises(delta, kappa_i) + eps / (2*pi)
```

A single wildly-wrong node now contributes a bounded amount instead of dragging the whole solution. This is a one-line replacement for RANSAC or an IRLS Huber loss, and it is principled.

**Ray constraint.** Nodes only see fire coming *from* the origin. Zero out (or heavily downweight) cells behind the observer relative to the indicated direction, or simply fold it into `delta`, which the von Mises already handles: `cos(delta)` is negative for anything more than 90 degrees off, so a cell directly behind gets `exp(-kappa)`.

**GPS uncertainty.** Marginalise `p_i` or, cheaply, inflate `sigma_i` by the angular subtense of the GPS error at the working range: `sigma_i_eff = sqrt(sigma_azimuth² + (h_acc / r)²)`. At 5 m horizontal accuracy and 30 m range that is 9.5 degrees, non-trivial for close-in nodes.

**Posterior.**

```python
log_post = log_prior                          # from macro indicators, see Sec 4
for i in nodes:
    log_post += log(L_i(grid))                # vectorised, one pass per node
post = softmax_normalise(log_post)
```

Cost: 250k cells x 40 nodes = 10M `cos()` evaluations. Sub-100 ms in Kotlin/Swift, roughly 1 s in plain JS. Use a coarse-to-fine pyramid (32 m grid, then refine the top 5% of mass at 2 m) if you need it interactive.

**It is incremental for free.** Adding a node is one more multiply into the existing posterior. This is the recursive-update property you wanted from a Kalman filter, without any of the Kalman assumptions.

### 1.4 Extracting the "origin polygon" honestly

The polygon is a **highest density region (HDR)**, not an error ellipse:

```python
flat = sort(post.flatten(), descending=True)
cum  = cumsum(flat)
threshold = flat[searchsorted(cum, 0.95)]     # 95% credible region
mask = post >= threshold
polygon = marching_squares(post, level=threshold)   # -> contour(s) in ENU
```

This gives you, for free:

- Non-intersecting lines: no problem, the posterior is just broader.
- **Multimodality:** if the indicators support two candidate origins, marching squares returns two polygons. An ellipse would have averaged them into a lie. This is a feature, and it maps directly onto NFPA 921's requirement to consider alternate hypotheses.
- Area of the region is a single honest quality number to show the user. Report it in m². When it is 40,000 m², say so.

Display nested contours (50 / 68 / 95%) as a heatmap, not a single hard boundary.

### 1.5 If you still want the closed-form ellipse (for the LS route)

```python
sigma0_sq = sum(w_i * r_i**2) / (n - 2)       # weighted residual variance
Cov = sigma0_sq * inv(M)                      # 2x2
lam, V = eigh(Cov)                            # eigenvalues, eigenvectors
chi2 = {0.50: 1.386, 0.68: 2.296, 0.95: 5.991, 0.99: 9.210}[conf]   # 2 dof
semi_major = sqrt(lam[1] * chi2)
semi_minor = sqrt(lam[0] * chi2)
rotation   = atan2(V[1,1], V[0,1])
```

`chi2` for 2 degrees of freedom is analytic: `s = -2 ln(1 - conf)`.

**Geometry check (the bearings analogue of GDOP).** Near-parallel rays make `M` ill-conditioned and the ellipse degenerates into a useless sliver pointing at infinity. Compute `cond(M) = lam_max/lam_min` and refuse to render a solution above a threshold (say 50). Show the user a "poor geometry, collect nodes from a different sector" prompt instead. This is the single most useful piece of live UI feedback you can give an investigator in the field, and no competitor does it.

### 1.6 Why not Kalman

A Kalman filter estimates a **time-evolving state** with **additive Gaussian noise**, updating recursively. Your origin is static, your noise is circular and heavy-tailed, and you have all the data at once. A KF here is cargo cult. The grid posterior gives you the recursive update you actually wanted, with the right noise model. Cross it off the list.

(The one place a filter does belong: smoothing the live azimuth stream from the IMU before you capture it. And even there, use the platform's fusion, not your own. See below.)

---

## 2. Sensor fusion and azimuth sanitisation

### 2.1 Do not write your own AHRS

Use the platform's fused orientation. It already runs a vendor-tuned Kalman or complementary filter over the accelerometer, gyroscope, and magnetometer, and it is better than what you will write.

**Android**

```kotlin
// YES: fused, absolute, magnetometer-referenced
Sensor.TYPE_ROTATION_VECTOR

// NO: TYPE_GAME_ROTATION_VECTOR omits the magnetometer -> relative heading, drifts
// NO: raw TYPE_MAGNETIC_FIELD + TYPE_ACCELEROMETER -> the noisy path everyone regrets

SensorManager.getRotationMatrixFromVector(R, event.values)
SensorManager.remapCoordinateSystem(R, AXIS_X, AXIS_Z, Rremap)  // for a phone held upright, camera forward
SensorManager.getOrientation(Rremap, orientation)
val azimuthMagnetic = Math.toDegrees(orientation[0].toDouble())

// Also subscribe to TYPE_MAGNETIC_FIELD_UNCALIBRATED:
//   values[0..2] = uncalibrated field, values[3..5] = estimated hard-iron bias.
//   A large or rapidly-changing bias is a red flag. Log it.
// event.accuracy: SENSOR_STATUS_ACCURACY_{LOW,MEDIUM,HIGH}. Gate capture on HIGH.
```

**iOS**

```swift
motionManager.startDeviceMotionUpdates(using: .xTrueNorthZVertical)
// This reference frame is ALREADY true-north referenced by CoreMotion
// (it requires CLLocationManager to be running for the location fix).
// deviceMotion.attitude.yaw -> heading
// deviceMotion.magneticField.accuracy -> .uncalibrated / .low / .medium / .high
// CLHeading.headingAccuracy -> Apple's own estimate in degrees. Log it verbatim.
```

Note the asymmetry: iOS hands you true north; Android hands you magnetic north and you apply declination yourself. Normalise in your abstraction layer, and **store the magnetic reading and the declination separately regardless of platform** (see 2.4).

### 2.2 What actually destroys the reading

| Source | Magnitude | Detection |
|---|---|---|
| Hard iron (phone case magnets, MagSafe, magnetic mounts, speakers) | 10 to 90+ deg | uncalibrated bias vector; total field magnitude |
| Nearby ferrous mass (Pulaski, shovel, radio, truck, rebar, fence) | 5 to 60 deg | total field magnitude; dip angle |
| Crustal anomaly (basalt, magnetite-bearing soils, serpentine) | 3 to 4 deg typical, **can exceed 10 deg** (NOAA NCEI) | not detectable in the field without a reference |
| Soft iron (steel in the device, tripod) | 2 to 10 deg | requires figure-8 calibration |
| Tilt error | grows fast above ~60 deg pitch | pitch/roll from the same rotation matrix |

Western US fire country has a lot of basalt.

### 2.3 The five things that make the azimuth defensible

**(a) Stability gate plus circular statistics. This is the single highest-value thing in this section.**

Do not capture on button-press. Capture a 2 second window and reject it if the device was moving:

```python
# gate: gyroscope norm < 0.03 rad/s for the whole window
#       accuracy status == HIGH
#       |pitch| within [-70, 70] deg
#       |B| within 5% of WMM-predicted F  (see (c))

# then, circular mean and circular SD over the window:
C = mean(cos(theta_k)); S = mean(sin(theta_k))
azimuth = atan2(S, C)
R = sqrt(C**2 + S**2)                # mean resultant length, in [0,1]
sigma_circ = sqrt(-2 * log(R))       # radians. THIS IS YOUR PER-NODE sigma_i.
```

**Persist `sigma_circ`.** It is the input to `kappa_i` in Section 1.3. Most apps throw this away and then invent a confidence weight later. Do not.

**(b) The compass-free capture mode. Offer this and make it the "high confidence" path.**

Stand at the indicator. Take a GPS fix. Walk 15 to 30 m in the indicated direction. Take a second fix. Compute the geodesic azimuth between the two fixes with GeographicLib's inverse solve. This is a magnetometer-free bearing, and it is how a surveyor would do it. At 20 m of baseline with 3 m CEP fixes, the bearing uncertainty is roughly `atan(3*sqrt(2)/20) ≈ 12 deg`, which is comparable to a good magnetometer reading and it is **immune to every failure mode in the table above**. Averaging several seconds of stationary fixes at each end tightens it further.

Then compute the delta between the two methods. If it exceeds ~15 degrees, you have local interference. Flag it on the node, loudly.

**(c) The magnetic anomaly detector.**

You already need WMM for declination. It also gives you the *predicted* total field intensity F, the horizontal intensity H, and the inclination I at that lat/lon/alt/date. Compare against what the phone measures:

```python
B = magnitude(raw_mag_xyz)               # micro-tesla, from TYPE_MAGNETIC_FIELD
F_pred = wmm.total_intensity(lat, lon, alt, date)
if abs(B - F_pred) / F_pred > 0.05:      # >5% deviation
    flag("magnetic anomaly, azimuth unreliable")

dip_measured = angle between the mag vector and the horizontal plane (from the rotation matrix)
if abs(dip_measured - wmm.inclination(...)) > 5:
    flag("magnetic anomaly")
```

This costs almost nothing because you have the model loaded anyway, and it catches the truck-parked-nearby case that would otherwise silently corrupt a node.

**(d) Figure-8 calibration prompt** when Android reports accuracy below HIGH or iOS reports `.low`. Standard, but actually block capture on it.

**(e) Log the raw stream.** Raw and uncalibrated magnetometer XYZ, gyro, accel, the quaternion, the accuracy enum, the horizontal/vertical accuracy from the fix, satellite count, and DOP if you can get it. Reproducibility is what makes the record survive cross-examination.

### 2.4 Magnetic north to true north, done properly

The conversion itself is trivial. Everything interesting is in where D comes from and what you store.

```
azimuth_true = wrap360( azimuth_magnetic + D )     # D positive East
```

**The model.** WMM2025, released 17 December 2024, epoch 2025.0, valid 2025.0 to 2030.0, expires 31 December 2029. Produced by NOAA NCEI and BGS for NGA and DGC. It is a degree-12 spherical harmonic model of the core field plus a linear secular variation term.

Evaluation (this is what the NOAA C library does):

```
1. Geodetic (phi, lambda, h) -> geocentric spherical (phi', r).

2. Time-interpolate the Gauss coefficients to the measurement date t (decimal year):
     g_n^m(t) = g_n^m(2025.0) + (t - 2025.0) * gdot_n^m
     h_n^m(t) = h_n^m(2025.0) + (t - 2025.0) * hdot_n^m

3. Magnetic scalar potential (a = 6371200 m, the WMM geomagnetic reference radius):
     V = a * SUM_{n=1..12} SUM_{m=0..n} (a/r)^(n+1)
           * [ g_n^m cos(m*lambda) + h_n^m sin(m*lambda) ]
           * Pbar_n^m( sin(phi') )
   where Pbar is the SCHMIDT SEMI-NORMALISED associated Legendre function.

4. Field components in geocentric spherical coordinates:
     X' = -(1/r) dV/dphi'
     Y' =  (1/(r cos phi')) dV/dlambda
     Z' =  dV/dr

5. Rotate geocentric -> geodetic by the angle (phi - phi'):
     X = X' cos(phi - phi') - Z' sin(phi - phi')
     Z = X' sin(phi - phi') + Z' cos(phi - phi')
     Y = Y'

6. Derived elements:
     H = sqrt(X^2 + Y^2)
     F = sqrt(H^2 + Z^2)
     D = atan2(Y, X)        # DECLINATION. This is the number you want.
     I = atan2(Z, H)        # inclination / dip
```

**Do not implement this from scratch.** Options, ranked:

1. **NOAA's `GeomagnetismLibrary.c`** (public domain, ships with the WMM package). Bundle `WMM.COF` and bridge via JNI on Android and a bridging header on iOS. Roughly 60 KB of coefficients and C. This is the reference implementation and citing it in a report is worth something.
2. **GeographicLib's `MagneticModel` class** (C++, Java, Python). Reads the same `.wmm` coefficient files. Well tested.
3. `android.hardware.GeomagneticField` on Android. Convenient one-liner, but its embedded WMM epoch has historically lagged behind current releases depending on API level. If you use it, verify `getDeclination()` against the NOAA calculator for a known point on your target OS version. A stale epoch is worth roughly 0.5 to 1 degree in CONUS. Acceptable relative to your other errors, but not something you want a defence expert to discover before you do.
4. `CLHeading.trueHeading` on iOS. Uses Apple's own model. Fine, but opaque, and you cannot cite it.

**Four things that will bite you:**

- **Use the date of the observation, not `Date.now()`.** Old fire scenes get revisited; reports get written a year later; nodes get imported from a prior investigation. Secular variation in CONUS is on the order of 0.1 deg/year, so it is small, but a report that recomputes declination at print time and gets a different number than the field capture is an unforced error.
- **Store the components, never the derived value alone.** Schema requirement:
  `azimuth_magnetic`, `declination_deg`, `magnetic_model` ("WMM2025"), `model_epoch` (2025.0), `azimuth_true` (derived), `grid_convergence_deg` (if exporting to UTM/State Plane). If you only store `azimuth_true` you have destroyed the chain of custody and you cannot recompute when the model updates.
- **WMM models the core field only.** It contains no crustal contribution. NOAA states plainly that local declination anomalies of 3 to 4 degrees are not uncommon and can exceed 10 degrees. If you want crustal wavelengths down to 50 km, the Enhanced Magnetic Model (EMM) or High Definition Geomagnetic Model (HDGM) exist, but they are large files and they still will not catch a boulder of magnetite two metres from the investigator's boot. Budget `sigma_declination` and add it in quadrature.
- **Grid north is a third north.** Agency GIS runs in UTM or State Plane. Grid convergence in CONUS runs up to about 3 degrees. Compute it and put it on the export or a GIS analyst will silently misinterpret your bearings.

### 2.5 Pitch, roll, and what "aiming" means

Decide and document the sighting semantics. Two candidates:

- **Camera axis (device -Z).** Natural, matches a viewfinder crosshair, works with the phone held upright.
- **Device long axis (+Y, "top of the phone").** Matches how people point a compass.

Pick the camera axis, remap with `remapCoordinateSystem(R, AXIS_X, AXIS_Z, ...)`, and show a live crosshair plus a bubble level. Reject captures with `|pitch| > 70 deg` (the azimuth becomes ill-conditioned near vertical, and there is no reason to sight a ground indicator from near-vertical anyway). Store pitch and roll on every node: they are QC evidence.

---

## 3. Offline schema

### 3.1 Do not reach for SpatiaLite

Blunt recommendation: **plain SQLite for the working store, GeoPackage for export.**

SpatiaLite on mobile means bundling `mod_spatialite` plus GEOS plus PROJ. That is tens of megabytes of native binary, a real build fight through RN/Flutter FFI, and it exists to give you R-tree spatial indexing and predicate functions (`ST_Intersects`, `ST_Within`) that you do not need for a scene with a few hundred nodes. You will do the geometry in code anyway, in ENU, because that is where the estimator lives.

What you *do* want is **GeoPackage on export** (OGC standard, itself a SQLite database, opens natively in ArcGIS Pro and QGIS). The agency GIS analyst can open your file directly. That is a real integration win and it costs you a writer, not a runtime dependency.

Add SpatiaLite later if and only if you find yourself needing spatial predicates over large multi-incident datasets.

### 3.2 Schema

```sql
-- ============ IMMUTABLE, APPEND-ONLY CORE ============
-- Nodes are never UPDATEd or DELETEd. Corrections write a new row
-- superseding the old. This is chain of custody, not paranoia.

CREATE TABLE incident (
  id                 TEXT PRIMARY KEY,        -- UUIDv7
  agency_incident_no TEXT,
  name               TEXT NOT NULL,
  discovered_at_utc  TEXT,                    -- ISO8601
  datum              TEXT NOT NULL DEFAULT 'WGS84',
  created_at_utc     TEXT NOT NULL,
  created_by         TEXT NOT NULL REFERENCES investigator(id)
);

CREATE TABLE investigator (
  id            TEXT PRIMARY KEY,
  full_name     TEXT NOT NULL,
  agency        TEXT,
  qualification TEXT,                         -- 'INVF', 'CFI', 'FI-210'
  cert_expiry   TEXT
);

CREATE TABLE indicator_type (
  code            TEXT PRIMARY KEY,           -- 'PROTECTION','GRASS_STEM',...
  label           TEXT NOT NULL,
  scale           TEXT NOT NULL CHECK (scale IN ('MICRO','MACRO')),
  pms412_section  TEXT,                       -- '1B.4' etc, cite the source
  -- Empirical angular SD in DEGREES. Sourced from Parker & Babrauskas 2024
  -- Table 5 where available. NULL = no published validation.
  -- This is a DEFAULT prior only. The per-node observed circular SD and the
  -- investigator's confidence rating both override / combine with it.
  prior_sigma_deg REAL,
  evidence_note   TEXT
);

INSERT INTO indicator_type (code,label,scale,prior_sigma_deg,evidence_note) VALUES
 ('PROTECTION',    'Protection',     'MICRO', 81,  'P&B2024 n=39'),
 ('WHITE_ASH',     'White ash',      'MICRO', 81,  'P&B2024 n=6, low n'),
 ('SOOTING',       'Sooting',        'MICRO', 97,  'P&B2024 n=20'),
 ('ANGLE_OF_CHAR', 'Angle of char',  'MICRO', 98,  'P&B2024 n=89'),
 ('GRASS_STEM',    'Grass stem',     'MICRO', 98,  'P&B2024 n=7, low n'),
 ('STAINING',      'Staining',       'MICRO',106,  'P&B2024 n=133'),
 ('FOLIAGE_FREEZE','Foliage freeze', 'MICRO',NULL, 'no validation data'),
 ('CUPPING',       'Cupping',        'MICRO',NULL, 'no validation data'),
 ('SPALLING',      'Spalling',       'MICRO',NULL, 'no validation data'),
 ('CURLING',       'Curling',        'MICRO',NULL, 'no validation data'),
 ('V_U_PATTERN',   'V or U pattern', 'MACRO',NULL, 'macro: treat as PRIOR, not ray');

CREATE TABLE node (
  id                  TEXT PRIMARY KEY,
  incident_id         TEXT NOT NULL REFERENCES incident(id),
  investigator_id     TEXT NOT NULL REFERENCES investigator(id),
  supersedes_node_id  TEXT REFERENCES node(id),   -- correction chain
  voided              INTEGER NOT NULL DEFAULT 0,
  void_reason         TEXT,

  -- POSITION -------------------------------------------------------------
  lat                 REAL NOT NULL,             -- WGS84 degrees
  lon                 REAL NOT NULL,
  ellipsoid_height_m  REAL,
  h_accuracy_m        REAL NOT NULL,             -- 68% radial, from the OS
  v_accuracy_m        REAL,
  hdop                REAL,
  pdop                REAL,
  vdop                REAL,
  sat_count           INTEGER,
  fix_type            TEXT,                      -- 'GNSS','RTK','FUSED','MANUAL'
  position_source     TEXT NOT NULL,             -- 'DEVICE','EXTERNAL_GNSS','MAP_PIN'

  -- ORIENTATION ----------------------------------------------------------
  azimuth_magnetic_deg  REAL,                    -- RAW. never overwrite.
  declination_deg       REAL,                    -- from WMM at THIS lat/lon/date
  magnetic_model        TEXT,                    -- 'WMM2025'
  model_epoch           REAL,                    -- 2025.0
  grid_convergence_deg  REAL,
  azimuth_true_deg      REAL NOT NULL,           -- derived, stored for convenience
  azimuth_sigma_deg     REAL NOT NULL,           -- CIRCULAR SD of capture window
  azimuth_method        TEXT NOT NULL,           -- 'MAGNETOMETER','TWO_POINT_GNSS','MANUAL'
  pitch_deg             REAL,
  roll_deg              REAL,
  capture_window_ms     INTEGER,
  sample_count          INTEGER,

  -- SENSOR QC ------------------------------------------------------------
  mag_accuracy_status   TEXT,                    -- 'HIGH','MEDIUM','LOW','UNCALIBRATED'
  mag_field_ut          REAL,                    -- measured |B|
  mag_field_wmm_ut      REAL,                    -- WMM predicted F
  mag_anomaly_flag      INTEGER NOT NULL DEFAULT 0,
  dip_measured_deg      REAL,
  dip_wmm_deg           REAL,
  gyro_rms_rad_s        REAL,                    -- stillness metric

  -- DOMAIN ---------------------------------------------------------------
  indicator_code      TEXT NOT NULL REFERENCES indicator_type(code),
  spread_type         TEXT NOT NULL CHECK (spread_type IN
                        ('ADVANCING','LATERAL','BACKING','UNDETERMINED')),
  investigator_conf   TEXT NOT NULL CHECK (investigator_conf IN ('HIGH','MED','LOW')),
  conflicts_cluster   INTEGER NOT NULL DEFAULT 0,  -- PMS 412: flag dissenting indicators
  fuel_model          TEXT,                        -- Anderson 13 / Scott&Burgan 40
  slope_pct           REAL,                        -- from DEM
  aspect_deg          REAL,                        -- from DEM
  elevation_m         REAL,
  dem_source          TEXT,                        -- '3DEP_1m_lidar','3DEP_1_3as'
  notes               TEXT,

  -- PROVENANCE -----------------------------------------------------------
  device_time_utc     TEXT NOT NULL,
  gnss_time_utc       TEXT,                        -- authoritative if present
  device_model        TEXT NOT NULL,
  os_version          TEXT NOT NULL,
  app_version         TEXT NOT NULL,
  raw_sensor_blob     BLOB,                        -- gz JSON: full capture stream
  record_hash         TEXT NOT NULL                -- SHA-256 over canonical fields
);
CREATE INDEX idx_node_incident ON node(incident_id) WHERE voided = 0;

CREATE TABLE node_media (
  id            TEXT PRIMARY KEY,
  node_id       TEXT NOT NULL REFERENCES node(id),
  kind          TEXT NOT NULL,                 -- 'PHOTO','VIDEO','AUDIO_NOTE'
  file_path     TEXT NOT NULL,
  sha256        TEXT NOT NULL,                 -- integrity. non-negotiable.
  captured_utc  TEXT NOT NULL,
  cam_azimuth_deg REAL,
  cam_pitch_deg   REAL,
  exif_blob     BLOB
);

-- MACRO indicators are NOT rays. They are region constraints (a V apex,
-- a burn perimeter, a witness-reported first-smoke bearing cone).
-- Store as GeoJSON and consume as a PRIOR, not a likelihood.
CREATE TABLE macro_constraint (
  id            TEXT PRIMARY KEY,
  incident_id   TEXT NOT NULL REFERENCES incident(id),
  kind          TEXT NOT NULL,   -- 'V_APEX','BURN_PERIMETER','WITNESS_CONE',
                                 -- 'FIRST_REPORT_LOC','EXCLUSION_ZONE'
  geometry_json TEXT NOT NULL,   -- GeoJSON, WGS84
  weight        REAL NOT NULL DEFAULT 1.0,
  source        TEXT,            -- 'INVESTIGATOR','IR_FLIGHT','WITNESS','DISPATCH'
  notes         TEXT
);

CREATE TABLE wind_observation (
  id             TEXT PRIMARY KEY,
  incident_id    TEXT NOT NULL REFERENCES incident(id),
  observed_utc   TEXT NOT NULL,
  source         TEXT,                        -- RAWS id, NWS station, spot forecast
  speed_ms       REAL,
  direction_from_deg REAL,                    -- METEOROLOGICAL convention. Document it.
  gust_ms        REAL,
  height_m       REAL DEFAULT 10,             -- 10m open. Convert to midflame yourself.
  temp_c         REAL,
  rh_pct         REAL
);

-- ============ VERSIONED, REPRODUCIBLE SOLUTIONS ============
-- Every solution ever displayed is persisted with the exact inputs and
-- parameters that produced it. You must be able to answer, in a deposition:
-- "what did the app say on 14 July, and why?"

CREATE TABLE origin_solution (
  id                TEXT PRIMARY KEY,
  incident_id       TEXT NOT NULL REFERENCES incident(id),
  computed_utc      TEXT NOT NULL,
  algorithm         TEXT NOT NULL,            -- 'GRID_VONMISES_V1','WLS_V1','MTT_V1'
  algorithm_version TEXT NOT NULL,
  params_json       TEXT NOT NULL,            -- kappa mapping, eps, grid res, prior
  point_lat         REAL,                     -- posterior mode. Display with care.
  point_lon         REAL,
  region_50_json    TEXT,                     -- GeoJSON HDR polygons
  region_68_json    TEXT,
  region_95_json    TEXT,
  region_95_area_m2 REAL,                     -- SHOW THIS NUMBER TO THE USER
  posterior_entropy REAL,                     -- flatness. high = the data says little.
  n_modes           INTEGER,                  -- >1 => competing hypotheses
  condition_number  REAL,                     -- geometry quality (WLS route)
  n_nodes_used      INTEGER NOT NULL,
  posterior_grid    BLOB                      -- optional: gz float32 raster
);

CREATE TABLE solution_input (
  solution_id TEXT NOT NULL REFERENCES origin_solution(id),
  node_id     TEXT NOT NULL REFERENCES node(id),
  weight_used REAL NOT NULL,
  kappa_used  REAL NOT NULL,
  residual_deg REAL,                          -- post-hoc: how far off was this node?
  PRIMARY KEY (solution_id, node_id)
);

CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  at_utc      TEXT NOT NULL,
  actor_id    TEXT NOT NULL REFERENCES investigator(id),
  action      TEXT NOT NULL,   -- 'CREATE_NODE','VOID_NODE','EXPORT','EDIT_NOTE'
  entity      TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  before_json TEXT,
  after_json  TEXT,
  device_id   TEXT
);

CREATE TABLE dem_tile (                       -- pre-staged, offline
  id          TEXT PRIMARY KEY,
  incident_id TEXT REFERENCES incident(id),
  bbox_json   TEXT NOT NULL,
  res_m       REAL NOT NULL,
  source      TEXT NOT NULL,                  -- '3DEP_1m','3DEP_1_3as'
  file_path   TEXT NOT NULL,
  sha256      TEXT NOT NULL
);
```

**Notes on the design:**

- `prior_sigma_deg` is the honest version of your "confidence weight per indicator type." It is a *standard deviation in degrees*, not an arbitrary 1-to-5 score, because it feeds directly into `kappa` in the estimator. Where there is no validation data, it is NULL and the app must fall back to the investigator's own confidence rating, and it must say so.
- Node correction is `supersedes_node_id` plus `voided`, never `UPDATE`. If a defence expert asks whether data was altered, you show them the chain.
- `record_hash` over the canonical field ordering, and `sha256` on every photo. Cheap, and it forecloses an entire category of cross-examination.
- `gnss_time_utc` because device clocks are wrong and GPS time is not.
- `posterior_entropy` and `n_modes` are the two numbers that keep the app honest. Surface them.

---

## 4. NWCG domain integration and edge cases

### 4.1 Macro versus micro: they are different data types

This is the structural insight your current model is missing. NWCG treats macro indicators (V/U patterns, overall damage gradients, the shape of the burn) as the thing that gets you to the **general origin area (GOA)**, and micro indicators (char angle, protection, grass stem, on individual artifacts) as the thing that gets you from the GOA to the **specific origin area (SOA)**, and then to the ignition area. Doctrine is: work from the outside in, from macro to micro.

So:

- **Micro indicators are likelihoods.** They are rays with von Mises noise. Section 1.3.
- **Macro indicators are priors.** A V apex is a region, not a ray. A burn perimeter is an exclusion boundary. A dispatch first-report location is a soft prior. A witness bearing is a cone. None of these belongs in your ray-intersection code, and forcing them in there is where a lot of naive implementations go wrong.

This drops cleanly into Bayes:

```
log_posterior(x) = log_prior_from_macro(x) + SUM_i log_likelihood_from_micro_i(x)
```

and it means the app's workflow mirrors the doctrine instead of fighting it. Phase 1 of the UI: draw the GOA from macro evidence. Phase 2: collect micro nodes inside it. The prior does most of the work, which is correct, because per Section 0 the micro indicators carry less information than anyone wants to admit.

### 4.2 "Bending" the lines: the honest answer

There is a cheap wrong way and a expensive right way. Both are below. Do not ship the cheap one silently.

**The right way: run the fire backward, do not bend a ray.**

A fire front propagates by Huygens' principle as a family of elliptical wavelets (Richards 1990; this is the engine inside FARSITE, Finney 1998, RMRS-RP-4). Under steady wind and slope, a point ignition produces an elliptical perimeter, and the **ignition point sits at the rear focus of the ellipse, not the centre**. That is the single most useful geometric fact in this whole section, and it means that for advancing-fire indicators the origin is displaced *backward* from where naive back-projection puts it.

The ellipse eccentricity comes from the length-to-breadth ratio, driven by effective midflame wind. Alexander (1985):

```
LB = 1 + 8.729 * (1 - exp(-0.030 * U))^2.155      # U = 10 m open wind, km/h
```

(Anderson 1983 gives fuel-type-specific alternatives. Verify coefficients against Andrews 2018, RMRS-GTR-371, before shipping.)

Rate of spread from Rothermel (1972), the model every US fire behaviour system is built on:

```
R = R0 * (1 + phi_w + phi_s)

phi_s = 5.275 * beta^(-0.3) * (tan(slope))^2                 # slope factor
phi_w = C * (3.281 * U)^B * (beta / beta_op)^(-E)            # wind factor
  C = 7.47  * exp(-0.133 * sigma^0.55)
  B = 0.02526 * sigma^0.54
  E = 0.715 * exp(-3.59e-4 * sigma)
  sigma  = surface-area-to-volume ratio (1/ft), from the fuel model
  beta   = packing ratio, beta_op = optimum packing ratio
```

Note `phi_s` goes as `tan(slope)^2`. Slope is not a small correction. Doubling a 20% slope roughly quadruples its contribution.

Then the estimator becomes:

```
For each candidate origin cell x:
  1. Solve the minimum-travel-time field T(.) from x over the ROS raster
     (Finney 2002, "Fire growth using minimum travel time methods";
      fast-marching or Dijkstra on the raster, with the elliptical
      anisotropic ROS at each cell).
  2. At each node i, the PREDICTED local spread direction is the direction
     of grad T at p_i.
  3. Score exactly as in Section 1.3, but with
        beta_i(x) = direction_of(grad T at p_i)
     instead of
        beta_i(x) = straight-line azimuth from p_i to x.
```

**Same estimator, better forward model.** Your grid-Bayes code from Section 1.3 does not change at all. Only `beta_i(x)` changes. That is why the grid formulation is worth building first: it is the substrate that everything else plugs into.

Cost: one MTT solve per candidate cell is far too expensive on a fine grid. Mitigations: run Stage 1 (straight-line) to get a posterior, take the top-k cells (say the 95% region at 20 m resolution, maybe 200 cells), and MTT-refine only those. Fire spread is not reciprocal under wind, so you cannot cheat by reversing a single solve.

**The cheap way, if you must ship something in v1.5.**

Deflect each expected azimuth toward the aspect direction as a function of slope:

```python
beta_adj = beta + k * sin(aspect_i - beta) * f(slope_i)
```

Be honest: `k` is a fudge factor with zero validation. If you ship this, it must be **off by default**, exposed as a visible tunable, and labelled in the export as a non-standard adjustment. An unvalidated silent correction is the fastest way to get a case thrown out.

### 4.3 Slope and aspect: pre-stage the DEM, do not call an API in the field

- **Online:** USGS Elevation Point Query Service (EPQS), `https://epqs.nationalmap.gov/v1/json?x={lon}&y={lat}&wkid=4326&units=Meters`. Interpolated from 3DEP, overall RMSE 0.53 m. Fine for pre-trip staging and desk work. **Useless in the backcountry**, where you have no signal. Do not architect around it.
- **Offline (correct):** pre-download a 3DEP DEM clip for the incident AOI before departure. 1 m lidar-derived DEM where available, otherwise 1/3 arc-second (roughly 10 m). Cloud Optimized GeoTIFF since 2020, so you can range-request a window instead of pulling a whole tile. Store in `dem_tile`, hash it, and record which DEM produced each node's slope and aspect.
- **Slope and aspect** from Horn's 3x3 kernel (the GDAL and ArcGIS standard). Ten lines of code. At 10 m DEM resolution your slope is smoothed and will underestimate microtopography, which matters because backing fires care about local terrain. Prefer 1 m lidar where it exists.

### 4.4 Wind: be honest that this is the hard one

To use wind you need the wind vector **at each node at the time of fire passage**, which requires knowing the arrival time, which requires knowing the origin, which is what you are solving for. That circularity is real and it is why FARSITE-style reconstruction is a research exercise, not a v1 feature.

Practical path:

1. Ingest RAWS and NWS observations for the incident period into `wind_observation`.
2. Convert 10 m open wind to midflame wind (multiply by a wind adjustment factor from the fuel and canopy: roughly 0.1 to 0.6, see Andrews 2012, RMRS-GTR-266).
3. Let the investigator manually assign a wind regime to a time window and a sub-area, based on their own reconstruction. Do not automate this in v1.
4. Iterate: solve for origin, derive arrival times, re-derive wind at each node, re-solve. Two or three iterations. Report whether it converged, and if it did not, say so loudly.

Also flag: **foliage freeze indicates wind direction, not flame direction.** PMS 412 is explicit about this. If you treat it as a spread vector you are wrong by construction. Your `indicator_type` table should carry a `semantics` column distinguishing "direction fire came from" / "direction of wind flow" / "direction of flame lean".

### 4.5 Field UX and safety requirements

**Offline is not a feature, it is the baseline.**
- Pre-cached vector or raster basemaps (MBTiles or PMTiles, MapLibre GL Native). Nothing may block on a network call, ever.
- Pre-staged DEM, WMM coefficients, and fuel model rasters, all bundled or downloaded during trip prep with a visible "ready for field" checklist.
- Every write is durable immediately. Save on every field change, not on a "Done" button. Assume the app will be killed by the OS mid-form and that the phone will die at 3pm.

**Battery.**
- GPS + camera + max brightness for 8 hours will kill any phone. Duty-cycle the GNSS (you do not need 1 Hz fixes while walking). Offer a low-power mode that drops map rendering.
- Warn hard at 20%. Offer an emergency export at 10%.

**Gloves, sun, smoke, ash.**
- Minimum 60 dp tap targets. Single-handed operation. No hover, no long-press-only affordances.
- Direct sunlight legibility: high-contrast theme, forced max brightness during capture, no thin type, no low-contrast greys.
- Leather gloves do not work on capacitive screens. Provide **hardware volume-button capture** as a fallback for the primary action.
- Assume the screen is covered in ash. Big targets, forgiving hit boxes.

**Safety. Take this seriously, because it is a genuinely hazardous environment.**

PMS 412 states plainly that wildfire scenes may be dangerous, that safety is the highest priority, that scene investigations should be conducted with two or more investigators wherever possible, and that **cell phones are not an adequate substitute for emergency radio communications**. Hazards on a fresh burn include snags, ash pits and stump holes, rolling material on slopes, hydrogen sulfide, and re-burn.

Design consequences:

- **Do not build anything that pulls an investigator's eyes down onto a phone while they walk through a burn.** No turn-by-turn navigation to a suggested next node. No "walk here" arrow. The tool should be used standing still, and it should encourage that.
- Hazard pins (snag, ash pit, hot spot) that the user can drop in one tap and that another investigator on the same incident can see.
- Buddy check-in timer with a configurable interval, and an obvious "I am overdue" state. Do not pretend this replaces a radio. Say so in the UI.
- A prominent, honest offline indicator. Never imply help is a tap away.

**Court defensibility, which is a UX requirement, not just a data one.**

- The app must **never** display a bare "Point of Origin: 39.1234, -105.5678" without the credible region, the confidence level, the algorithm and version, and the number of contributing nodes.
- Label the output as a **Specific Origin Area candidate region**, never as "the point of origin." The investigator determines the origin. The app documents evidence.
- Every export must include a methodology appendix stating the algorithm, the noise model, and the **known error rate of the underlying indicators** (this is a Daubert factor, and disclosing it proactively is far better than having it introduced by opposing counsel).
- Support the NFPA 921 scientific method explicitly: let the user record a hypothesis, mark which nodes support and which contradict it, and record alternate hypotheses that were considered and rejected. `conflicts_cluster` on the node table exists for this. PMS 412 says indicators that conflict with the majority should be interpreted within the overall pattern, not silently discarded, so the app must never silently discard them either.
- Undo, and an audit trail for every correction.

**Small things that matter.**
- Standard NWCG flag colours are red (advancing), yellow (lateral), blue (backing). Roughly 8% of men have red-green colour vision deficiency. Encode spread type in **shape and colour**, not colour alone.
- State the datum on every screen and every export. Phone gives you WGS84/ITRF; agency GIS often wants NAD83(2011) UTM. The offset is now over a metre in CONUS and growing. Irrelevant at your error scale, but a GIS analyst who assumes wrong will not thank you.
- Metric and imperial toggle. US fire agencies use chains and acres. You will lose credibility fast if you cannot output them.

---

## 5. Stack and build order

**Stack.** The sensor layer *is* the product, and both platforms expose it differently and imperfectly. Cross-platform sensor abstractions (expo-sensors, Flutter's `sensors_plus`) do not reliably surface accuracy status, uncalibrated magnetometer bias, or the fused rotation vector. My recommendation is Flutter or React Native for the shell and **native platform channels for the sensor and geodesy layer** (Kotlin + Swift), with the WMM C library via FFI. If you want to move fastest and you only need one platform to start, native Android (Kotlin) is the easier of the two for sensor work.

Libraries: MapLibre GL Native (offline maps), GeographicLib (geodesy), NOAA `GeomagnetismLibrary.c` (WMM), SQLite via Room/GRDB/drift, GDAL only on the export/desktop side if you can avoid it on device.

**Build order.** Each stage must be usable on its own.

| Stage | Deliverable | Why |
|---|---|---|
| 1 | Node capture: GPS + fused azimuth + circular SD + photo + indicator type + full raw sensor log, offline, durable. Map shows nodes and rays. **No solution.** | This alone is a better field tool than a notebook and a Brunton, and it is the thing that has to be bulletproof. |
| 2 | Magnetic QC: WMM offline, declination, anomaly detection, stability gate, two-point GNSS bearing mode. | Turns node capture from "a number" into "a defensible number." |
| 3 | Grid posterior with von Mises likelihoods, HDR contours, entropy and mode count, geometry-quality warning. | The honest estimator. Ship this before you ship anything that says "origin." |
| 4 | Macro constraints as priors. GOA-then-SOA workflow. | Mirrors doctrine, and it is where most of the actual information lives. |
| 5 | Export: GeoPackage + KML + a signed PDF report with the methodology appendix. | The integration moat. |
| 6 | Slope-aware forward model (DEM + Rothermel `phi_s`). Wind later, if ever. | Optional. Only after 1 to 5 are solid. |

---

## 6. Sources

- Parker, K. and Babrauskas, V. (2024). *Validation of NWCG Wildfire Directional Indicators in Test Burns in Coastal California.* Fire 7(1), 5. DOI 10.3390/fire7010005. **Read this before you write another line of code.**
- Simeoni, A. et al. (2017). *A preliminary study of wildland fire pattern indicator reliability following an experimental fire.* J. Fire Sci. 35, 359 to 378.
- NWCG (2016). *Guide to Wildland Fire Origin and Cause Determination*, PMS 412. The 11 fire pattern indicator categories, GOA/SOA/ignition-area doctrine, scene safety.
- NWCG. *FI-210, Wildland Fire Origin and Cause Determination.* 38 hr course, the training vehicle for PMS 412.
- NFPA 921, *Guide for Fire and Explosion Investigations* (2024 ed.), the scientific method chapter and the wildfire chapter. NFPA 1033 for investigator qualifications.
- Karney, C.F.F. (2013). *Algorithms for geodesics.* J. Geodesy 87(1), 43 to 55. Plus *Geodesic intersections*, arXiv:2308.00495. Implementation: GeographicLib.
- NOAA NCEI / BGS. *World Magnetic Model 2025.* Epoch 2025.0, valid to 2029-12-31. Coefficients, C library, and the accuracy/limitations/error model page (crustal anomalies of 3 to 4 degrees are common, can exceed 10).
- Rothermel, R.C. (1972). *A mathematical model for predicting fire spread in wildland fuels.* USDA INT-115. Modern reference implementation: Andrews, P.L. (2018), RMRS-GTR-371.
- Richards, G.D. (1990). *An elliptical growth model of forest fire fronts and its numerical solution.* Int. J. Numer. Methods Eng. 30, 1163 to 1179. The Huygens wavelet engine behind FARSITE.
- Finney, M.A. (1998). *FARSITE: Fire Area Simulator*, RMRS-RP-4. Finney, M.A. (2002). *Fire growth using minimum travel time methods*, Can. J. For. Res. 32, 1420 to 1424.
- Alexander, M.E. (1985), Anderson, H.E. (1983): fire ellipse length-to-breadth ratios.
- Stansfield, R.G. (1947); Gavish, M. and Weiss, A.J. (1992), *IEEE Trans. AES* 28(3): bias in least-squares bearings-only localisation.
- Fisher, N.I. (1993). *Statistical Analysis of Circular Data.* Cambridge. Von Mises, circular mean, circular SD, the kappa inversion.
- USGS 3DEP / The National Map. EPQS v1 endpoint, DEM products, COG format.

