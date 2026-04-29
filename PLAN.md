# Plan: Astrological Data Layer + 2D Sky Chart + Exports

## Context

The app renders planets on the 3D globe using RA/Dec equatorial coordinates from `astronomy-engine`, but the sky rotation is driven by a **hardcoded fixed matrix** (`HORIZONTAL_TO_WORLD_ROTATION`) that does not account for the observer's latitude, longitude, or Local Sidereal Time (LST). This is why Jupiter appears in the wrong sign — the whole sky sphere is oriented incorrectly for any given observer/time.

Additionally:

- Default date is hardcoded (`2026-04-26`) instead of current datetime
- No astrological ecliptic longitudes (sign/degree) are computed or displayed
- No Sun or Moon rendered
- No 2D chart mode, no exports
- `chart2txt` (npm) and `simple-astro-api` (Netlify function) identified as integration targets

---

## Root Cause: Wrong Sky Rotation

`app.ts` applies a static hardcoded matrix to `skyGroup`. The correct approach:

1. Compute **Local Sidereal Time (LST)** from UTC datetime + observer longitude via `Astronomy.SiderealTime(date)`
2. Build the proper **equatorial → horizontal** rotation matrix from LST + latitude
3. Apply that matrix to `skyGroup`

---

## Phase 1 — Fix Default Date → Current Datetime

**File:** `src/scripts/config/defaults.ts`

```ts
const now = new Date();
export const DEFAULT_OBSERVER: SkyState = {
  ...
  date: now.toISOString().slice(0, 10),   // YYYY-MM-DD
  time: now.toTimeString().slice(0, 5),   // HH:MM
  ...
};
```

---

## Phase 2 — Fix Sky Rotation (LST-based)

**File:** `src/scripts/astronomy/calculations.ts` — add:

```ts
export function computeLST(utcDate: Date, longitudeDeg: number): number {
  const gst = Astronomy.SiderealTime(utcDate); // GST in hours
  return (((gst + longitudeDeg / 15) % 24) + 24) % 24;
}

export function buildSkyRotationMatrix(
  latDeg: number,
  lstHours: number,
): number[][] {
  const lst = (lstHours * 15 * Math.PI) / 180;
  const lat = (latDeg * Math.PI) / 180;
  const cosLat = Math.cos(lat),
    sinLat = Math.sin(lat);
  const cosLST = Math.cos(lst),
    sinLST = Math.sin(lst);
  return [
    [-sinLST, cosLST, 0],
    [-sinLat * cosLST, -sinLat * sinLST, cosLat],
    [cosLat * cosLST, cosLat * sinLST, sinLat],
  ];
}
```

**File:** `src/scripts/app.ts` — in `applySkyState()`, replace the hardcoded rotation block entirely:

```ts
const lst = computeLST(observationDate, state.longitude);
applyRotationMatrixToGroup(
  skyGroup,
  buildSkyRotationMatrix(state.latitude, lst),
);
```

Remove `HORIZONTAL_TO_WORLD_ROTATION` constant and the dead `horiz` matrix.

---

## Phase 3 — Astrological Ecliptic Longitude Layer

Needed to feed `chart2txt`, display sign/degree labels, detect retrograde, and draw the zodiac ring in the 2D chart.

**File:** `src/scripts/astronomy/calculations.ts` — add:

```ts
export function getEclipticLongitude(body: any, date: Date): number {
  if (body === Astronomy.Body.Sun) {
    return ((Astronomy.SunPosition(date).elon % 360) + 360) % 360;
  }
  return (
    ((Astronomy.Ecliptic(Astronomy.GeoVector(body, date, false)).elon % 360) +
      360) %
    360
  );
}

export function isRetrograde(body: any, date: Date): boolean {
  const STEP = 0.5 * 86400000;
  const lon1 = getEclipticLongitude(body, new Date(date.getTime() - STEP));
  const lon2 = getEclipticLongitude(body, new Date(date.getTime() + STEP));
  let delta = lon2 - lon1;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta < 0;
}
```

**File:** `src/scripts/types.ts` — extend `PlanetState`:

```ts
eclipticLongitude?: number;   // 0–360 tropical degrees
retrograde?: boolean;
signName?: string;             // e.g. "Cancer"
degreeInSign?: number;         // 0–29.99
```

**File:** `src/scripts/config/constants.ts` — add Sun and Moon to `PLANETS`:

```ts
{ name: 'Sun',  glyph: '☉', color: '#ffe08a', size: 7.5 },
{ name: 'Moon', glyph: '☽', color: '#d4d4d4', size: 6.5 },
```

**File:** `src/scripts/rendering/objects/planets.ts` — in `updatePlanetPositions`, after computing `position`:

```ts
const SIGN_NAMES = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
];
const lon = getEclipticLongitude(planet.body, observationDate);
planet.eclipticLongitude = lon;
planet.retrograde = isRetrograde(planet.body, observationDate);
planet.signName = SIGN_NAMES[Math.floor(lon / 30)];
planet.degreeInSign = lon % 30;
```

---

## Phase 4 — chart2txt Integration

Install: `npm install chart2txt`

**New file:** `src/scripts/astronomy/chart-report.ts`

```ts
import { generateReport } from "chart2txt";
import type { PlanetState } from "../types";

export function buildChartReport(planets: PlanetState[]): string {
  return generateReport({
    planets: planets
      .filter((p) => p.eclipticLongitude !== undefined)
      .map((p) => ({
        name: p.name,
        degree: p.eclipticLongitude!,
        speed: p.retrograde ? -1 : 1,
      })),
    timestamp: new Date().toISOString(),
  });
}
```

Output feeds both the JSON export and future natal chart / transit overlay features.

---

## Phase 5 — simple-astro-api

`simple-astro-api` is a **Netlify serverless function** backed by Swiss Ephemeris (sweph). It is not an npm package and cannot run client-side.

**Now:** Use `astronomy-engine` (already installed) — equivalent tropical ecliptic longitudes, runs client-side, no deployment needed.

**Future:** If Swiss Ephemeris precision is required (natal charts, historical dates), deploy `simple-astro-api` to Netlify and call `GET /api/positions`. Its response maps directly to `chart2txt`: `response.planets[i].longitude` → `degree`.

---

## Phase 6 — 2D Sky Chart Mode

**New file:** `src/scripts/rendering/sky-chart-2d.ts`

Stereographic azimuthal projection — zenith at center, horizon at edge (standard planisphere view).

Projection formula:

```
r = cos(alt) / (1 + sin(alt))
x = r * sin(az),  y = -r * cos(az)
```

**File:** `src/scripts/astronomy/calculations.ts` — add RA/Dec → Alt/Az:

```ts
export function raDecToAltAz(
  raDeg: number,
  decDeg: number,
  lstHours: number,
  latDeg: number,
) {
  const ha = (((lstHours * 15 - raDeg) % 360) + 360) % 360;
  const haR = (ha * Math.PI) / 180;
  const decR = (decDeg * Math.PI) / 180;
  const latR = (latDeg * Math.PI) / 180;
  const sinAlt =
    Math.sin(decR) * Math.sin(latR) +
    Math.cos(decR) * Math.cos(latR) * Math.cos(haR);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const cosAz =
    (Math.sin(decR) - Math.sin(alt) * Math.sin(latR)) /
    (Math.cos(alt) * Math.cos(latR));
  let az = Math.acos(Math.max(-1, Math.min(1, cosAz)));
  if (Math.sin(haR) > 0) az = 2 * Math.PI - az;
  return { altDeg: (alt * 180) / Math.PI, azDeg: (az * 180) / Math.PI };
}
```

The 2D canvas draws:

- Horizon circle + altitude rings at 30°, 60°
- N / E / S / W labels
- Brightest stars (mag < 4) converted to alt/az
- Zodiac constellation line segments
- Planets as glyphs + "♃ 3° Cancer ℞" labels

**UI:** `<canvas id="sky-chart-2d">` overlay in `index.astro`. Toggle button "2D Chart ↔ 3D Globe" shows/hides it. Three.js canvas stays rendered underneath — no teardown needed.

---

## Phase 7 — Export Features

**New file:** `src/scripts/ui/export.ts`

```ts
export function exportChartDataJSON(
  planets: PlanetState[],
  state: SkyState,
): void;
export function exportChartPNG(
  canvas: HTMLCanvasElement,
  state: SkyState,
): void;
```

Two buttons added to the control panel:

- **"Export Data (JSON)"** — planet positions, sign placements, retrograde flags, observer data
- **"Export Chart (PNG)"** — downloads 2D chart canvas as PNG (active when 2D mode is on)

---

## File Change Summary

| File                           | Change                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| `config/defaults.ts`           | Current datetime                                                                                   |
| `config/constants.ts`          | Add Sun, Moon to PLANETS                                                                           |
| `astronomy/calculations.ts`    | Add `computeLST`, `buildSkyRotationMatrix`, `getEclipticLongitude`, `isRetrograde`, `raDecToAltAz` |
| `astronomy/chart-report.ts`    | **New** — chart2txt wrapper                                                                        |
| `rendering/objects/planets.ts` | Compute ecliptic fields per update                                                                 |
| `rendering/sky-chart-2d.ts`    | **New** — 2D stereographic renderer                                                                |
| `ui/export.ts`                 | **New** — JSON + PNG download                                                                      |
| `types.ts`                     | Extend PlanetState with astrological fields                                                        |
| `app.ts`                       | Replace hardcoded rotation with LST-based; wire 2D toggle + export buttons                         |
| `pages/index.astro`            | 2D canvas, export buttons, toggle button                                                           |
| `styles/global.css`            | 2D canvas + export button styling                                                                  |

---

## Verification

1. Page load date/time matches current local time
2. Jupiter appears in correct sky region for today's date
3. Polaris sits at altitude ≈ observer's latitude (polar alignment check)
4. 2D chart toggle shows correct stereographic sky dome
5. Planet labels show glyph + sign + degree (e.g. "♃ 3° Cancer")
6. JSON export contains correct ecliptic longitudes
7. PNG export downloads 2D chart image

---

## Future: Natal Charts / Transits

Pipeline is designed for extension:

- Add birth date/time/place input → compute natal positions → pass natal + current transits to `chart2txt` as multi-chart
- Overlay transit aspects on 2D chart
- Use `simple-astro-api` for Swiss Ephemeris precision on historical natal dates
- Plot aspects as lines between planets on the 2D chart wheel
