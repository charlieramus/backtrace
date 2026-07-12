# SOURCES.md

Reference sources for the Origin Matrix wildland fire investigation app.
Companion to `origin-matrix-architecture-brief.md`.

**How to read the status column**

| Status | Meaning |
|---|---|
| ✅ | URL fetched and content confirmed during research |
| ⚠️ | Canonical citation, URL is the expected location but was not fetched. Verify before relying on it. |

Do not cite a ⚠️ link in any user-facing export until it has been resolved.

---

## 1. Primary domain: validation of fire pattern indicators

> These two papers are the empirical basis for the entire uncertainty model.
> Every `prior_sigma_deg` value in the `indicator_type` table traces back to the first one.

| ✅ | **Parker, K. and Babrauskas, V. (2024). Validation of NWCG Wildfire Directional Indicators in Test Burns in Coastal California.** *Fire* 7(1), 5. |
|---|---|
| DOI | https://doi.org/10.3390/fire7010005 |
| HTML | https://www.mdpi.com/2571-6255/7/1/5 |
| PDF | https://www.mdpi.com/2571-6255/7/1/5/pdf |
| License | CC BY 4.0. Quotable and redistributable with attribution. |
| Pull from it | Table 2 (error by spread type, mean 103 deg). Table 4 (cluster analysis, 109 deg). **Table 5 (mean error by indicator category)** which is the direct source for the per-indicator sigma priors. Section 1 lists the current 11 NWCG indicators with definitions. |

| ⚠️ | **Simeoni, A. et al. (2017). A preliminary study of wildland fire pattern indicator reliability following an experimental fire.** *J. Fire Sci.* 35(5), 359 to 378. |
|---|---|
| DOI | https://doi.org/10.1177/0734904117720674 |
| Pull from it | The counterweight view: FPIs are useful but only inside a global analysis. Note the study used a **line ignition**, not a point ignition, which limits its applicability. Parker and Babrauskas re-scored its 17 artifacts and got 5 of 13 determinate ones inside 45 degrees. |

| ✅ | **IAWF. Fire Pattern Indicators: Continued Research Will Refine Processes.** |
|---|---|
| URL | https://www.iawfonline.org/article/fire-pattern-indicators-continued-research-will-refine-processes/ |
| Pull from it | The institutional pushback and the history of the indicator set from Ford and Longacre in the 1960s through the 2016 PMS 412. Useful for the methodology appendix, and for showing you engaged with both sides. |

---

## 2. NWCG doctrine and standards

| ✅ | **NWCG PMS 412. Guide to Wildland Fire Origin and Cause Determination (2016).** |
|---|---|
| PDF | https://fs-prod-nwcg.s3.us-gov-west-1.amazonaws.com/s3fs-public/publication/pms412.pdf |
| Index | https://www.nwcg.gov/publications/412 ⚠️ |
| Pull from it | The 11 fire pattern indicator categories and their definitions (Ch 1A, 1B). GOA / SOA / ignition area doctrine. Transition zones. Advancing / lateral / backing definitions and the red / yellow / blue flag convention. **Scene safety requirements**, including the two-investigator rule and the statement that cell phones are not an adequate substitute for radio. |
| Note | NWCG content is public domain and may be reused if accurately credited. |

| ✅ | **NWCG FI-210 course page.** |
|---|---|
| URL | https://www.nwcg.gov/node/6116365 |
| Pre-course transcript (PDF) | https://training.nwcg.gov/pre-courses/FI210/fi_210_transcript.pdf |
| Instructor guide (PDF) | https://training.nwcg.gov/dl/fi210/fi-210-ig.pdf |
| Pull from it | Lesson 1A and 1B (indicator categories) map directly onto your `indicator_type` table. Use the lesson numbers to populate `pms412_section`. |

| ⚠️ | **NFPA 921, Guide for Fire and Explosion Investigations (2024 ed.).** |
|---|---|
| URL | https://www.nfpa.org/codes-and-standards/nfpa-921-standard-development/921 |
| Access | Free read-only access after registration. Not redistributable. |
| Pull from it | The scientific method chapter (hypothesis formation and testing). Sec 6.4.1 (intensity vs movement/directional patterns). Sec 18.1.2 (origin determination methods). The wildfire investigation chapter, aligned with NWCG since the 2011 revision. |

| ⚠️ | **NFPA 1033, Standard for Professional Qualifications for Fire Investigator.** |
|---|---|
| URL | https://www.nfpa.org/codes-and-standards/nfpa-1033-standard-development/1033 |
| Pull from it | Investigator qualification requirements. Relevant to the `investigator.qualification` field and to who is allowed to sign an export. |

---

## 3. Geodesy

| ⚠️ | **Karney, C.F.F. (2013). Algorithms for geodesics.** *J. Geodesy* 87(1), 43 to 55. |
|---|---|
| DOI | https://doi.org/10.1007/s00190-012-0578-z |
| Preprint | https://arxiv.org/abs/1109.4448 |
| Pull from it | The direct and inverse geodesic problems on WGS84. This is what you call for the two-point GNSS bearing capture mode. |

| ✅ | **Karney, C.F.F. Geodesic intersections.** arXiv:2308.00495. |
|---|---|
| Abstract | https://arxiv.org/abs/2308.00495 |
| PDF | https://arxiv.org/pdf/2308.00495 |
| Pull from it | The complete treatment of geodesic-to-geodesic intersection on an ellipsoid. **You almost certainly do not need this** (see the ENU section of the brief), but if a reviewer asks why you did not do great-circle intersection, this is the citation that shows you knew the option and rejected it on scale grounds. |

| ✅ | **Karney, C.F.F. (2011). Geodesics on an ellipsoid of revolution.** arXiv:1102.1215. |
|---|---|
| PDF | https://arxiv.org/pdf/1102.1215 |
| Pull from it | Sec 8: the ellipsoidal gnomonic projection intersection method. Geodesics map to nearly straight lines, so you guess an intersection, project, solve in the plane, then iterate to round-off. |

| ✅ | **GeographicLib (Karney). Reference implementation.** |
|---|---|
| Docs | https://geographiclib.sourceforge.io/ |
| Geodesics page | https://geographiclib.sourceforge.io/geod.html |
| Source | https://github.com/geographiclib/geographiclib ⚠️ |
| License | MIT |
| Pull from it | Ports in C, C++, Java, JavaScript, Python, and Swift. Also the `MagneticModel` class, which reads WMM coefficient files directly. This is one dependency that gives you both geodesy and geomagnetism. |

| ✅ | **Baselga, S. and Martinez-Llario, J.C. (2018). Intersection and point-to-line solutions for geodesics on the ellipsoid.** *Stud. Geophys. Geod.* |
|---|---|
| DOI | https://doi.org/10.1007/s11200-017-1020-z |
| Pull from it | Alternative iterative intersection algorithm, not distance-limited. Karney's 2308.00495 corrects and extends it. Optional reading. |

---

## 4. Geomagnetism (magnetic north to true north)

| ✅ | **NOAA NCEI / BGS. World Magnetic Model 2025.** |
|---|---|
| Main | https://www.ncei.noaa.gov/products/world-magnetic-model |
| **Accuracy, limitations and error model** | https://www.ncei.noaa.gov/products/world-magnetic-model/accuracy-limitations-error-model |
| Release note | https://www.ncei.noaa.gov/news/world-magnetic-model-2025-released |
| BGS mirror | http://www.geomag.bgs.ac.uk/research/modelling/WorldMagneticModel.html |
| Metadata / citation | https://www.ncei.noaa.gov/access/metadata/landing-page/bin/iso?id=gov.noaa.ngdc%3AWMM2025 |
| Key facts | Released 17 Dec 2024. Epoch 2025.0. Valid 2025.0 to 2030.0. **Expires 31 Dec 2029.** Degree-12 spherical harmonic core field plus linear secular variation. |
| **Critical caveat** | The WMM models the **core field only**. No crustal contribution. NCEI states that local declination anomalies of 3 to 4 degrees are not uncommon and **can exceed 10 degrees**. Put this in your methodology appendix before opposing counsel does. |
| Ship with the app | `WMM.COF` coefficients plus `GeomagnetismLibrary.c` (public domain reference implementation, distributed in the WMM package from the main link above). |

| ✅ | **NOAA NCEI. World Magnetic Model High Resolution (WMMHR2025).** |
|---|---|
| URL | https://www.ncei.noaa.gov/products/world-magnetic-model-high-resolution |
| Pull from it | Core field to degree 15, crustal field to degree 133 (from MF7). Coefficients identical to WMM2025 through degree 12 but with more significant digits. Use only if you decide you need crustal wavelengths. Larger file, and it still will not catch a magnetite boulder next to the investigator's boot. |

| ⚠️ | **NOAA NCEI. Enhanced Magnetic Model (EMM) and High Definition Geomagnetic Model (HDGM).** |
|---|---|
| URL | https://www.ncei.noaa.gov/products/enhanced-magnetic-model |
| Pull from it | Crustal fields down to 50 km wavelength. The next step up if WMM residuals turn out to be a real problem in your target geology. |

| ⚠️ | **NOAA NCEI. Magnetic field calculator.** |
|---|---|
| URL | https://www.ncei.noaa.gov/geomag/calculators/magcalc.shtml |
| Use for | Ground-truthing your WMM implementation, and for verifying Android's `GeomagneticField.getDeclination()` against a known point on your target API level. |

---

## 5. Platform sensor APIs

| ⚠️ | **Android SensorManager.** |
|---|---|
| SensorManager | https://developer.android.com/reference/android/hardware/SensorManager |
| Sensor types | https://developer.android.com/reference/android/hardware/Sensor |
| Rotation vector | https://developer.android.com/develop/sensors-and-location/sensors/sensors_position |
| GeomagneticField | https://developer.android.com/reference/android/hardware/GeomagneticField |
| Use | `TYPE_ROTATION_VECTOR` (fused, absolute). **Not** `TYPE_GAME_ROTATION_VECTOR` (no magnetometer, drifts). `TYPE_MAGNETIC_FIELD_UNCALIBRATED` for the hard-iron bias estimate. `getRotationMatrixFromVector` then `remapCoordinateSystem` then `getOrientation`. |
| Caution | `GeomagneticField` embeds a WMM whose epoch has historically lagged the current release depending on API level. Verify against the NCEI calculator above. |

| ⚠️ | **Apple Core Motion and Core Location.** |
|---|---|
| CMMotionManager | https://developer.apple.com/documentation/coremotion/cmmotionmanager |
| CMAttitudeReferenceFrame | https://developer.apple.com/documentation/coremotion/cmattitudereferenceframe |
| CLHeading | https://developer.apple.com/documentation/corelocation/clheading |
| Use | `.xTrueNorthZVertical` reference frame is **already true-north referenced** (requires CLLocationManager running). `CLHeading.headingAccuracy` and `CMDeviceMotion.magneticField.accuracy` are your QC signals. Log both verbatim. |

---

## 6. Statistics and estimation

| ⚠️ | **Fisher, N.I. (1993). Statistical Analysis of Circular Data.** Cambridge University Press. |
|---|---|
| Pull from it | Von Mises distribution. Circular mean and circular standard deviation. The `R -> kappa` inversion approximations used in the estimator. This is the standard reference for the whole angular-statistics layer. |

| ⚠️ | **Stansfield, R.G. (1947). Statistical theory of DF fixing.** *J. IEE* 94(15), 762 to 770. |
|---|---|
| Pull from it | The original bearings-only fix estimator. Origin of the `1/(sigma^2 * r^2)` range weighting. |

| ⚠️ | **Gavish, M. and Weiss, A.J. (1992). Performance analysis of bearing-only target location algorithms.** *IEEE Trans. Aerosp. Electron. Syst.* 28(3), 817 to 828. |
|---|---|
| DOI | https://doi.org/10.1109/7.256302 |
| Pull from it | The formal proof that the naive least-squares "closest point to n lines" estimator is biased, and the ML alternative. This is the citation that justifies not shipping the obvious algorithm. |

---

## 7. Fire behaviour models (for the slope and wind forward model)

| ⚠️ | **Rothermel, R.C. (1972). A mathematical model for predicting fire spread in wildland fuels.** USDA Forest Service Research Paper INT-115. |
|---|---|
| URL | https://www.fs.usda.gov/rm/pubs_int/int_rp115.pdf |
| Pull from it | The wind factor `phi_w` and the slope factor `phi_s = 5.275 * beta^-0.3 * tan(slope)^2`. The basis of nearly every US fire behaviour system. |

| ⚠️ | **Andrews, P.L. (2018). The Rothermel surface fire spread model and associated developments: a comprehensive explanation.** RMRS-GTR-371. |
|---|---|
| URL | https://www.fs.usda.gov/research/treesearch/55928 |
| Pull from it | **Verify every Rothermel coefficient against this before shipping.** It is the modern authoritative restatement, and the 1972 paper has notational traps. |

| ⚠️ | **Andrews, P.L. (2012). Modeling wind adjustment factor and midflame wind speed for Rothermel's surface fire spread model.** RMRS-GTR-266. |
|---|---|
| URL | https://www.fs.usda.gov/research/treesearch/40632 |
| Pull from it | How to convert 10 m open wind (what RAWS gives you) to midflame wind (what Rothermel needs). WAF roughly 0.1 to 0.6 depending on fuel and canopy. |

| ⚠️ | **Richards, G.D. (1990). An elliptical growth model of forest fire fronts and its numerical solution.** *Int. J. Numer. Methods Eng.* 30, 1163 to 1179. |
|---|---|
| DOI | https://doi.org/10.1002/nme.1620300606 |
| Pull from it | The Huygens elliptical wavelet propagation engine behind FARSITE. **Key geometric fact: the ignition point sits at the rear focus of the fire ellipse, not the centre.** |

| ⚠️ | **Finney, M.A. (1998). FARSITE: Fire Area Simulator, model development and evaluation.** RMRS-RP-4. |
|---|---|
| URL | https://www.fs.usda.gov/research/treesearch/4617 |

| ⚠️ | **Finney, M.A. (2002). Fire growth using minimum travel time methods.** *Can. J. For. Res.* 32(8), 1420 to 1424. |
|---|---|
| DOI | https://doi.org/10.1139/x02-068 |
| Pull from it | The MTT algorithm. This is the correct way to "bend" the back-projection: solve an arrival-time field from each candidate origin and compare `grad T` at each node against the observed indicator azimuth. |

| ⚠️ | **Alexander, M.E. (1985). Estimating the length-to-breadth ratio of elliptical forest fire patterns.** Proc. 8th Conf. Fire and Forest Meteorology. |
|---|---|
| Formula | `LB = 1 + 8.729 * (1 - exp(-0.030 * U))^2.155`, U = 10 m open wind in km/h. **Verify against Andrews 2018 before shipping.** |

| ⚠️ | **Anderson, H.E. (1983). Predicting wind-driven wildland fire size and shape.** INT-RP-305. |
|---|---|
| URL | https://www.fs.usda.gov/rm/pubs_int/int_rp305.pdf |
| Pull from it | Fuel-type-specific length-to-breadth alternatives to Alexander. |

| ⚠️ | **Finney, M.A. et al. (2021). Wildland Fire Behaviour: Dynamics, Principles and Processes.** CSIRO Publishing. |
|---|---|
| Pull from it | Cited by PMS 412 as the depth reference. Contains the caveat that the body of wildfire science "cannot yet be claimed to constitute a coherent physical theory" of fire spread. That sentence belongs in your methodology appendix. |

---

## 8. Elevation and terrain (USGS)

| ✅ | **USGS Elevation Point Query Service (EPQS) v1.** |
|---|---|
| Docs | https://epqs.nationalmap.gov/v1/docs |
| Endpoint | `https://epqs.nationalmap.gov/v1/json?x={lon}&y={lat}&wkid=4326&units=Meters` |
| Web UI | https://apps.nationalmap.gov/epqs/ |
| Accuracy | https://www.usgs.gov/faqs/how-accurate-are-elevations-generated-elevation-point-query-service-national-map (overall RMSE 0.53 m) |
| Caution | **Online only.** Fine for trip prep and desk work, useless in the backcountry. Do not architect around it. |

| ✅ | **USGS 3DEP / The National Map data delivery.** |
|---|---|
| GIS data download | https://www.usgs.gov/the-national-map-data-delivery/gis-data-download |
| Downloader | https://apps.nationalmap.gov/downloader/ ⚠️ |
| LidarExplorer | https://apps.nationalmap.gov/lidar-explorer/ ⚠️ |
| Dataset FAQ | https://www.usgs.gov/faqs/what-types-elevation-datasets-are-available-what-formats-do-they-come-and-where-can-i-download |
| Use | Pre-stage a DEM clip for the incident AOI **before departure**. 1 m lidar-derived DEM where available, otherwise 1/3 arc-second (roughly 10 m). Cloud Optimized GeoTIFF since 2020, so you can range-request a window instead of pulling a whole tile. |

| ⚠️ | **Horn, B.K.P. (1981). Hill shading and the reflectance map.** *Proc. IEEE* 69(1), 14 to 47. |
|---|---|
| Pull from it | The 3x3 slope and aspect kernel. This is the algorithm GDAL and ArcGIS both use. About ten lines of code. |

| ⚠️ | **GDAL gdaldem.** https://gdal.org/en/stable/programs/gdaldem.html |
|---|---|
| Use | Reference implementation of Horn slope and aspect. Use for desk-side validation of your on-device version. |

---

## 9. Data formats and offline mapping

| ⚠️ | **OGC GeoPackage.** https://www.geopackage.org/ |
|---|---|
| Spec | https://www.ogc.org/standards/geopackage |
| Why | It **is** a SQLite database. Opens natively in ArcGIS Pro and QGIS. This is your export format and your integration moat. |

| ⚠️ | **SpatiaLite.** https://www.gaia-gis.it/fossil/libspatialite/index |
|---|---|
| Verdict | **Recommended against** for the on-device working store. See the brief. Bundling `mod_spatialite` plus GEOS plus PROJ is tens of megabytes of native binary to get spatial predicates you do not need for a few hundred nodes. |

| ⚠️ | **MapLibre GL Native.** https://github.com/maplibre/maplibre-native |
|---|---|
| Use | Offline vector basemaps. |

| ⚠️ | **PMTiles.** https://github.com/protomaps/PMTiles |
|---|---|
| Use | Single-file offline tile archive with HTTP range-request support. Simpler than MBTiles for staging a basemap per incident. |

---

## 10. Weather data (for the wind layer, v3 at the earliest)

| ⚠️ | **RAWS / WRCC.** https://raws.dri.edu/ |
| ⚠️ | **NWS API.** https://www.weather.gov/documentation/services-web-api |
| ⚠️ | **Synoptic Data (MesoWest).** https://synopticdata.com/ |
| Note | You need wind at each node **at the time of fire passage**, which requires arrival time, which requires the origin. That circularity is real. See Section 4.4 of the brief. Do not attempt this in v1. |

---

## Machine-readable index

```json
{
  "critical_read_first": [
    "https://doi.org/10.3390/fire7010005",
    "https://fs-prod-nwcg.s3.us-gov-west-1.amazonaws.com/s3fs-public/publication/pms412.pdf"
  ],
  "must_bundle_offline": [
    "https://www.ncei.noaa.gov/products/world-magnetic-model",
    "https://geographiclib.sourceforge.io/"
  ],
  "verify_coefficients_against": [
    "https://www.fs.usda.gov/research/treesearch/55928",
    "https://www.ncei.noaa.gov/geomag/calculators/magcalc.shtml"
  ],
  "recommended_against": [
    "https://www.gaia-gis.it/fossil/libspatialite/index"
  ]
}
```