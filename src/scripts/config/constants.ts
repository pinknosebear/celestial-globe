/**
 * Application constants — magic numbers, thresholds, animation settings.
 */

export const SPHERE = {
  radius: 100,
  graticulStep: 30,
  graticuleSegments: 128,
} as const;

export const CAMERA = {
  initialDistance: 100, // SPHERE_RADIUS
  minDistance: 8,
  maxDistance: 200,
  fov: 75,
} as const;

export const CONTROLS = {
  rotateSpeed: -1,
  enableDamping: true,
  dampingFactor: 0.05,
  autoRotateSpeed: -1.6,
  globeViewThreshold: SPHERE.radius, // rotation only when distance > this
} as const;

export const ANIMATION = {
  introZoomDelay: 1200, // ms before animation starts
  introZoomDuration: 5500, // ms for zoom animation
  introZoomStartDist: CAMERA.initialDistance,
  introZoomEndDist: 200,
} as const;

export const STARS = {
  minMagnitude: -5,
  sizeCurve: 2.35, // exponential curve for star sizes
  brightnessCurve: 1.7,
  regularLayer: {
    baseSizeMin: 1.45,
    baseSizeMax: 24.5,
    baseBrightnessMin: 0.12,
    baseBrightnessMax: 0.98,
  },
  zodiacLayer: {
    baseSizeMin: 2.45,
    baseSizeMax: 22.0,
    baseBrightnessMin: 0.32,
    baseBrightnessMax: 0.95,
  },
} as const;

export const PLANETS = [
  { name: 'Mercury', glyph: '☿', color: '#c9d4e0', size: 5.2 },
  { name: 'Venus', glyph: '♀', color: '#f5e3ba', size: 6.0 },
  { name: 'Mars', glyph: '♂', color: '#d97b5f', size: 5.4 },
  { name: 'Jupiter', glyph: '♃', color: '#efd5b0', size: 6.8 },
  { name: 'Saturn', glyph: '♄', color: '#e4cb88', size: 6.4 },
  { name: 'Uranus', glyph: '♅', color: '#9fdce4', size: 5.2 },
  { name: 'Neptune', glyph: '♆', color: '#7293db', size: 5.2 },
] as const;

export const CONSTELLATIONS = {
  zodiacSet: ['Ari', 'Tau', 'Gem', 'Cnc', 'Leo', 'Vir', 'Lib', 'Sco', 'Sgr', 'Cap', 'Aqr', 'Psc'],
  starMatchTolerance: 0.35 * 0.35, // ~0.2° in world units
} as const;
