# Phase 2a — Zodiac Constellation Notes

## Status

Implemented in the current repo, with a few visual deviations from the original plan. This file now records the approach and the main differences between plan and shipped code.

## Decisions that still hold

- **Data format**: d3-celestial GeoJSON `constellations.lines.json`
- **Star membership**: inferred by nearest-position matching against the processed star catalog, not by storing HIP ids
- **Line rendering**: `Line2` / `LineMaterial`
- **Labels**: `CSS2DRenderer`

## What shipped

- `tools/process-constellations.mjs` fetches d3-celestial line and label data and writes `public/zodiac.json`
- `package.json` keeps data refresh explicit and only checks for generated files in `prebuild`
- `tools/ensure-generated-data.mjs` enforces that `public/stars.json` and `public/zodiac.json` exist before build
- `src/pages/index.astro` provides a `#labels` overlay for `CSS2DRenderer`
- `src/scripts/globe.ts` loads `zodiac.json`, matches line vertices to nearby catalog stars, renders a separate zodiac star layer, and creates per-constellation hit meshes
- `src/styles/global.css` styles hover labels

## Current implementation notes

- Zodiac data is generated into `public/zodiac.json`, not committed under `data/`
- Build-time network fetching was removed from the normal `npm run build` path
- First-time setup uses `npm run setup-data`; later refreshes are explicit via `npm run stars` and `npm run constellations`
- The zodiac star shader uses a pale cream-gold tone rather than the original stronger gold target
- The current zodiac line material is white and low-opacity by default
- Label anchors come from d3-celestial `labelCoords`
- The regular star cloud still includes zodiac stars, and the zodiac layer renders on top

## Why the pipeline changed

- The generated star catalog and zodiac lines are static reference assets, not "live sky" data
- Re-fetching them on every build made builds network-dependent and broke offline / sandboxed compilation
- Future live behavior should come from runtime transforms using user date/location input
- Planets, Sun, Moon, and other moving bodies should use a separate runtime ephemeris path

## Future phase notes

### Zodiac sky domain division

Hover anywhere on the globe to highlight the zodiac region that contains that point.

- Data source: d3-celestial constellation boundary polygons
- Likely implementation: raycast inner sphere -> convert world hit point back to RA/Dec -> spherical point-in-polygon
- Important constraint: the camera sits inside the sphere, so the hover target needs an inward-facing surface

### Non-zodiac constellations

Same pipeline as the zodiac layer, but likely with quieter line treatment and smaller labels.

## Verification

- `npm run constellations` writes 12 zodiac entries with `name`, `labelCoords`, and `lines`
- `npm run build` passes offline as long as generated files already exist
- `npm run dev` renders zodiac stars, line segments, hover labels, and zoom-based star-density tuning
