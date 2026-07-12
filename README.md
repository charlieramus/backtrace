# Wildland Fire Origin Tracer

A phone web app (installable PWA) that helps reason about where a wildland fire started.
You walk the burn area with a map, flag physical fire signs, and record the direction
each sign indicates. The app combines those directions into an **honest probability field**
for the origin — a heatmap with credible regions, not a single false-precision dot.

It documents evidence and shows how much (or how little) the signs actually pin down the
origin. It stays deliberately broad when the indicators disagree, and it never prints a
bare coordinate. That honesty is the point: peer-reviewed testing found fire-pattern
indicators carry roughly **103° of mean directional error** (Parker & Babrauskas, 2024),
so a tool that shrinks to a confident dot would be lying.

Runs offline, needs no account, and saves/loads investigations as plain files — so anyone
can actually use it. Built as a learning project. See [NOW.md](NOW.md) for current status.

## Why I'm building this

I'm **Charlie Ramus** — I live in Colorado and cover wildfires as a field
contributor, shooting photos and video of active fires and sending them to news
stations (I was cited in a [Boulder Reporting Lab](https://boulderreportinglab.org/)
article). Fire origin isn't an abstract problem where I live.

The spark for this project was Howtown's video
[*How to Catch an Arsonist*](https://www.youtube.com/watch?v=pTDKkOy2KcA)
([@Howtown](https://www.youtube.com/@Howtown)), on the 2025 Palisades Fire and the
federal arson case against Jonathan Rinderknecht. The video walks through how the ATF
tried to trace the fire's origin using burn-pattern indicators, and how much
scientific scrutiny those traditional methods drew — the case struggled with a lack
of direct evidence and the contested "negative corpus" concept, ending in a
deadlocked jury and a June 2026 mistrial. It's a sharp illustration of how hard it is
to prove where a fire started once the evidence has burned, and why validated,
transparent methods matter. This app is my attempt to reason about that geometry in a
concrete, hands-on way.

## How it works

1. **Flag an object.** Pick a fire sign in the field (a charred tree, spalled rock, bent
   grass, etc.) and tag its indicator type. Each type carries a known angular uncertainty.
2. **Aim.** Record the direction the sign points (in the field: GPS + compass; on the
   desk: place a point and set a bearing by hand).
3. **Weigh the evidence.** Each sign becomes a direction with an uncertainty, modeled as a
   von Mises likelihood over a grid — not a hard line.
4. **Read the honest picture.** The combined posterior shows credible regions (50/68/95%)
   and a search-area size. When signs disagree it stays broad; when the data supports two
   origins it shows two regions. The output is a *candidate area*, never "the point."

## Key pieces

- **Map** with flaggable custom markers (spread type encoded by shape *and* color).
- **Compass + GPS** to capture each indicator's bearing and location (corrected to true
  north) — field mode; the desk build uses manual points.
- **Indicator types** for the different burn signs, each with a validated angular
  uncertainty from the research literature.
- **Honest origin posterior** — a von Mises probability field with credible regions, an
  area readout, and warnings for flat or multi-modal results.

## Tech

A web app (PWA), so there's no app store and it runs on any phone by opening a URL:

- **Map:** Leaflet + OpenStreetMap (free, no API key).
- **Geometry:** local ENU tangent-plane (all math in meters; lat/lon only at the edges).
- **Estimator:** von Mises grid posterior with per-indicator uncertainty priors and
  honest credible regions (`CRESEARCH.md` §1).
- **Sensors (field mode, v1):** browser `Geolocation` + `DeviceOrientation`, with WMM2025
  magnetic declination and an anomaly check.
- **Offline + storage:** installable PWA with an offline app shell; investigations save
  and load as **JSON files** — no account, no server. (GeoPackage/KML export later.)
- **Hosting:** any static HTTPS host (HTTPS is required for phone sensor access).

Built **desk-first**: the map, ENU geometry, and posterior run on manually placed points
so the whole thing is developable and demoable on a laptop, before live sensors are added.

## Documentation

- [NOW.md](NOW.md) — current status: what's built, what's next.
- [UPDATELOGV1.md](UPDATELOGV1.md) — the staged build plan for the v0 desk engine.
- [CRESEARCH.md](CRESEARCH.md) — the architecture & geodesy brief: why the honest posterior
  (not a shrinking polygon), the ENU + von Mises math, sensor fusion, the offline schema.
- [SOURCES.MD](SOURCES.MD) — annotated reference list (validation studies, NWCG doctrine,
  geodesy, geomagnetism, sensor APIs).
