# Celestial Globe — Architecture Refactor: Unified CelestialSnapshot

## Context

The current architecture correctly computes planet positions and renders them, but has no canonical intermediate representation. Positional truth is scattered:

- `PlanetState.sprite.position` is the only place a planet's 3D coords exist (they belong to the render object)
- `updatePlanetPositions` calls the ephemeris, converts coordinates, and mutates sprites in one pass
- `currentSkyState` is a single mutable variable — no path to multi-state (natal + transit)
- `app.ts` has duplicate implementations of functions already in `calculations.ts`

This prevents implementing aspects, natal charts, and multi-view consistency without recomputation drift.

**Goal**: Introduce an immutable `CelestialSnapshot` computed entirely in the astronomy layer. All rendering becomes projections of that snapshot. Aspects and relational logic operate on snapshot data, not sprites. Multiple simultaneous snapshots (natal, transit) are first-class.

The POTENTIAL_PLAN.md in the project root is a good structural reference but has three issues corrected below.

---

## Corrections to POTENTIAL_PLAN.md

1. **Don't re-implement ecliptic math with a fixed obliquity constant.** Use `astronomy-engine`'s `Astronomy.Ecliptic()` directly — it handles precession. The manual `rotateX(vec, -23.43929°)` will drift against the existing display and against Stellarium.

2. **Aspects must use ecliptic longitude difference, not 3D dot product.** `angleBetween(position_a, position_b)` is not astrological aspect calculation. A conjunction is 0° ecliptic longitude separation. Use `(lonA - lonB + 360) % 360` with wrap-around normalization to `[0, 180]`.

3. **Observer context belongs in the snapshot.** Natal and transit can have different birth locations. `lst` and `rotationMatrix` are observer + time dependent. Include them in the snapshot, not as globals.

---

## New Types — `src/scripts/types.ts`

Add alongside existing types. Do not remove existing types yet (that's done in Phase 4).

```ts
// Canonical per-body data — computed once per timestamp, no Three.js
interface BodySnapshot {
  name: string; // matches PLANETS[i].name ("Sun", "Moon", etc.)
  body: Astronomy.Body; // astronomy-engine enum, kept for cross-referencing

  // Equatorial (from ephemeris, authoritative)
  raDeg: number; // Right Ascension in degrees (0–360)
  decDeg: number; // Declination in degrees (−90 to +90)

  // Ecliptic (derived via astronomy-engine, not manual rotation)
  eclipticLon: number; // Tropical longitude 0–360°
  eclipticLat: number; // Ecliptic latitude −90 to +90°

  // Astrological derived
  signName: string;
  degreeInSign: number;
  retrograde: boolean;

  // Apparent magnitude (for size scaling in renderer)
  magnitude: number;
}

// Full observer-aware snapshot — immutable after construction
interface CelestialSnapshot {
  // Observer input (preserved for multi-state, e.g. natal birth location)
  utcDate: Date;
  latitude: number;
  longitude: number;
  elevation: number;

  // Pre-computed observer transforms
  lst: number; // Local Sidereal Time in hours
  rotationMatrix: number[][]; // 3×3 equatorial→horizontal, apply to skyGroup

  // Bodies — keyed by planet name for O(1) lookup
  bodies: Map<string, BodySnapshot>;
}

// Aspects
type AspectType = "conjunction" | "sextile" | "square" | "trine" | "opposition";

interface Aspect {
  bodyA: string;
  bodyB: string;
  type: AspectType;
  angle: number; // Actual ecliptic longitude separation (degrees)
  orb: number; // Deviation from exact aspect (degrees)
}
```

---

## Phase 1 — `computeCelestialSnapshot()` in `calculations.ts`

**File**: `src/scripts/astronomy/calculations.ts`

Add one exported function. This is the single point of truth — it replaces all scattered computation currently in `updatePlanetPositions` and `applySkyState`.

```ts
export function computeCelestialSnapshot(state: SkyState): CelestialSnapshot {
  const utcDate = makeObservationDate(state.date, state.time, state.timeZone);
  const observer = new Astronomy.Observer(
    state.latitude,
    state.longitude,
    state.elevation,
  );
  const lst = computeLST(utcDate, state.longitude);
  const rotationMatrix = buildSkyRotationMatrix(state.latitude, lst);

  const bodies = new Map<string, BodySnapshot>();

  for (const planetDef of PLANETS) {
    const body = (Astronomy.Body as any)[planetDef.name] as Astronomy.Body;

    // Equatorial coordinates
    const eq = Astronomy.Equator(body, utcDate, observer, false, true);
    const raDeg = eq.ra * 15; // hours → degrees
    const decDeg = eq.dec;

    // Ecliptic — use astronomy-engine, not manual obliquity rotation
    let eclipticLon: number;
    let eclipticLat: number;
    if (body === Astronomy.Body.Sun) {
      const sunPos = Astronomy.SunPosition(utcDate);
      eclipticLon = ((sunPos.elon % 360) + 360) % 360;
      eclipticLat = sunPos.elat;
    } else {
      const eclVec = Astronomy.Ecliptic(
        Astronomy.GeoVector(body, utcDate, false),
      );
      eclipticLon = ((eclVec.elon % 360) + 360) % 360;
      eclipticLat = eclVec.elat;
    }

    // Retrograde (existing function, unchanged)
    const retrograde = isRetrograde(body, utcDate);

    // Zodiac sign (existing function, unchanged)
    const { signName, degreeInSign } = getZodiacSignInfo(eclipticLon);

    // Apparent magnitude
    const magnitude = Astronomy.Illumination(body, utcDate).mag;

    bodies.set(planetDef.name, {
      name: planetDef.name,
      body,
      raDeg,
      decDeg,
      eclipticLon,
      eclipticLat,
      signName,
      degreeInSign,
      retrograde,
      magnitude,
    });
  }

  return {
    utcDate,
    latitude: state.latitude,
    longitude: state.longitude,
    elevation: state.elevation,
    lst,
    rotationMatrix,
    bodies,
  };
}
```

**Import needed at top of `calculations.ts`:**

```ts
import { PLANETS } from "../config/constants";
import type { SkyState, CelestialSnapshot, BodySnapshot } from "../types";
```

---

## Phase 2 — Refactor `planets.ts` to consume snapshot

**File**: `src/scripts/rendering/objects/planets.ts`

Change `updatePlanetPositions` signature. No ephemeris calls, no coordinate computation — read from snapshot.

```ts
// BEFORE signature:
export function updatePlanetPositions(
  planets: PlanetState[],
  state: SkyState,
  observationDate: Date,
  observer: Astronomy.Observer,
): void;

// AFTER signature:
export function updatePlanetPositions(
  planets: PlanetState[],
  snapshot: CelestialSnapshot,
): void;
```

**New body:**

```ts
export function updatePlanetPositions(
  planets: PlanetState[],
  snapshot: CelestialSnapshot,
): void {
  for (const planet of planets) {
    const body = snapshot.bodies.get(planet.name);
    if (!body) continue;

    // Projection: RA/Dec → 3D XYZ. This is a rendering concern, not astronomy.
    const position = raDegDecDegToXYZ(
      body.raDeg,
      body.decDeg,
      SPHERE.radius - 1,
    );
    const scale = THREE.MathUtils.clamp(
      planet.baseSize + (2.5 - body.magnitude) * 0.35,
      5.5,
      15,
    );

    planet.sprite.position.copy(position);
    planet.currentScale = scale;
    planet.sprite.scale.setScalar(scale);
    planet.sprite.visible = true;
    planet.eclipticLongitude = body.eclipticLon;
    planet.retrograde = body.retrograde;
    planet.signName = body.signName;
    planet.degreeInSign = body.degreeInSign;
  }
}
```

Remove imports: `Astronomy`, `getEclipticLongitude`, `isRetrograde`, `getZodiacSignInfo`.
Keep imports: `raDegDecDegToXYZ`, `THREE`, `SPHERE`.

---

## Phase 3 — Refactor `app.ts`

**File**: `src/scripts/app.ts`

### 3a — Remove duplicate functions

Lines 77–111 in `app.ts` duplicate functions already in `calculations.ts`:

- `parseGmtOffset`
- `formatOffsetMinutes`
- `getTimeZoneOffsetMinutes`
- `makeObservationDate`

Delete them. Add to the import from `calculations.ts`:

```ts
import {
  computeCelestialSnapshot, // ADD
  computeLST,
  buildSkyRotationMatrix,
  applyRotationMatrixToGroup,
  // parseGmtOffset, formatOffsetMinutes, etc — import these too, remove local copies
} from "./astronomy/calculations";
```

### 3b — Replace `currentSkyState` with `currentSnapshot`

```ts
// BEFORE
let currentSkyState: SkyState = DEFAULT_SKY_STATE;

// AFTER
let currentSkyState: SkyState = DEFAULT_SKY_STATE; // keep for UI binding
let currentSnapshot: CelestialSnapshot; // add: derived state
```

`currentSkyState` continues to hold user-input form values (it's the UI binding). `currentSnapshot` is derived from it and drives rendering. This keeps the form state separate from computed astronomical state.

### 3c — Replace `applySkyState` body

```ts
function applySkyState(state: SkyState): void {
  currentSkyState = state;

  // Compute once — all downstream reads from snapshot
  currentSnapshot = computeCelestialSnapshot(state);

  // Apply observer rotation to sky group
  applyRotationMatrixToGroup(skyGroup, currentSnapshot.rotationMatrix);

  // Update planet rendering from snapshot (no ephemeris calls here)
  updatePlanetPositions(planets, currentSnapshot);

  // Update UI display fields
  updateSkyControls(state, currentSnapshot);
}
```

Remove the inline `makeObservationDate`, `Astronomy.Observer`, `computeLST`, `buildSkyRotationMatrix` calls from `applySkyState` — they are now inside `computeCelestialSnapshot`.

### 3d — Multi-state (natal + transit)

Add alongside `currentSnapshot`:

```ts
let natalSnapshot: CelestialSnapshot | null = null;
```

When the user eventually adds birth data input:

```ts
natalSnapshot = computeCelestialSnapshot(natalSkyState);
```

Both snapshots are immutable once computed. Aspects and 2D chart rendering receive one or both as parameters.

---

## Phase 4 — New file: `src/scripts/astronomy/aspects.ts`

Aspects operate entirely on ecliptic longitude — not 3D vectors. This is standard Western astrology convention.

```ts
import type { CelestialSnapshot, Aspect, AspectType } from "../types";

const ASPECT_DEFS: { type: AspectType; angle: number; orb: number }[] = [
  { type: "conjunction", angle: 0, orb: 8 },
  { type: "sextile", angle: 60, orb: 4 },
  { type: "square", angle: 90, orb: 6 },
  { type: "trine", angle: 120, orb: 6 },
  { type: "opposition", angle: 180, orb: 8 },
];

function eclipticSeparation(lonA: number, lonB: number): number {
  const diff = Math.abs(lonA - lonB) % 360;
  return diff > 180 ? 360 - diff : diff; // normalize to [0, 180]
}

// Aspects within a single snapshot (current sky self-aspects)
export function computeAspects(snapshot: CelestialSnapshot): Aspect[] {
  const result: Aspect[] = [];
  const bodies = Array.from(snapshot.bodies.values());

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const sep = eclipticSeparation(
        bodies[i].eclipticLon,
        bodies[j].eclipticLon,
      );
      for (const def of ASPECT_DEFS) {
        const orb = Math.abs(sep - def.angle);
        if (orb <= def.orb) {
          result.push({
            bodyA: bodies[i].name,
            bodyB: bodies[j].name,
            type: def.type,
            angle: sep,
            orb,
          });
        }
      }
    }
  }
  return result;
}

// Cross-state aspects: natal bodies vs transit bodies
export function computeTransitAspects(
  natal: CelestialSnapshot,
  transit: CelestialSnapshot,
): Aspect[] {
  const result: Aspect[] = [];
  for (const natalBody of natal.bodies.values()) {
    for (const transitBody of transit.bodies.values()) {
      const sep = eclipticSeparation(
        natalBody.eclipticLon,
        transitBody.eclipticLon,
      );
      for (const def of ASPECT_DEFS) {
        const orb = Math.abs(sep - def.angle);
        if (orb <= def.orb) {
          result.push({
            bodyA: natalBody.name,
            bodyB: transitBody.name,
            type: def.type,
            angle: sep,
            orb,
          });
        }
      }
    }
  }
  return result;
}
```

---

## Phase 5 — New file: `src/scripts/rendering/sky-chart-2d.ts`

The 2D planisphere is a pure function of `CelestialSnapshot`. It projects RA/Dec → Alt/Az using LST + latitude from the snapshot, then applies stereographic projection.

```ts
import type { CelestialSnapshot } from "../../types";
import { raDecToAltAz } from "../../astronomy/calculations"; // add this function (below)

export function renderChart(
  canvas: HTMLCanvasElement,
  snapshot: CelestialSnapshot,
  starData?: { raDeg: number; decDeg: number; mag: number }[], // optional bright stars
): void {
  const ctx = canvas.getContext("2d")!;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const R = Math.min(cx, cy) * 0.9; // horizon radius in pixels

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw horizon circle
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = "#2a5a6a";
  ctx.stroke();

  // Draw altitude rings (30°, 60°)
  for (const altDeg of [30, 60]) {
    const r =
      (R * Math.cos((altDeg * Math.PI) / 180)) /
      (1 + Math.sin((altDeg * Math.PI) / 180));
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.stroke();
  }

  // Draw planets
  for (const body of snapshot.bodies.values()) {
    const { altDeg, azDeg } = raDecToAltAz(
      body.raDeg,
      body.decDeg,
      snapshot.lst,
      snapshot.latitude,
    );
    if (altDeg < 0) continue; // below horizon

    const r =
      (R * Math.cos((altDeg * Math.PI) / 180)) /
      (1 + Math.sin((altDeg * Math.PI) / 180));
    const az = (azDeg * Math.PI) / 180;
    const x = cx + r * Math.sin(az);
    const y = cy - r * Math.cos(az); // canvas Y-axis inverted

    ctx.fillStyle = "#ffffff";
    ctx.font = "14px serif";
    ctx.fillText(body.signName[0], x, y); // placeholder glyph
  }
}
```

**Add to `calculations.ts`:**

```ts
export function raDecToAltAz(
  raDeg: number,
  decDeg: number,
  lstHours: number,
  latDeg: number,
): { altDeg: number; azDeg: number } {
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

---

## File Change Summary

| File                                       | Change                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| `src/scripts/types.ts`                     | Add `BodySnapshot`, `CelestialSnapshot`, `Aspect`, `AspectType`                       |
| `src/scripts/astronomy/calculations.ts`    | Add `computeCelestialSnapshot()`, `raDecToAltAz()`                                    |
| `src/scripts/rendering/objects/planets.ts` | Change `updatePlanetPositions` to consume `CelestialSnapshot`, remove ephemeris calls |
| `src/scripts/app.ts`                       | Add `currentSnapshot`, simplify `applySkyState`, remove duplicate functions           |
| `src/scripts/astronomy/aspects.ts`         | **New** — `computeAspects()`, `computeTransitAspects()`                               |
| `src/scripts/rendering/sky-chart-2d.ts`    | **New** — `renderChart()` as pure projection of `CelestialSnapshot`                   |

---

## Execution Order

1. **types.ts** — Add new interfaces. Nothing breaks; old types still exist.
2. **calculations.ts** — Add `computeCelestialSnapshot()` and `raDecToAltAz()`. No callers yet.
3. **planets.ts** — Swap `updatePlanetPositions` signature. Update `app.ts` call site simultaneously.
4. **app.ts** — Wire `computeCelestialSnapshot`, remove duplicate functions, add `currentSnapshot`.
5. **aspects.ts** — Create. Wire into `app.ts` when 2D chart is ready.
6. **sky-chart-2d.ts** — Create. Wire toggle + canvas in `index.astro`.

**Run `npm run build` after each phase to catch type errors.**

---

## Verification

After each phase:

- **Phase 2**: Planet positions on globe unchanged. Verify Jupiter and Saturn appear in same sky region as before.
- **Phase 3**: `applySkyState` produces same visual output. Browser console: `currentSnapshot.bodies.get('Jupiter').signName` returns expected sign.
- **Phase 4**: `computeAspects(currentSnapshot)` returns valid aspect list. Verify manually against astro.com for today's date.
- **Phase 5**: 2D chart renders with planets above horizon. Toggle button shows/hides canvas.
- **End-to-end**: Open Stellarium, set same location/date. Verify planet alt/az within ±1°. Verify zodiac signs match tropical chart (astro.com).

---

## Invariants (Enforce Throughout)

1. No ephemeris call (`Astronomy.*`) outside `astronomy/` directory
2. No `THREE.*` import inside `astronomy/` directory
3. `CelestialSnapshot` is constructed exactly once per user action, never mutated
4. All aspect calculations use `eclipticLon`, never 3D position vectors
5. `rotationMatrix` is applied to the scene group, never to individual body positions

---

## Architectural Notes — Pragmatism vs Purity (Future Refactoring)

This plan is pragmatically sound for the current scope (transit overlays, aspects, 2D chart). However, two layering distinctions are worth flagging for future extensions (natal houses, sidereal mode, other coordinate systems).

### Note 1: BodySnapshot mixes raw measurements with derived interpretations

**Current design:**

```ts
BodySnapshot {
  raDeg, decDeg,              // raw astronomical measurement
  eclipticLon, eclipticLat,   // derived from above
  signName, degreeInSign,     // derived astrological interpretation
  retrograde,                 // derived astrological flag
  magnitude,                  // raw measurement
}
```

**The distinction:**

- **Raw measurements** (`raDeg`, `decDeg`, `magnitude`) are frame-independent, stable across coordinate systems
- **Derived semantics** (`signName`, `degreeInSign`, `retrograde`) are interpretations specific to tropical Western astrology

**Why this is acceptable now:**

- The app is committed to tropical Western astrology. There's no current plan to support sidereal or Vedic systems.
- Computing `signName` once per snapshot is efficient; there's no recomputation.
- The separation would add complexity without current benefit.

**If future work requires:** sidereal astrology, house systems, or Vedic calculations:

- Split into `AstronomicalBodySnapshot { raDeg, decDeg, eclipticLon, eclipticLat, magnitude }` (frame-independent)
- And `AstrologicalInterpretation { signName, degreeInSign, retrograde }` (system-dependent)
- Store both on the body, or keep them separate and join in the rendering layer

### Note 2: rotationMatrix on CelestialSnapshot conflates reference frame with observer perspective

**Current design:**

```ts
CelestialSnapshot {
  utcDate, latitude, longitude, elevation,  // observer context
  lst, rotationMatrix,                       // observer-dependent transforms
  bodies: Map<string, BodySnapshot>,         // sky state (frame-independent)
}
```

**The distinction:**

- **Sky state** (`bodies` with their RA/Dec, eclipticLon) is frame-independent — valid for any observer, any time
- **Observer projection** (`lst`, `rotationMatrix`) answers "how does this observer see the sky at this moment?"

**Why this is acceptable now:**

- The app has one observer context at a time (current sky). Multi-observer support doesn't exist.
- Storing the rotation matrix on the snapshot is convenient for passing to `applyRotationMatrixToGroup`.
- The `utcDate` and observer location (`lat`, `lon`, `elev`) are needed anyway.

**If future work requires:** birth charts with house systems, relocations, or alternate observer locations simultaneously:

- Split into:

  ```ts
  CelestialSnapshot {
    utcDate,
    bodies: Map<string, BodySnapshot>,  // frame-independent sky state
  }

  ObserverProjection {
    latitude, longitude, elevation,
    lst, rotationMatrix,                // observer-dependent view
  }
  ```

- Then pass both to renderers: `render3DGlobe(snapshot, projection)`
- House systems would live in `ObserverProjection` alongside the rotation matrix

**Why we're not doing this now:**

- It adds a layer of indirection without current payoff
- The observer is fixed for the entire session (user's location, or birth location if adding natal charts)
- Separating them would require threading two objects through all renderers and aspect functions

### Recommendation for agents implementing Phase 2+ features:

When adding:

- **Natal charts**: Observer projection becomes relevant — birth location vs current location. Consider whether to split at that point.
- **Houses or Vedic astrology**: You'll need the separation. Plan for it then.
- **Sidereal support**: You'll need to separate astronomical from astrological semantics. Add a flag or computed field to track which system is active.

For now: the pragmatic design is correct. The snapshot is a good intermediate representation. Recognize the layering distinction, but don't enforce it prematurely.

# Celestial Globe — Architecture Refactor: Unified CelestialSnapshot

## Context

The current architecture correctly computes planet positions and renders them, but has no canonical intermediate representation. Positional truth is scattered:

- `PlanetState.sprite.position` is the only place a planet's 3D coords exist (they belong to the render object)
- `updatePlanetPositions` calls the ephemeris, converts coordinates, and mutates sprites in one pass
- `currentSkyState` is a single mutable variable — no path to multi-state (natal + transit)
- `app.ts` has duplicate implementations of functions already in `calculations.ts`

This prevents implementing aspects, natal charts, and multi-view consistency without recomputation drift.

**Goal**: Introduce an immutable `CelestialSnapshot` computed entirely in the astronomy layer. All rendering becomes projections of that snapshot. Aspects and relational logic operate on snapshot data, not sprites. Multiple simultaneous snapshots (natal, transit) are first-class.

The POTENTIAL_PLAN.md in the project root is a good structural reference but has three issues corrected below.

---

## Corrections to POTENTIAL_PLAN.md

1. **Don't re-implement ecliptic math with a fixed obliquity constant.** Use `astronomy-engine`'s `Astronomy.Ecliptic()` directly — it handles precession. The manual `rotateX(vec, -23.43929°)` will drift against the existing display and against Stellarium.

2. **Aspects must use ecliptic longitude difference, not 3D dot product.** `angleBetween(position_a, position_b)` is not astrological aspect calculation. A conjunction is 0° ecliptic longitude separation. Use `(lonA - lonB + 360) % 360` with wrap-around normalization to `[0, 180]`.

3. **Observer context belongs in the snapshot.** Natal and transit can have different birth locations. `lst` and `rotationMatrix` are observer + time dependent. Include them in the snapshot, not as globals.

---

## New Types — `src/scripts/types.ts`

Add alongside existing types. Do not remove existing types yet (that's done in Phase 4).

```ts
// Canonical per-body data — computed once per timestamp, no Three.js
interface BodySnapshot {
  name: string; // matches PLANETS[i].name ("Sun", "Moon", etc.)
  body: Astronomy.Body; // astronomy-engine enum, kept for cross-referencing

  // Equatorial (from ephemeris, authoritative)
  raDeg: number; // Right Ascension in degrees (0–360)
  decDeg: number; // Declination in degrees (−90 to +90)

  // Ecliptic (derived via astronomy-engine, not manual rotation)
  eclipticLon: number; // Tropical longitude 0–360°
  eclipticLat: number; // Ecliptic latitude −90 to +90°

  // Astrological derived
  signName: string;
  degreeInSign: number;
  retrograde: boolean;

  // Apparent magnitude (for size scaling in renderer)
  magnitude: number;
}

// Full observer-aware snapshot — immutable after construction
interface CelestialSnapshot {
  // Observer input (preserved for multi-state, e.g. natal birth location)
  utcDate: Date;
  latitude: number;
  longitude: number;
  elevation: number;

  // Pre-computed observer transforms
  lst: number; // Local Sidereal Time in hours
  rotationMatrix: number[][]; // 3×3 equatorial→horizontal, apply to skyGroup

  // Bodies — keyed by planet name for O(1) lookup
  bodies: Map<string, BodySnapshot>;
}

// Aspects
type AspectType = "conjunction" | "sextile" | "square" | "trine" | "opposition";

interface Aspect {
  bodyA: string;
  bodyB: string;
  type: AspectType;
  angle: number; // Actual ecliptic longitude separation (degrees)
  orb: number; // Deviation from exact aspect (degrees)
}
```

---

## Phase 1 — `computeCelestialSnapshot()` in `calculations.ts`

**File**: `src/scripts/astronomy/calculations.ts`

Add one exported function. This is the single point of truth — it replaces all scattered computation currently in `updatePlanetPositions` and `applySkyState`.

```ts
export function computeCelestialSnapshot(state: SkyState): CelestialSnapshot {
  const utcDate = makeObservationDate(state.date, state.time, state.timeZone);
  const observer = new Astronomy.Observer(
    state.latitude,
    state.longitude,
    state.elevation,
  );
  const lst = computeLST(utcDate, state.longitude);
  const rotationMatrix = buildSkyRotationMatrix(state.latitude, lst);

  const bodies = new Map<string, BodySnapshot>();

  for (const planetDef of PLANETS) {
    const body = (Astronomy.Body as any)[planetDef.name] as Astronomy.Body;

    // Equatorial coordinates
    const eq = Astronomy.Equator(body, utcDate, observer, false, true);
    const raDeg = eq.ra * 15; // hours → degrees
    const decDeg = eq.dec;

    // Ecliptic — use astronomy-engine, not manual obliquity rotation
    let eclipticLon: number;
    let eclipticLat: number;
    if (body === Astronomy.Body.Sun) {
      const sunPos = Astronomy.SunPosition(utcDate);
      eclipticLon = ((sunPos.elon % 360) + 360) % 360;
      eclipticLat = sunPos.elat;
    } else {
      const eclVec = Astronomy.Ecliptic(
        Astronomy.GeoVector(body, utcDate, false),
      );
      eclipticLon = ((eclVec.elon % 360) + 360) % 360;
      eclipticLat = eclVec.elat;
    }

    // Retrograde (existing function, unchanged)
    const retrograde = isRetrograde(body, utcDate);

    // Zodiac sign (existing function, unchanged)
    const { signName, degreeInSign } = getZodiacSignInfo(eclipticLon);

    // Apparent magnitude
    const magnitude = Astronomy.Illumination(body, utcDate).mag;

    bodies.set(planetDef.name, {
      name: planetDef.name,
      body,
      raDeg,
      decDeg,
      eclipticLon,
      eclipticLat,
      signName,
      degreeInSign,
      retrograde,
      magnitude,
    });
  }

  return {
    utcDate,
    latitude: state.latitude,
    longitude: state.longitude,
    elevation: state.elevation,
    lst,
    rotationMatrix,
    bodies,
  };
}
```

**Import needed at top of `calculations.ts`:**

```ts
import { PLANETS } from "../config/constants";
import type { SkyState, CelestialSnapshot, BodySnapshot } from "../types";
```

---

## Phase 2 — Refactor `planets.ts` to consume snapshot

**File**: `src/scripts/rendering/objects/planets.ts`

Change `updatePlanetPositions` signature. No ephemeris calls, no coordinate computation — read from snapshot.

```ts
// BEFORE signature:
export function updatePlanetPositions(
  planets: PlanetState[],
  state: SkyState,
  observationDate: Date,
  observer: Astronomy.Observer,
): void;

// AFTER signature:
export function updatePlanetPositions(
  planets: PlanetState[],
  snapshot: CelestialSnapshot,
): void;
```

**New body:**

```ts
export function updatePlanetPositions(
  planets: PlanetState[],
  snapshot: CelestialSnapshot,
): void {
  for (const planet of planets) {
    const body = snapshot.bodies.get(planet.name);
    if (!body) continue;

    // Projection: RA/Dec → 3D XYZ. This is a rendering concern, not astronomy.
    const position = raDegDecDegToXYZ(
      body.raDeg,
      body.decDeg,
      SPHERE.radius - 1,
    );
    const scale = THREE.MathUtils.clamp(
      planet.baseSize + (2.5 - body.magnitude) * 0.35,
      5.5,
      15,
    );

    planet.sprite.position.copy(position);
    planet.currentScale = scale;
    planet.sprite.scale.setScalar(scale);
    planet.sprite.visible = true;
    planet.eclipticLongitude = body.eclipticLon;
    planet.retrograde = body.retrograde;
    planet.signName = body.signName;
    planet.degreeInSign = body.degreeInSign;
  }
}
```

Remove imports: `Astronomy`, `getEclipticLongitude`, `isRetrograde`, `getZodiacSignInfo`.
Keep imports: `raDegDecDegToXYZ`, `THREE`, `SPHERE`.

---

## Phase 3 — Refactor `app.ts`

**File**: `src/scripts/app.ts`

### 3a — Remove duplicate functions

Lines 77–111 in `app.ts` duplicate functions already in `calculations.ts`:

- `parseGmtOffset`
- `formatOffsetMinutes`
- `getTimeZoneOffsetMinutes`
- `makeObservationDate`

Delete them. Add to the import from `calculations.ts`:

```ts
import {
  computeCelestialSnapshot, // ADD
  computeLST,
  buildSkyRotationMatrix,
  applyRotationMatrixToGroup,
  // parseGmtOffset, formatOffsetMinutes, etc — import these too, remove local copies
} from "./astronomy/calculations";
```

### 3b — Replace `currentSkyState` with `currentSnapshot`

```ts
// BEFORE
let currentSkyState: SkyState = DEFAULT_SKY_STATE;

// AFTER
let currentSkyState: SkyState = DEFAULT_SKY_STATE; // keep for UI binding
let currentSnapshot: CelestialSnapshot; // add: derived state
```

`currentSkyState` continues to hold user-input form values (it's the UI binding). `currentSnapshot` is derived from it and drives rendering. This keeps the form state separate from computed astronomical state.

### 3c — Replace `applySkyState` body

```ts
function applySkyState(state: SkyState): void {
  currentSkyState = state;

  // Compute once — all downstream reads from snapshot
  currentSnapshot = computeCelestialSnapshot(state);

  // Apply observer rotation to sky group
  applyRotationMatrixToGroup(skyGroup, currentSnapshot.rotationMatrix);

  // Update planet rendering from snapshot (no ephemeris calls here)
  updatePlanetPositions(planets, currentSnapshot);

  // Update UI display fields
  updateSkyControls(state, currentSnapshot);
}
```

Remove the inline `makeObservationDate`, `Astronomy.Observer`, `computeLST`, `buildSkyRotationMatrix` calls from `applySkyState` — they are now inside `computeCelestialSnapshot`.

### 3d — Multi-state (natal + transit)

Add alongside `currentSnapshot`:

```ts
let natalSnapshot: CelestialSnapshot | null = null;
```

When the user eventually adds birth data input:

```ts
natalSnapshot = computeCelestialSnapshot(natalSkyState);
```

Both snapshots are immutable once computed. Aspects and 2D chart rendering receive one or both as parameters.

---

## Phase 4 — New file: `src/scripts/astronomy/aspects.ts`

Aspects operate entirely on ecliptic longitude — not 3D vectors. This is standard Western astrology convention.

```ts
import type { CelestialSnapshot, Aspect, AspectType } from "../types";

const ASPECT_DEFS: { type: AspectType; angle: number; orb: number }[] = [
  { type: "conjunction", angle: 0, orb: 8 },
  { type: "sextile", angle: 60, orb: 4 },
  { type: "square", angle: 90, orb: 6 },
  { type: "trine", angle: 120, orb: 6 },
  { type: "opposition", angle: 180, orb: 8 },
];

function eclipticSeparation(lonA: number, lonB: number): number {
  const diff = Math.abs(lonA - lonB) % 360;
  return diff > 180 ? 360 - diff : diff; // normalize to [0, 180]
}

// Aspects within a single snapshot (current sky self-aspects)
export function computeAspects(snapshot: CelestialSnapshot): Aspect[] {
  const result: Aspect[] = [];
  const bodies = Array.from(snapshot.bodies.values());

  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const sep = eclipticSeparation(
        bodies[i].eclipticLon,
        bodies[j].eclipticLon,
      );
      for (const def of ASPECT_DEFS) {
        const orb = Math.abs(sep - def.angle);
        if (orb <= def.orb) {
          result.push({
            bodyA: bodies[i].name,
            bodyB: bodies[j].name,
            type: def.type,
            angle: sep,
            orb,
          });
        }
      }
    }
  }
  return result;
}

// Cross-state aspects: natal bodies vs transit bodies
export function computeTransitAspects(
  natal: CelestialSnapshot,
  transit: CelestialSnapshot,
): Aspect[] {
  const result: Aspect[] = [];
  for (const natalBody of natal.bodies.values()) {
    for (const transitBody of transit.bodies.values()) {
      const sep = eclipticSeparation(
        natalBody.eclipticLon,
        transitBody.eclipticLon,
      );
      for (const def of ASPECT_DEFS) {
        const orb = Math.abs(sep - def.angle);
        if (orb <= def.orb) {
          result.push({
            bodyA: natalBody.name,
            bodyB: transitBody.name,
            type: def.type,
            angle: sep,
            orb,
          });
        }
      }
    }
  }
  return result;
}
```

---

## Phase 5 — New file: `src/scripts/rendering/sky-chart-2d.ts`

The 2D planisphere is a pure function of `CelestialSnapshot`. It projects RA/Dec → Alt/Az using LST + latitude from the snapshot, then applies stereographic projection.

```ts
import type { CelestialSnapshot } from "../../types";
import { raDecToAltAz } from "../../astronomy/calculations"; // add this function (below)

export function renderChart(
  canvas: HTMLCanvasElement,
  snapshot: CelestialSnapshot,
  starData?: { raDeg: number; decDeg: number; mag: number }[], // optional bright stars
): void {
  const ctx = canvas.getContext("2d")!;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const R = Math.min(cx, cy) * 0.9; // horizon radius in pixels

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw horizon circle
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = "#2a5a6a";
  ctx.stroke();

  // Draw altitude rings (30°, 60°)
  for (const altDeg of [30, 60]) {
    const r =
      (R * Math.cos((altDeg * Math.PI) / 180)) /
      (1 + Math.sin((altDeg * Math.PI) / 180));
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.stroke();
  }

  // Draw planets
  for (const body of snapshot.bodies.values()) {
    const { altDeg, azDeg } = raDecToAltAz(
      body.raDeg,
      body.decDeg,
      snapshot.lst,
      snapshot.latitude,
    );
    if (altDeg < 0) continue; // below horizon

    const r =
      (R * Math.cos((altDeg * Math.PI) / 180)) /
      (1 + Math.sin((altDeg * Math.PI) / 180));
    const az = (azDeg * Math.PI) / 180;
    const x = cx + r * Math.sin(az);
    const y = cy - r * Math.cos(az); // canvas Y-axis inverted

    ctx.fillStyle = "#ffffff";
    ctx.font = "14px serif";
    ctx.fillText(body.signName[0], x, y); // placeholder glyph
  }
}
```

**Add to `calculations.ts`:**

```ts
export function raDecToAltAz(
  raDeg: number,
  decDeg: number,
  lstHours: number,
  latDeg: number,
): { altDeg: number; azDeg: number } {
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

---

## File Change Summary

| File                                       | Change                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| `src/scripts/types.ts`                     | Add `BodySnapshot`, `CelestialSnapshot`, `Aspect`, `AspectType`                       |
| `src/scripts/astronomy/calculations.ts`    | Add `computeCelestialSnapshot()`, `raDecToAltAz()`                                    |
| `src/scripts/rendering/objects/planets.ts` | Change `updatePlanetPositions` to consume `CelestialSnapshot`, remove ephemeris calls |
| `src/scripts/app.ts`                       | Add `currentSnapshot`, simplify `applySkyState`, remove duplicate functions           |
| `src/scripts/astronomy/aspects.ts`         | **New** — `computeAspects()`, `computeTransitAspects()`                               |
| `src/scripts/rendering/sky-chart-2d.ts`    | **New** — `renderChart()` as pure projection of `CelestialSnapshot`                   |

---

## Execution Order

1. **types.ts** — Add new interfaces. Nothing breaks; old types still exist.
2. **calculations.ts** — Add `computeCelestialSnapshot()` and `raDecToAltAz()`. No callers yet.
3. **planets.ts** — Swap `updatePlanetPositions` signature. Update `app.ts` call site simultaneously.
4. **app.ts** — Wire `computeCelestialSnapshot`, remove duplicate functions, add `currentSnapshot`.
5. **aspects.ts** — Create. Wire into `app.ts` when 2D chart is ready.
6. **sky-chart-2d.ts** — Create. Wire toggle + canvas in `index.astro`.

**Run `npm run build` after each phase to catch type errors.**

---

## Verification

After each phase:

- **Phase 2**: Planet positions on globe unchanged. Verify Jupiter and Saturn appear in same sky region as before.
- **Phase 3**: `applySkyState` produces same visual output. Browser console: `currentSnapshot.bodies.get('Jupiter').signName` returns expected sign.
- **Phase 4**: `computeAspects(currentSnapshot)` returns valid aspect list. Verify manually against astro.com for today's date.
- **Phase 5**: 2D chart renders with planets above horizon. Toggle button shows/hides canvas.
- **End-to-end**: Open Stellarium, set same location/date. Verify planet alt/az within ±1°. Verify zodiac signs match tropical chart (astro.com).

---

## Invariants (Enforce Throughout)

1. No ephemeris call (`Astronomy.*`) outside `astronomy/` directory
2. No `THREE.*` import inside `astronomy/` directory
3. `CelestialSnapshot` is constructed exactly once per user action, never mutated
4. All aspect calculations use `eclipticLon`, never 3D position vectors
5. `rotationMatrix` is applied to the scene group, never to individual body positions

---

## Architectural Notes — Pragmatism vs Purity (Future Refactoring)

This plan is pragmatically sound for the current scope (transit overlays, aspects, 2D chart). However, two layering distinctions are worth flagging for future extensions (natal houses, sidereal mode, other coordinate systems).

### Note 1: BodySnapshot mixes raw measurements with derived interpretations

**Current design:**

```ts
BodySnapshot {
  raDeg, decDeg,              // raw astronomical measurement
  eclipticLon, eclipticLat,   // derived from above
  signName, degreeInSign,     // derived astrological interpretation
  retrograde,                 // derived astrological flag
  magnitude,                  // raw measurement
}
```

**The distinction:**

- **Raw measurements** (`raDeg`, `decDeg`, `magnitude`) are frame-independent, stable across coordinate systems
- **Derived semantics** (`signName`, `degreeInSign`, `retrograde`) are interpretations specific to tropical Western astrology

**Why this is acceptable now:**

- The app is committed to tropical Western astrology. There's no current plan to support sidereal or Vedic systems.
- Computing `signName` once per snapshot is efficient; there's no recomputation.
- The separation would add complexity without current benefit.

**If future work requires:** sidereal astrology, house systems, or Vedic calculations:

- Split into `AstronomicalBodySnapshot { raDeg, decDeg, eclipticLon, eclipticLat, magnitude }` (frame-independent)
- And `AstrologicalInterpretation { signName, degreeInSign, retrograde }` (system-dependent)
- Store both on the body, or keep them separate and join in the rendering layer

### Note 2: rotationMatrix on CelestialSnapshot conflates reference frame with observer perspective

**Current design:**

```ts
CelestialSnapshot {
  utcDate, latitude, longitude, elevation,  // observer context
  lst, rotationMatrix,                       // observer-dependent transforms
  bodies: Map<string, BodySnapshot>,         // sky state (frame-independent)
}
```

**The distinction:**

- **Sky state** (`bodies` with their RA/Dec, eclipticLon) is frame-independent — valid for any observer, any time
- **Observer projection** (`lst`, `rotationMatrix`) answers "how does this observer see the sky at this moment?"

**Why this is acceptable now:**

- The app has one observer context at a time (current sky). Multi-observer support doesn't exist.
- Storing the rotation matrix on the snapshot is convenient for passing to `applyRotationMatrixToGroup`.
- The `utcDate` and observer location (`lat`, `lon`, `elev`) are needed anyway.

**If future work requires:** birth charts with house systems, relocations, or alternate observer locations simultaneously:

- Split into:

  ```ts
  CelestialSnapshot {
    utcDate,
    bodies: Map<string, BodySnapshot>,  // frame-independent sky state
  }

  ObserverProjection {
    latitude, longitude, elevation,
    lst, rotationMatrix,                // observer-dependent view
  }
  ```

- Then pass both to renderers: `render3DGlobe(snapshot, projection)`
- House systems would live in `ObserverProjection` alongside the rotation matrix

**Why we're not doing this now:**

- It adds a layer of indirection without current payoff
- The observer is fixed for the entire session (user's location, or birth location if adding natal charts)
- Separating them would require threading two objects through all renderers and aspect functions

### Recommendation for agents implementing Phase 2+ features:

When adding:

- **Natal charts**: Observer projection becomes relevant — birth location vs current location. Consider whether to split at that point.
- **Houses or Vedic astrology**: You'll need the separation. Plan for it then.
- **Sidereal support**: You'll need to separate astronomical from astrological semantics. Add a flag or computed field to track which system is active.

For now: the pragmatic design is correct. The snapshot is a good intermediate representation. Recognize the layering distinction, but don't enforce it prematurely.
