# astro-personal

Interactive celestial globe built with Astro and Three.js.

## What it does

- Renders a star field from the HYG v3.8 catalog
- Draws a latitude/longitude graticule and highlighted equator
- Overlays the 12 zodiac constellations as separate stars and line segments
- Supports hover labels and zoom-dependent star density / bloom tuning

## Stack

- Astro 5
- Three.js r175
- TypeScript strict mode

## Project layout

```text
src/
  pages/index.astro          # HTML shell
  scripts/globe.ts           # Three.js scene, shaders, hover logic
  styles/global.css          # Full-screen layout and label styles
tools/
  process-stars.mjs          # Fetch HYG catalog -> public/stars.json
  process-constellations.mjs # Fetch zodiac line data -> public/zodiac.json
public/
  stars.json                 # Generated, gitignored
  zodiac.json                # Generated, gitignored
```

## Commands

```bash
npm run dev
npm run build
npm run preview
npm run setup-data
npm run stars
npm run constellations
```

## Setup

First-time setup:

```bash
npm install
npm run setup-data
npm run dev
```

Regular workflow after the generated files exist:

```bash
npm run dev
npm run build
```

Refresh commands:

```bash
npm run stars
npm run constellations
```

## Data pipeline

- `public/stars.json` and `public/zodiac.json` are generated asset files, not live runtime data
- `npm run setup-data` fetches and generates both files for first-time setup
- `npm run build` does not fetch remote data; it only checks that those generated files already exist
- `npm run stars` and `npm run constellations` are explicit refresh commands when the source datasets need to be regenerated

This split is intentional. The star catalog and zodiac line data are static reference inputs for the renderer. Future "live sky" behavior should come from runtime calculations using user date/location input, plus runtime ephemeris data for moving bodies such as the Sun, Moon, and planets.

## Build note

`npm run build` now expects `public/stars.json` and `public/zodiac.json` to already exist. Use `npm run setup-data` for first-time setup, or `npm run stars` / `npm run constellations` to refresh datasets explicitly.
