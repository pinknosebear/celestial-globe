# Technical Meta — Blog-Ready Insights

## Discovery: The Ghost Sky Rotation Bug (April 2026)

### The Problem

Users reported planets appearing in the wrong zodiac signs. Jupiter showed up in Gemini when current ephemeris data said it should be in Cancer. At first glance, this looked like a coordinate system confusion—tropical vs sidereal, perhaps? But the discrepancy was too large.

### The Root Cause

The codebase used a **hardcoded static rotation matrix** to orient the celestial sphere. This matrix was computed once at development time and never updated based on:

- **Observer location** (latitude/longitude)
- **Observation time** (date/time UTC)
- **Local Sidereal Time** (LST)

When a user changed their location from San Francisco to Tokyo, or viewed the sky at a different time of day, the globe's orientation stayed fixed. The planets' _RA/Dec coordinates_ were computed correctly by `astronomy-engine`, but the _rotation applied to the sky sphere_ was wrong.

### The Fix

Implement dynamic LST-based rotation:

1. Compute **Greenwich Sidereal Time (GST)** from UTC using `Astronomy.SiderealTime(date)`
2. Add observer's **longitude offset** (in hours) to GST → **Local Sidereal Time**
3. Build a 3×3 rotation matrix that orients the celestial equator so that LST RA sits on the meridian (south), tilted by observer's latitude
4. Apply this matrix to the `skyGroup` every frame as date/location/time changes

**Math insight**: The matrix is the product of two rotations—one by LST (around the polar axis), and one by latitude (around the east-west axis). The trigonometry is elegant but easy to get wrong (signs matter).

### Why This Matters

- **For sky observation**: Without correct rotation, horizon-based features (altitude/azimuth labels, 2D planispheres, visibility checks) are meaningless
- **For astrology**: Astrological data (ecliptic longitudes) is location-independent, but _visual rendering_ depends on observer perspective
- **For generalization**: Any app claiming to show "the sky as you see it from Earth" at a given location/time must solve this problem

---

## Discovery: Three Coordinate Systems, No Silver Bullet

### The Confusion

Building a celestial globe that's both astronomically accurate _and_ astrologically meaningful requires juggling three different coordinate systems:

**1. RA/Dec (Equatorial)**

- Used by: Star catalogs, planet positions in `astronomy-engine`
- Advantages: Natural for spherical sky rendering, directly used for 3D placement
- Disadvantage: Requires LST rotation to align with horizon

**2. Ecliptic Longitude (0–360°)**

- Used by: Western astrology (tropical zodiac), `chart2txt` interpretation, astrological charts
- Advantages: Directly maps to zodiac signs, defines aspects (angular separation)
- Disadvantage: Not intuitive for 3D visualization (requires conversion back to RA/Dec)

**3. Alt/Az (Horizontal)**

- Used by: 2D sky charts (planispheres), horizon visibility, what humans see looking up
- Advantages: Most intuitive for observers—altitude = how high, azimuth = which direction
- Disadvantage: Requires observer latitude + LST to compute from RA/Dec, changes constantly

### The Architecture Choice

The app maintains all three:

- **3D globe**: Converts RA/Dec → 3D XYZ, applies LST rotation
- **Astrological data**: Computes ecliptic longitude for sign/degree labels
- **2D chart**: Converts RA/Dec → Alt/Az for stereographic projection

No single system is "right"—each serves its purpose. The key is understanding the conversions and when to use each.

### Conversion Formulas Worth Remembering

**RA/Dec → Ecliptic Longitude**:

```
Use astronomy-engine's Ecliptic() function on GeoVector output
(No simple formula; involves complex orbital mechanics)
```

**RA/Dec → Alt/Az**:

```
ha = LST * 15° - RA (Hour Angle)
sin(alt) = sin(dec) * sin(lat) + cos(dec) * cos(lat) * cos(ha)
cos(az) = (sin(dec) - sin(alt) * sin(lat)) / (cos(alt) * cos(lat))
```

**Ecliptic Longitude → Zodiac Sign**:

```
signIndex = floor(eclipticLon / 30)
degreeInSign = eclipticLon % 30
```

---

## Discovery: Animation Loop Race Condition

### The Gotcha

When we refactored the monolithic `globe.ts` into modular components, we encountered a classic async-initialization bug:

```ts
// WRONG: animate() starts immediately, but init() hasn't loaded assets yet
animate(); // startTime = now
init(); // loads stars/planets/constellations, takes 50–100ms
// By the time init completes, animate() has already rendered 3–5 frames with null data
```

Result: A black screen for 100ms, then stars flashed in. Users saw jank.

### The Fix

```ts
let isInitialized = false;

function animate() {
  if (!isInitialized) return; // Guard at top
  // ... rest of animation code
}

async function init() {
  // ... load all assets
  isInitialized = true;
  animate(); // Start RAF chain AFTER assets are ready
}

init(); // Fire init, which will call animate()
```

### The Lesson

With `requestAnimationFrame`, a single RAF callback chain is sacred. Don't start animation until all dependencies are loaded. If you have async work, let it complete and then _it_ starts the animation, rather than the reverse.

---

## Challenge: Astrological Chart Generation at Runtime

### The Problem

`chart2txt` is a JavaScript library that generates beautiful astrological chart interpretations from planet positions. But it's designed for static use (feed it positions, get back text). We need:

- Real-time chart updates as user changes location/date
- 2D chart visualization overlaid on the globe
- Export functionality (JSON + PNG)
- Future: natal chart overlay with aspect patterns

### Current Approach

1. Compute ecliptic longitudes for all bodies (Sun, Moon, 7 planets) using `astronomy-engine`
2. Feed them to `chart2txt` to get formatted interpretation text
3. Store them in app state for export + 2D chart rendering
4. 2D chart uses the ecliptic longitudes to position glyphs on a zodiac wheel

### Future Complexity

When we add natal charts:

- Need to store a second set of planet positions (birth data)
- Compute aspects (angular relationships) between natal and current positions
- Visualize aspects as lines on the 2D chart
- Track retrograde status, house placements, aspect patterns

This is where `simple-astro-api` becomes tempting—it's Swiss Ephemeris (industry standard) + automatic aspect calculation. But it's a Netlify function, not client-side. Tradeoff: accuracy vs deployment complexity.

---

## Problem: Stereographic Projection for Planispheres

### The Challenge

A 2D sky chart viewed from Earth's surface is actually a **stereographic projection** of a sphere—not a flat rectangle. The math:

```
r = cos(alt) / (1 + sin(alt))  // Distance from center (0 = zenith, 1 = horizon)
x = r * sin(az)
y = -r * cos(az)
```

Why? Because straight lines on a sphere don't map to straight lines on a plane. Stereographic projection preserves angles, making it ideal for visual astronomy—a person looking up at the sky sees angles correctly (a 45° separation stays 45°).

### Rendering Gotchas

- **Orientation**: Canvas y-axis points down, celestial north (az=0) should point up
- **Horizon circle**: Exactly at `r=1`; anything below horizon is hidden
- **Cardinal directions**: N at top, E to the right, S at bottom, W to the left (as you'd see looking up)
- **Stars below horizon**: Must be clipped or hidden; rendering them breaks immersion

### Performance Note

For thousands of stars, computing Alt/Az on every frame is slow. Solution: pre-compute Alt/Az on data change (location/date), cache them, only recompute when observer changes.

---

## Blog Post Ideas (Drafts)

### "Three Skies: Reconciling Astronomy, Astrology, and HTML5 Canvas"

How to build a web app that correctly renders both the astronomical sky (what you see) and the astrological sky (what the chart says). Includes the LST rotation bug, coordinate system juggling, and why `astronomy-engine` is magical.

### "The Ghost Rotation Matrix: A Sky Rendering Bug Story"

Deep dive into the hardcoded rotation problem, the math behind LST, and how a single missing line of code can make planets appear in the wrong constellation.

### "Stereographic Projections in JavaScript: Building a Planisphere"

Tutorial on the math and implementation of 2D sky charts, including horizon clipping, cardinal direction orientation, and why Canvas coordinates need rotation.

### "Astrological Charts at Runtime: JavaScript + Chart2txt"

How to generate real-time astrological interpretations from planet positions, store ecliptic data efficiently, and render zodiac wheels.
