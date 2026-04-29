import * as THREE from 'three';
import * as Astronomy from 'astronomy-engine';
import tzLookup from 'tz-lookup';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const SPHERE_RADIUS = 100;
const GRATICULE_STEP = 30;
const GRATICULE_SEGMENTS = 128;
const GLOBE_VIEW_THRESHOLD = SPHERE_RADIUS;

interface IntroAnimState {
  startDir: THREE.Vector3;
  startDist: number;
  endDist: number;
  startTime: number;
  duration: number;
}

const DEFAULT_SKY_STATE = {
  placeName: 'San Francisco, CA',
  latitude: 37.7749,
  longitude: -122.4194,
  elevation: 16,
  date: '2026-04-26',
  time: '21:00',
  timeZone: 'America/Los_Angeles',
} as const;
const HORIZONTAL_TO_WORLD_ROTATION = [
  [0, -1, 0],
  [1, 0, 0],
  [0, 0, -1],
];
const PLANET_BODIES = [
  { body: Astronomy.Body.Mercury, name: 'Mercury', glyph: '☿', color: '#c9d4e0', size: 5.2 },
  { body: Astronomy.Body.Venus, name: 'Venus', glyph: '♀', color: '#f5e3ba', size: 6.0 },
  { body: Astronomy.Body.Mars, name: 'Mars', glyph: '♂', color: '#d97b5f', size: 5.4 },
  { body: Astronomy.Body.Jupiter, name: 'Jupiter', glyph: '♃', color: '#efd5b0', size: 6.8 },
  { body: Astronomy.Body.Saturn, name: 'Saturn', glyph: '♄', color: '#e4cb88', size: 6.4 },
  { body: Astronomy.Body.Uranus, name: 'Uranus', glyph: '♅', color: '#9fdce4', size: 5.2 },
  { body: Astronomy.Body.Neptune, name: 'Neptune', glyph: '♆', color: '#7293db', size: 5.2 },
] as const;

interface SkyState {
  placeName: string;
  latitude: number;
  longitude: number;
  elevation: number;
  date: string;
  time: string;
  timeZone: string;
}

interface ResolvedPlace {
  name: string;
  latitude: number;
  longitude: number;
  timeZone: string;
}

const canvas = document.getElementById('globe-canvas') as HTMLCanvasElement;
const skySummary = document.getElementById('sky-summary') as HTMLParagraphElement;
const skyControls = document.getElementById('sky-controls') as HTMLFormElement;
const placeNameInput = document.getElementById('place-name') as HTMLInputElement;
const searchPlaceButton = document.getElementById('search-place') as HTMLButtonElement;
const useMyLocationButton = document.getElementById('use-my-location') as HTMLButtonElement;
const placeResults = document.getElementById('place-results') as HTMLDivElement;
const locationStatus = document.getElementById('location-status') as HTMLParagraphElement;
const locationDetails = document.getElementById('location-details') as HTMLParagraphElement;
const dateInput = document.getElementById('sky-date') as HTMLInputElement;
const timeInput = document.getElementById('sky-time') as HTMLInputElement;
const elevationInput = document.getElementById('elevation') as HTMLInputElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const composer = new EffectComposer(renderer);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
document.getElementById('labels')!.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#081f2b');
scene.add(new THREE.AmbientLight('#ffffff'));

const skyGroup = new THREE.Group();
skyGroup.matrixAutoUpdate = false;
scene.add(skyGroup);

const planetGroup = new THREE.Group();
skyGroup.add(planetGroup);

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  1,
  1000
);
camera.position.set(0, 0, SPHERE_RADIUS);

composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.2,  // strength
  0.6,  // radius
  0.1   // threshold — only pixels brighter than ~10% bloom
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

const controls = new OrbitControls(camera, renderer.domElement);
controls.enablePan = false;
controls.enableZoom = true;
controls.minDistance = 8;
controls.maxDistance = 200;
controls.rotateSpeed = -1;
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.autoRotateSpeed = -1.6;

// --- Graticule ---

const graticuleMaterial = new THREE.LineBasicMaterial({
  color: new THREE.Color('#1a3a4a'),
  transparent: true,
  opacity: 0.6,
});

function makeLatitudeCircle(latDeg: number): THREE.LineLoop {
  const phi = (latDeg * Math.PI) / 180;
  const pts = Array.from({ length: GRATICULE_SEGMENTS }, (_, i) => {
    const lon = (i / GRATICULE_SEGMENTS) * Math.PI * 2;
    return new THREE.Vector3(
      SPHERE_RADIUS * Math.cos(phi) * Math.cos(lon),
      SPHERE_RADIUS * Math.sin(phi),
      SPHERE_RADIUS * Math.cos(phi) * Math.sin(lon)
    );
  });
  return new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(pts),
    graticuleMaterial
  );
}

function makeLongitudeMeridian(lonDeg: number): THREE.Line {
  const theta = (lonDeg * Math.PI) / 180;
  const pts = Array.from({ length: GRATICULE_SEGMENTS }, (_, i) => {
    const lat = -Math.PI / 2 + (i / (GRATICULE_SEGMENTS - 1)) * Math.PI;
    return new THREE.Vector3(
      SPHERE_RADIUS * Math.cos(lat) * Math.cos(theta),
      SPHERE_RADIUS * Math.sin(lat),
      SPHERE_RADIUS * Math.cos(lat) * Math.sin(theta)
    );
  });
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    graticuleMaterial
  );
}

const graticuleGroup = new THREE.Group();

for (let lat = -90 + GRATICULE_STEP; lat < 90; lat += GRATICULE_STEP) {
  graticuleGroup.add(makeLatitudeCircle(lat));
}
for (let lon = 0; lon < 360; lon += GRATICULE_STEP) {
  graticuleGroup.add(makeLongitudeMeridian(lon));
}

skyGroup.add(graticuleGroup);

// --- Equator highlight ---
const equatorMaterial = new THREE.LineBasicMaterial({
  color: new THREE.Color('#2a5a6a'),
  transparent: true,
  opacity: 0.9,
});
const equatorPts = Array.from({ length: GRATICULE_SEGMENTS }, (_, i) => {
  const lon = (i / GRATICULE_SEGMENTS) * Math.PI * 2;
  return new THREE.Vector3(
    SPHERE_RADIUS * Math.cos(lon),
    0,
    SPHERE_RADIUS * Math.sin(lon)
  );
});
skyGroup.add(
  new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(equatorPts),
    equatorMaterial
  )
);

// --- Stars ---

const starMaterial = new THREE.ShaderMaterial({
  uniforms: { magThreshold: { value: 9.0 }, brightnessMult: { value: 1.0 }, sizeMult: { value: 1.0 } },
  vertexShader: `
    attribute float starSize;
    attribute float brightness;
    attribute float mag;
    uniform float sizeMult;
    varying float vBrightness;
    varying float vMag;
    void main() {
      vBrightness = brightness;
      vMag = mag;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = starSize * sizeMult;
    }
  `,
  fragmentShader: `
    uniform float magThreshold;
    uniform float brightnessMult;
    varying float vBrightness;
    varying float vMag;
    void main() {
      float d = length(gl_PointCoord - vec2(0.5));
      if (d > 0.5) discard;
      float fade = smoothstep(vMag - 0.5, vMag + 0.5, magThreshold);
      float glow = smoothstep(0.5, 0.0, d);
      gl_FragColor = vec4(1.0, 0.97, 0.93, glow * vBrightness * fade * brightnessMult);
    }
  `,
  transparent: true,
  depthWrite: false,
});

const zodiacStarMaterial = new THREE.ShaderMaterial({
  uniforms: { brightnessMult: { value: 1.0 } },
  vertexShader: `
    attribute float starSize;
    attribute float brightness;
    attribute float coreness;
    varying float vBrightness;
    varying float vCoreness;
    void main() {
      vBrightness = brightness;
      vCoreness = coreness;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = starSize;
    }
  `,
  fragmentShader: `
    varying float vBrightness;
    varying float vCoreness;
    void main() {
      vec3 gold = vec3(0.980, 0.933, 0.784);
      float d = length(gl_PointCoord - vec2(0.5));
      if (d > 0.5) discard;
      float whiteCore = smoothstep(vCoreness * 0.3, 0.0, d) * vCoreness;
      vec3 color = mix(gold, vec3(1.0), whiteCore);
      float glow = smoothstep(0.5, 0.05 + vCoreness * 0.15, d);
      gl_FragColor = vec4(color, glow * vBrightness);
    }
  `,
  transparent: true,
  depthWrite: false,
});

interface StarData {
  x: number[];
  y: number[];
  z: number[];
  mag: number[];
  ci: number[];
}

interface ZodiacEntry {
  name: string;
  labelCoords: [number, number]; // [ra_deg, dec_deg] from d3-celestial
  lines: number[][][]; // array of segments, each segment is [[ra,dec], ...]
}

type ZodiacData = Record<string, ZodiacEntry>;

// Per-constellation state for hover
interface ConstellationState {
  abbrev: string;
  name: string;
  starIndices: number[];        // indices into zodiacPoints geometry
  baseSizes: Float32Array;
  baseBrightnesses: Float32Array;
  lines: THREE.Line[];
  mats: THREE.LineBasicMaterial[];
  label: CSS2DObject;
  hitMesh: THREE.Mesh;
}

interface PlanetState {
  name: string;
  body: Astronomy.Body;
  baseSize: number;
  currentScale: number;
  pulsePhase: number;
  pulseSpeed: number;
  spinSpeed: number;
  sprite: THREE.Sprite;
  label: CSS2DObject;
}

let starPoints: THREE.Points | null = null;
let zodiacPoints: THREE.Points | null = null;
const constellations: ConstellationState[] = [];
const planets: PlanetState[] = [];
let hoveredAbbrev: string | null = null;
let hoveredPlanetName: string | null = null;
let currentSkyState: SkyState = { ...DEFAULT_SKY_STATE };
let introAnim: IntroAnimState | null = null;

function multiply3x3(a: number[][], b: number[][]) {
  return a.map((row) =>
    b[0].map((_, colIndex) =>
      row[0] * b[0][colIndex] +
      row[1] * b[1][colIndex] +
      row[2] * b[2][colIndex]
    )
  );
}

function applyRotationMatrixToGroup(group: THREE.Group, rotation: number[][]) {
  const matrix = new THREE.Matrix4().set(
    rotation[0][0], rotation[0][1], rotation[0][2], 0,
    rotation[1][0], rotation[1][1], rotation[1][2], 0,
    rotation[2][0], rotation[2][1], rotation[2][2], 0,
    0, 0, 0, 1
  );
  group.matrix.copy(matrix);
  group.matrixWorldNeedsUpdate = true;
}

function parseGmtOffset(text: string) {
  const normalized = text.replace('UTC', 'GMT');
  const match = normalized.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number.parseInt(match[2], 10);
  const minutes = Number.parseInt(match[3] ?? '0', 10);
  return sign * (hours * 60 + minutes);
}

function formatOffsetMinutes(offsetMinutes: number) {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absoluteMinutes / 60).toString().padStart(2, '0');
  const minutes = (absoluteMinutes % 60).toString().padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
  });
  const zoneName = formatter.formatToParts(date).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  return parseGmtOffset(zoneName);
}

function makeObservationDate(state: SkyState) {
  const [year, month, day] = state.date.split('-').map(Number);
  const [hour, minute] = state.time.split(':').map(Number);
  const baseUtcMs = Date.UTC(year, month - 1, day, hour, minute);
  let resolved = new Date(baseUtcMs);

  for (let i = 0; i < 3; i++) {
    const offsetMinutes = getTimeZoneOffsetMinutes(resolved, state.timeZone);
    const corrected = new Date(baseUtcMs - offsetMinutes * 60_000);
    if (Math.abs(corrected.getTime() - resolved.getTime()) < 1_000) {
      resolved = corrected;
      break;
    }
    resolved = corrected;
  }

  return resolved;
}

function getOffsetStringForState(state: SkyState) {
  return formatOffsetMinutes(getTimeZoneOffsetMinutes(makeObservationDate(state), state.timeZone));
}

function parseSkyStateFromControls(): SkyState {
  return {
    ...currentSkyState,
    placeName: placeNameInput.value.trim() || currentSkyState.placeName,
    elevation: Number.parseFloat(elevationInput.value) || 0,
    date: dateInput.value || DEFAULT_SKY_STATE.date,
    time: timeInput.value || DEFAULT_SKY_STATE.time,
  };
}

function formatSummary(state: SkyState) {
  const observationDate = makeObservationDate(state);
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    timeZone: state.timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(observationDate);
  const formattedTime = new Intl.DateTimeFormat('en-US', {
    timeZone: state.timeZone,
    hour: 'numeric',
    minute: '2-digit',
  }).format(observationDate);
  skySummary.textContent = `${state.placeName} · ${formattedDate} · ${formattedTime} · UTC${getOffsetStringForState(state)}`;
}

function renderLocationMeta(state: SkyState, statusText = 'Resolved from place search') {
  locationStatus.textContent = statusText;
  locationDetails.textContent = `${state.latitude.toFixed(4)}, ${state.longitude.toFixed(4)} · ${state.timeZone} · ${Math.round(state.elevation)} m`;
}

function createPlanetTexture(color: string, glyph: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.35, color);
  gradient.addColorStop(0.72, `${color}cc`);
  gradient.addColorStop(1, `${color}00`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  ctx.fillStyle = 'rgba(255, 250, 235, 0.98)';
  ctx.font = '700 46px "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(255, 245, 214, 0.35)';
  ctx.shadowBlur = 10;
  ctx.fillText(glyph, 64, 67);

  return new THREE.CanvasTexture(canvas);
}

function clearPlaceResults() {
  placeResults.replaceChildren();
}

function buildSkyStateFromResolvedPlace(place: ResolvedPlace) {
  return {
    ...parseSkyStateFromControls(),
    placeName: place.name,
    latitude: place.latitude,
    longitude: place.longitude,
    timeZone: place.timeZone,
  };
}

function renderPlaceOptions(results: ResolvedPlace[]) {
  clearPlaceResults();

  for (const result of results) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = result.name;
    button.addEventListener('click', () => {
      const nextState = buildSkyStateFromResolvedPlace(result);
      placeNameInput.value = result.name;
      clearPlaceResults();
      applySkyState(nextState, 'Resolved from place search');
    });
    placeResults.appendChild(button);
  }
}

async function searchPlaces(query: string): Promise<ResolvedPlace[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '5');
  url.searchParams.set('q', query);

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Place search failed: HTTP ${response.status}`);
  }

  const results = (await response.json()) as Array<{ display_name: string; lat: string; lon: string }>;
  return results.map((result) => {
    const latitude = Number.parseFloat(result.lat);
    const longitude = Number.parseFloat(result.lon);
    return {
      name: result.display_name,
      latitude,
      longitude,
      timeZone: tzLookup(latitude, longitude),
    };
  });
}

async function reverseGeocode(lat: number, lon: number) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', lat.toString());
  url.searchParams.set('lon', lon.toString());

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Reverse geocode failed: HTTP ${response.status}`);
  }

  const result = (await response.json()) as { display_name?: string };
  return result.display_name ?? `Near ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

async function handlePlaceSearch(query: string) {
  const trimmed = query.trim();
  if (!trimmed) return;

  locationStatus.textContent = 'Searching for place...';
  clearPlaceResults();

  try {
    const results = await searchPlaces(trimmed);
    if (results.length === 0) {
      locationStatus.textContent = 'No matching place found';
      locationDetails.textContent = 'Try a broader city, region, or country name';
      return;
    }

    renderPlaceOptions(results);
    const firstResult = results[0];
    const nextState = buildSkyStateFromResolvedPlace(firstResult);
    placeNameInput.value = firstResult.name;
    applySkyState(nextState, 'Resolved from place search');
  } catch (error) {
    console.error(error);
    locationStatus.textContent = 'Place search failed';
    locationDetails.textContent = 'Network lookup was unavailable';
  }
}

async function handleUseMyLocation() {
  if (!navigator.geolocation) {
    locationStatus.textContent = 'Location unavailable';
    locationDetails.textContent = 'This browser does not support geolocation';
    return;
  }

  locationStatus.textContent = 'Locating device...';
  clearPlaceResults();

  navigator.geolocation.getCurrentPosition(async (position) => {
    const latitude = position.coords.latitude;
    const longitude = position.coords.longitude;
    const name = await reverseGeocode(latitude, longitude).catch(() => `Near ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
    const nextState = buildSkyStateFromResolvedPlace({
      name,
      latitude,
      longitude,
      timeZone: tzLookup(latitude, longitude),
    });
    placeNameInput.value = name;
    applySkyState(nextState, 'Using current device location');
  }, () => {
    locationStatus.textContent = 'Location unavailable';
    locationDetails.textContent = 'Permission denied or device location failed';
  }, {
    enableHighAccuracy: true,
    timeout: 10000,
  });
}

function syncSkyOrientation(state: SkyState) {
  const observer = new Astronomy.Observer(state.latitude, state.longitude, state.elevation);
  const observationDate = makeObservationDate(state);
  const eqjToHor = Astronomy.Rotation_EQJ_HOR(observationDate, observer);
  const rotation = multiply3x3(HORIZONTAL_TO_WORLD_ROTATION, eqjToHor.rot);
  applyRotationMatrixToGroup(skyGroup, rotation);
}

function updatePlanetPositions(state: SkyState) {
  const observer = new Astronomy.Observer(state.latitude, state.longitude, state.elevation);
  const observationDate = makeObservationDate(state);

  for (const planet of planets) {
    const eq = Astronomy.Equator(planet.body, observationDate, observer, false, true);
    const position = raDegDecDegToXYZ(eq.ra * 15, eq.dec, SPHERE_RADIUS - 1);
    const mag = Astronomy.Illumination(planet.body, observationDate).mag;
    const scale = THREE.MathUtils.clamp(planet.baseSize + (2.5 - mag) * 0.35, 5.5, 15);

    planet.sprite.position.copy(position);
    planet.currentScale = scale;
    planet.sprite.scale.setScalar(scale);
    planet.label.visible = hoveredPlanetName === planet.name;
    planet.sprite.visible = true;
  }
}

function pointCameraTowardVisibleSky() {
  const target = new THREE.Vector3(0, 18, -100).normalize();
  camera.position.copy(target.multiplyScalar(camera.position.length()));
  controls.update();
}

function applySkyState(state: SkyState, statusText = 'Resolved from place search') {
  currentSkyState = state;
  formatSummary(state);
  renderLocationMeta(state, statusText);
  syncSkyOrientation(state);
  updatePlanetPositions(state);
  pointCameraTowardVisibleSky();
}

function setupControls() {
  searchPlaceButton.addEventListener('click', () => {
    void handlePlaceSearch(placeNameInput.value);
  });
  useMyLocationButton.addEventListener('click', () => {
    void handleUseMyLocation();
  });

  skyControls.addEventListener('submit', async (event) => {
    event.preventDefault();
    const typedPlace = placeNameInput.value.trim();
    if (typedPlace && typedPlace !== currentSkyState.placeName) {
      await handlePlaceSearch(typedPlace);
      return;
    }
    applySkyState(parseSkyStateFromControls(), locationStatus.textContent || 'Resolved from place search');
  });
}

function getStarVisuals(mag: number, layer: 'regular' | 'zodiac') {
  // Map brighter stars into a much wider visual range so the globe reads as
  // structure instead of a mostly uniform point cloud.
  const prominence = THREE.MathUtils.clamp((8.5 - mag) / 10.5, 0, 1);
  const sizeCurve = Math.pow(prominence, 2.35);
  const brightnessCurve = Math.pow(prominence, 1.7);

  if (layer === 'zodiac') {
    return {
      size: 2.45 + sizeCurve * 22.0,
      brightness: Math.min(1.0, 0.32 + brightnessCurve * 0.95),
    };
  }

  return {
    size: 1.45 + sizeCurve * 24.5,
    brightness: Math.min(1.0, 0.12 + brightnessCurve * 0.98),
  };
}

function raDegDecDegToXYZ(raDeg: number, decDeg: number, r: number): THREE.Vector3 {
  const ra = (raDeg * Math.PI) / 180;
  const dec = (decDeg * Math.PI) / 180;
  return new THREE.Vector3(
    r * Math.cos(dec) * Math.cos(ra),
    r * Math.sin(dec),
    r * Math.cos(dec) * Math.sin(ra)
  );
}

async function loadStars(): Promise<{ positions: Float32Array; mags: Float32Array; count: number }> {
  const res = await fetch('/stars.json');
  const data: StarData = await res.json();
  const total = data.x.length;

  const positions   = new Float32Array(total * 3);
  const mags        = new Float32Array(total);
  const sizes       = new Float32Array(total);
  const brightnesses = new Float32Array(total);

  let vi = 0;
  for (let i = 0; i < total; i++) {
    const mag = data.mag[i];
    if (mag < -5) continue;
    const visuals = getStarVisuals(mag, 'regular');

    positions[vi * 3]     = data.x[i] * SPHERE_RADIUS;
    positions[vi * 3 + 1] = data.y[i] * SPHERE_RADIUS;
    positions[vi * 3 + 2] = data.z[i] * SPHERE_RADIUS;
    mags[vi]              = mag;
    sizes[vi]             = visuals.size;
    brightnesses[vi]      = visuals.brightness;
    vi++;
  }

  return { positions: positions.subarray(0, vi * 3), mags: mags.subarray(0, vi), count: vi };
}

async function loadConstellations(
  starPositions: Float32Array,
  starMags: Float32Array,
  starCount: number
): Promise<void> {
  const res = await fetch('/zodiac.json');
  const zodiacData: ZodiacData = await res.json();

  // Collect zodiac member star indices by matching GeoJSON vertices to nearest catalog star
  const zodiacMemberMap = new Map<string, Set<number>>();
  const MATCH_TOLERANCE_SQ = 0.35 * 0.35; // ~0.2° in world units

  for (const [abbrev, entry] of Object.entries(zodiacData)) {
    const memberSet = new Set<number>();

    for (const segment of entry.lines) {
      for (const [raDeg, decDeg] of segment) {
        const target = raDegDecDegToXYZ(raDeg, decDeg, SPHERE_RADIUS);

        let bestDist = Infinity;
        let bestIdx = -1;
        for (let i = 0; i < starCount; i++) {
          const dx = starPositions[i * 3]     - target.x;
          const dy = starPositions[i * 3 + 1] - target.y;
          const dz = starPositions[i * 3 + 2] - target.z;
          const distSq = dx * dx + dy * dy + dz * dz;
          if (distSq < bestDist) {
            bestDist = distSq;
            bestIdx = i;
          }
        }
        if (bestIdx >= 0 && bestDist < MATCH_TOLERANCE_SQ) {
          memberSet.add(bestIdx);
        }
      }
    }

    zodiacMemberMap.set(abbrev, memberSet);
  }

  // Collect all zodiac star indices (union)
  const allZodiacIndices = new Set<number>();
  for (const s of zodiacMemberMap.values()) {
    for (const idx of s) allZodiacIndices.add(idx);
  }

  // Build zodiac Points geometry (one entry per zodiac star)
  const zodiacCount = allZodiacIndices.size;
  const zPositions    = new Float32Array(zodiacCount * 3);
  const zSizes        = new Float32Array(zodiacCount);
  const zBrightnesses = new Float32Array(zodiacCount);
  const zCorenesses   = new Float32Array(zodiacCount);

  let minMag = Infinity, maxMag = -Infinity;
  for (const idx of allZodiacIndices) {
    const m = starMags[idx];
    if (m < minMag) minMag = m;
    if (m > maxMag) maxMag = m;
  }
  const magRange = maxMag - minMag || 1;

  // Map from global star index → zodiac geometry index
  const globalToZodiac = new Map<number, number>();
  let zi = 0;
  for (const idx of allZodiacIndices) {
    const mag = starMags[idx];
    const visuals = getStarVisuals(mag, 'zodiac');
    zPositions[zi * 3]     = starPositions[idx * 3];
    zPositions[zi * 3 + 1] = starPositions[idx * 3 + 1];
    zPositions[zi * 3 + 2] = starPositions[idx * 3 + 2];
    zSizes[zi]             = visuals.size;
    zBrightnesses[zi]      = visuals.brightness;
    zCorenesses[zi]        = (maxMag - mag) / magRange;
    globalToZodiac.set(idx, zi);
    zi++;
  }

  const zodiacGeo = new THREE.BufferGeometry();
  zodiacGeo.setAttribute('position',   new THREE.BufferAttribute(zPositions, 3));
  zodiacGeo.setAttribute('starSize',   new THREE.BufferAttribute(zSizes.slice(), 1));
  zodiacGeo.setAttribute('brightness', new THREE.BufferAttribute(zBrightnesses.slice(), 1));
  zodiacGeo.setAttribute('coreness',   new THREE.BufferAttribute(zCorenesses, 1));

  zodiacPoints = new THREE.Points(zodiacGeo, zodiacStarMaterial);
  zodiacPoints.renderOrder = 1;
  skyGroup.add(zodiacPoints);

  // Build per-constellation state
  for (const [abbrev, entry] of Object.entries(zodiacData)) {
    const memberSet = zodiacMemberMap.get(abbrev)!;
    const starIndices = [...memberSet].map(globalIdx => globalToZodiac.get(globalIdx)!).filter(i => i !== undefined);

    const segLines: THREE.Line[] = [];
    const segMats: THREE.LineBasicMaterial[] = [];

    for (const segment of entry.lines) {
      if (segment.length < 2) continue;
      const pts = segment.map((coord: number[]) =>
        raDegDecDegToXYZ(coord[0], coord[1], SPHERE_RADIUS)
      );
      const isZodiac = ['Ari', 'Tau', 'Gem', 'Cnc', 'Leo', 'Vir', 'Lib', 'Sco', 'Sgr', 'Cap', 'Aqr', 'Psc'].includes(abbrev);
      const lineColor = isZodiac ? 0x8899aa : 0x445566;
      const lineOpacity = 0.7;
      const lineMat = new THREE.LineBasicMaterial({
        color: lineColor,
        transparent: true,
        opacity: lineOpacity,
        depthWrite: false,
      });
      const segLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        lineMat
      );
      skyGroup.add(segLine);
      segLines.push(segLine);
      segMats.push(lineMat);
    }

    // Bounding sphere + label anchor derived from GeoJSON line vertices —
    // robust even when star-matching finds no catalog stars for a constellation.
    const lineVertices: THREE.Vector3[] = [];
    for (const segment of entry.lines) {
      for (const [raDeg, decDeg] of segment) {
        lineVertices.push(raDegDecDegToXYZ(raDeg, decDeg, SPHERE_RADIUS));
      }
    }

    let centroid = new THREE.Vector3();
    for (const v of lineVertices) centroid.add(v);
    centroid.divideScalar(lineVertices.length).normalize().multiplyScalar(SPHERE_RADIUS);

    let maxDist = 0;
    for (const v of lineVertices) {
      const d = centroid.distanceTo(v);
      if (d > maxDist) maxDist = d;
    }
    const hitRadius = maxDist * 1.3 + 3;

    const hitMesh = new THREE.Mesh(
      new THREE.SphereGeometry(hitRadius, 8, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitMesh.position.copy(centroid);
    hitMesh.userData.abbrev = abbrev;
    skyGroup.add(hitMesh);

    // Label anchor from d3-celestial's hand-curated label coordinates
    const labelAnchor = new THREE.Object3D();
    labelAnchor.position.copy(
      raDegDecDegToXYZ(entry.labelCoords[0], entry.labelCoords[1], SPHERE_RADIUS + 5)
    );
    skyGroup.add(labelAnchor);

    const div = document.createElement('div');
    div.className = 'zodiac-label';
    div.textContent = entry.name;
    const label = new CSS2DObject(div);
    label.visible = false;
    labelAnchor.add(label);

    constellations.push({
      abbrev,
      name: entry.name,
      starIndices,
      baseSizes: new Float32Array(starIndices.map(si => zSizes[si])),
      baseBrightnesses: new Float32Array(starIndices.map(si => zBrightnesses[si])),
      lines: segLines,
      mats: segMats,
      label,
      hitMesh,
    });
  }
}

// --- Hover ---

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function updateHover(clientX: number, clientY: number) {
  mouse.x = (clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const hitMeshes = constellations.map(c => c.hitMesh);
  const hits = raycaster.intersectObjects(hitMeshes);
  const planetHits = raycaster.intersectObjects(planets.map(p => p.sprite), false);

  const newHovered = hits.length > 0 ? (hits[0].object.userData.abbrev as string) : null;
  const newHoveredPlanet = planetHits.length > 0 ? (planetHits[0].object.userData.planetName as string) : null;

  if (newHovered !== hoveredAbbrev) {
    if (hoveredAbbrev) {
      const prev = constellations.find(c => c.abbrev === hoveredAbbrev)!;
      const sizeAttr = zodiacPoints!.geometry.attributes['starSize'] as THREE.BufferAttribute;
      const brightAttr = zodiacPoints!.geometry.attributes['brightness'] as THREE.BufferAttribute;
      for (let i = 0; i < prev.starIndices.length; i++) {
        const si = prev.starIndices[i];
        sizeAttr.setX(si, prev.baseSizes[i]);
        brightAttr.setX(si, prev.baseBrightnesses[i]);
      }
      sizeAttr.needsUpdate = true;
      brightAttr.needsUpdate = true;
      prev.label.visible = false;
    }

    if (newHovered) {
      const next = constellations.find(c => c.abbrev === newHovered)!;
      const sizeAttr = zodiacPoints!.geometry.attributes['starSize'] as THREE.BufferAttribute;
      const brightAttr = zodiacPoints!.geometry.attributes['brightness'] as THREE.BufferAttribute;
      for (let i = 0; i < next.starIndices.length; i++) {
        const si = next.starIndices[i];
        sizeAttr.setX(si, next.baseSizes[i] * 1.5);
        brightAttr.setX(si, Math.min(1.0, next.baseBrightnesses[i] * 1.2));
      }
      sizeAttr.needsUpdate = true;
      brightAttr.needsUpdate = true;
      next.label.visible = true;
    }

    hoveredAbbrev = newHovered;
  }

  if (newHoveredPlanet !== hoveredPlanetName) {
    for (const planet of planets) {
      planet.label.visible = planet.name === newHoveredPlanet;
    }
    hoveredPlanetName = newHoveredPlanet;
  }
}

// Event listener references for cleanup
const handleMouseMove = (e: Event) => {
  const me = e as MouseEvent;
  updateHover(me.clientX, me.clientY);
};
const handleTouchMove = (e: Event) => {
  const te = e as TouchEvent;
  if (te.touches.length > 0) {
    updateHover(te.touches[0].clientX, te.touches[0].clientY);
  }
};
const handleMouseDown = () => { introAnim = null; };
const handleWheel = () => { introAnim = null; };

window.addEventListener('mousemove', handleMouseMove);
window.addEventListener('touchmove', handleTouchMove, { passive: true } as EventListenerOptions);
renderer.domElement.addEventListener('mousedown', handleMouseDown);
renderer.domElement.addEventListener('wheel', handleWheel, { passive: true } as EventListenerOptions);

// --- Main load sequence ---

async function init() {
  const { positions, mags, count } = await loadStars();

  // Regular star cloud (all stars, including zodiac members — zodiac layer renders on top)
  const sizes       = new Float32Array(count);
  const brightnesses = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const visuals = getStarVisuals(mags[i], 'regular');
    sizes[i] = visuals.size;
    brightnesses[i] = visuals.brightness;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position',   new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('starSize',   new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('brightness', new THREE.BufferAttribute(brightnesses, 1));
  geo.setAttribute('mag',        new THREE.BufferAttribute(mags, 1));
  starPoints = new THREE.Points(geo, starMaterial);
  skyGroup.add(starPoints);

  await loadConstellations(positions, mags, count);

  for (const planetDef of PLANET_BODIES) {
    const spriteMaterial = new THREE.SpriteMaterial({
      map: createPlanetTexture(planetDef.color, planetDef.glyph),
      transparent: true,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.setScalar(planetDef.size);
    sprite.userData.planetName = planetDef.name;
    planetGroup.add(sprite);

    const div = document.createElement('div');
    div.className = 'planet-label';
    div.textContent = planetDef.name;
    const label = new CSS2DObject(div);
    label.position.set(0, 0, 0);
    label.visible = false;
    sprite.add(label);

    planets.push({
      name: planetDef.name,
      body: planetDef.body,
      baseSize: planetDef.size,
      currentScale: planetDef.size,
      pulsePhase: Math.random() * Math.PI * 2,
      pulseSpeed: 0.85 + Math.random() * 0.7,
      spinSpeed: (Math.random() * 0.12 + 0.04) * (Math.random() > 0.5 ? 1 : -1),
      sprite,
      label,
    });
  }

  setupControls();
  applySkyState({ ...DEFAULT_SKY_STATE });

  // Trigger zoom-out animation after sky state is loaded
  setTimeout(() => {
    if (!introAnim) {
      introAnim = {
        startDir: camera.position.clone().normalize(),
        startDist: camera.position.length(),
        endDist: 200,
        startTime: performance.now(),
        duration: 5500, // slower zoom-out
      };
    }
  }, 1200); // longer delay before animation starts
}

init();

// --- Animation loop ---

let animFrameId: number;
const animationClock = new THREE.Clock();

function animate() {
  animFrameId = requestAnimationFrame(animate);

  // Handle intro zoom-out animation
  if (introAnim) {
    const progress = Math.min(1, (performance.now() - introAnim.startTime) / introAnim.duration);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const targetDist = THREE.MathUtils.lerp(introAnim.startDist, introAnim.endDist, eased);
    camera.position.copy(introAnim.startDir.clone().multiplyScalar(targetDist));

    if (progress >= 1) {
      introAnim = null;
      controls.update();
    }
  } else {
    controls.update();
    const cameraDistance = camera.position.length();
    controls.autoRotate = cameraDistance > GLOBE_VIEW_THRESHOLD;
  }

  const elapsed = animationClock.getElapsedTime();

  // t=0 fully zoomed in (dist=8), t=1 fully zoomed out (dist=200)
  const dist = camera.position.length();
  const t = Math.max(0, Math.min(1, (dist - 8) / (200 - 8)));

  starMaterial.uniforms['magThreshold'].value = 9.0 - t * 3.1;     // 9 close → 5.9 far
  starMaterial.uniforms['brightnessMult'].value = 1.0 - t * 0.4;   // preserve more separation at globe level
  starMaterial.uniforms['sizeMult'].value = 1.0 - t * 0.32;        // 100% close → 68% far
  bloomPass.strength = 0.2 - t * 0.14;                             // keep some bloom presence when zoomed out

  for (const planet of planets) {
    const pulse = 1 + Math.sin(elapsed * planet.pulseSpeed + planet.pulsePhase) * 0.035;
    planet.sprite.scale.setScalar(planet.currentScale * pulse);
    (planet.sprite.material as THREE.SpriteMaterial).rotation += planet.spinSpeed * 0.0025;
  }

  composer.render();
  labelRenderer.render(scene, camera);
}

animate();

// --- Resize handler ---

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.resolution.set(window.innerWidth, window.innerHeight);
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', onResize);

// --- HMR cleanup ---

function dispose() {
  cancelAnimationFrame(animFrameId);
  window.removeEventListener('resize', onResize);
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('touchmove', handleTouchMove);
  renderer.domElement.removeEventListener('mousedown', handleMouseDown);
  renderer.domElement.removeEventListener('wheel', handleWheel);
  controls.dispose();
  graticuleMaterial.dispose();
  equatorMaterial.dispose();
  starMaterial.dispose();
  zodiacStarMaterial.dispose();
  if (starPoints) {
    starPoints.geometry.dispose();
    skyGroup.remove(starPoints);
  }
  if (zodiacPoints) {
    zodiacPoints.geometry.dispose();
    skyGroup.remove(zodiacPoints);
  }
  for (const planet of planets) {
    (planet.sprite.material as THREE.SpriteMaterial).map?.dispose();
    (planet.sprite.material as THREE.Material).dispose();
    planetGroup.remove(planet.sprite);
  }
  for (const c of constellations) {
    for (const l of c.lines) { l.geometry.dispose(); skyGroup.remove(l); }
    for (const m of c.mats) m.dispose();
    c.hitMesh.geometry.dispose();
    (c.hitMesh.material as THREE.Material).dispose();
    skyGroup.remove(c.hitMesh);
  }
  planets.length = 0;
  constellations.length = 0;
  composer.dispose();
  renderer.dispose();
  labelRenderer.domElement.remove();
}

if (import.meta.hot) {
  import.meta.hot.dispose(dispose);
}
