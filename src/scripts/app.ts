/**
 * App Orchestrator — coordinates all modules for the celestial globe application.
 */

import * as THREE from 'three';
import * as Astronomy from 'astronomy-engine';
import tzLookup from 'tz-lookup';

import { initializeScene, onWindowResize, disposeScene } from './rendering/scene';
import {
  createGraticuleMaterial,
  createEquatorMaterial,
  createStarMaterial,
  createZodiacStarMaterial,
} from './rendering/materials';
import { createGraticule, createEquator } from './rendering/sphere-canvas';
import { loadStars, createStarGeometry, getStarVisuals } from './rendering/objects/stars';
import { loadConstellations } from './rendering/objects/constellations';
import { createPlanets, updatePlanetPositions, updatePlanetAnimations } from './rendering/objects/planets';
import { updateHover, handleConstellationHover, handlePlanetHover } from './ui/interaction';
import { getControlElements, parseSkyStateFromControls, handlePlaceSearch } from './ui/controls';
import { reverseGeocode } from './astronomy/geolocation';
import { startIntroZoom, updateIntroZoom } from './animation/intro-zoom';
import { shouldAutoRotate, updateAutoRotate } from './animation/auto-rotation';

import { THEME } from './config/theme';
import { SPHERE, CAMERA, CONTROLS, ANIMATION, STARS, PLANETS, CONSTELLATIONS } from './config/constants';
import { DEFAULT_OBSERVER } from './config/defaults';

import type { SkyState, IntroAnimState, ConstellationState, PlanetState } from './types';

const SPHERE_RADIUS = SPHERE.radius;
const GRATICULE_STEP = SPHERE.graticulStep;
const GRATICULE_SEGMENTS = SPHERE.graticuleSegments;
const GLOBE_VIEW_THRESHOLD = CONTROLS.globeViewThreshold;

const DEFAULT_SKY_STATE = DEFAULT_OBSERVER;
const HORIZONTAL_TO_WORLD_ROTATION = [
  [0, -1, 0],
  [1, 0, 0],
  [0, 0, -1],
];

const canvas = document.getElementById('globe-canvas') as HTMLCanvasElement;
const setup = initializeScene(canvas);
const { scene, camera, renderer, composer, labelRenderer, controls, skyGroup, planetGroup, bloomPass } = setup;

// --- UI Elements ---

const uiElements = getControlElements();

// --- Materials ---

const graticuleMaterial = createGraticuleMaterial();
const equatorMaterial = createEquatorMaterial();
const starMaterial = createStarMaterial();
const zodiacStarMaterial = createZodiacStarMaterial();

// --- Graticule ---

skyGroup.add(createGraticule(GRATICULE_STEP, GRATICULE_SEGMENTS));
skyGroup.add(createEquator());

// --- State ---

let starPoints: THREE.Points | null = null;
let zodiacPoints: THREE.Points | null = null;
const constellations: ConstellationState[] = [];
const planets: PlanetState[] = [];
let hoveredAbbrev: string | null = null;
let hoveredPlanetName: string | null = null;
let currentSkyState: SkyState = { ...DEFAULT_SKY_STATE };
let introAnim: IntroAnimState | null = null;

// --- Utility Functions ---

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
  });
  const parts = formatter.formatToParts(date);
  const offsetPart = parts.find(p => p.type === 'timeZoneName');
  if (!offsetPart) return 0;
  return parseGmtOffset(offsetPart.value);
}

function makeObservationDate(date: string, time: string, timeZone: string): Date {
  const localStr = `${date}T${time}`;
  const localDate = new Date(localStr);
  const offsetMinutes = getTimeZoneOffsetMinutes(localDate, timeZone);
  return new Date(localDate.getTime() - offsetMinutes * 60000);
}

function updateSummary(state: SkyState) {
  const date = new Date(makeObservationDate(state.date, state.time, state.timeZone));
  const dateStr = date.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const timeStr = date.toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const offsetStr = formatOffsetMinutes(getTimeZoneOffsetMinutes(date, state.timeZone));
  uiElements.skySummary.textContent = `${state.placeName} | ${dateStr} ${timeStr} ${offsetStr} | Elev: ${state.elevation}m`;
}

async function applySkyState(state: SkyState) {
  currentSkyState = state;
  uiElements.placeNameInput.value = state.placeName;
  uiElements.dateInput.value = state.date;
  uiElements.timeInput.value = state.time;
  uiElements.elevationInput.value = String(state.elevation);

  const observationDate = makeObservationDate(state.date, state.time, state.timeZone);
  const observer = new Astronomy.Observer(state.latitude, state.longitude, state.elevation);

  updateSummary(state);
  updatePlanetPositions(planets, state, observationDate, observer);
  const az = Math.atan2(1, 0);
  const alt = Math.PI / 4;
  const horiz = [
    [Math.cos(alt) * Math.cos(az), -Math.sin(alt), Math.cos(alt) * Math.sin(az)],
    [-Math.sin(az), 0, Math.cos(az)],
    [Math.sin(alt) * Math.cos(az), Math.cos(alt), Math.sin(alt) * Math.sin(az)],
  ];

  const horizontalToWorld = multiply3x3(HORIZONTAL_TO_WORLD_ROTATION, horiz);
  applyRotationMatrixToGroup(skyGroup, horizontalToWorld);
}

// --- Event Handlers ---

const handleMouseMove = (e: Event) => {
  const me = e as MouseEvent;
  updateHover(me.clientX, me.clientY, camera, constellations, planets, (abbrev) => {
    hoveredAbbrev = handleConstellationHover(abbrev, hoveredAbbrev, constellations, zodiacPoints);
  }, (name) => {
    hoveredPlanetName = handlePlanetHover(name, hoveredPlanetName, planets);
  });
};

const handleTouchMove = (e: Event) => {
  const te = e as TouchEvent;
  if (te.touches.length > 0) {
    updateHover(te.touches[0].clientX, te.touches[0].clientY, camera, constellations, planets, (abbrev) => {
      hoveredAbbrev = handleConstellationHover(abbrev, hoveredAbbrev, constellations, zodiacPoints);
    }, (name) => {
      hoveredPlanetName = handlePlanetHover(name, hoveredPlanetName, planets);
    });
  }
};

const handleMouseDown = () => {
  introAnim = null;
};

const handleWheel = () => {
  introAnim = null;
};

// --- Initialization ---

async function init() {
  // Load stars
  const starData = await loadStars();
  const starVisuals = Array.from({ length: starData.count }, (_, i) => ({
    size: 0,
    brightness: 0,
  }));
  for (let i = 0; i < starData.count; i++) {
    const mag = starData.mags[i];
    const visuals = getStarVisuals(mag, 'regular');
    starVisuals[i] = visuals;
  }

  const starGeometry = createStarGeometry(starData.positions, starData.mags, starVisuals);
  starPoints = new THREE.Points(starGeometry, starMaterial);
  skyGroup.add(starPoints);

  // Load constellations
  const result = await loadConstellations(
    starData.positions,
    starData.mags,
    starData.count,
    skyGroup,
    zodiacStarMaterial
  );
  zodiacPoints = result.zodiacPoints;
  constellations.push(...result.constellations);

  // Create planets
  planets.push(...createPlanets(planetGroup));

  // Setup event handlers
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('touchmove', handleTouchMove, { passive: true } as EventListenerOptions);
  renderer.domElement.addEventListener('mousedown', handleMouseDown);
  renderer.domElement.addEventListener('wheel', handleWheel, { passive: true } as EventListenerOptions);
  window.addEventListener('resize', () => onWindowResize(setup));

  // Setup UI interactions
  uiElements.searchPlaceButton.addEventListener('click', async () => {
    await handlePlaceSearch(uiElements.placeNameInput.value, uiElements, async (place) => {
      const newState = { ...currentSkyState, ...place };
      newState.timeZone = tzLookup.tz(place.latitude, place.longitude);
      await applySkyState(newState);
    });
  });

  uiElements.useMyLocationButton.addEventListener('click', async () => {
    uiElements.locationStatus.textContent = 'Getting location...';
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const newState = {
          ...currentSkyState,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          elevation: pos.coords.altitude || 0,
        };
        newState.timeZone = tzLookup.tz(pos.coords.latitude, pos.coords.longitude);
        try {
          const reversedPlace = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
          newState.placeName = reversedPlace.name;
        } catch {
          newState.placeName = `${pos.coords.latitude.toFixed(2)}, ${pos.coords.longitude.toFixed(2)}`;
        }
        await applySkyState(newState);
        uiElements.locationStatus.textContent = '';
      },
      () => {
        uiElements.locationStatus.textContent = 'Location access denied.';
      }
    );
  });

  uiElements.skyControls.addEventListener('change', async () => {
    const newState = parseSkyStateFromControls(uiElements, currentSkyState);
    await applySkyState(newState);
  });

  // Apply initial sky state
  applySkyState({ ...DEFAULT_SKY_STATE });

  // Trigger zoom-out animation after sky state is loaded
  setTimeout(() => {
    if (!introAnim) {
      introAnim = startIntroZoom(camera);
    }
  }, ANIMATION.introZoomDelay);

  isInitialized = true;
  animate();
}

// --- Animation Loop ---

let animFrameId: number;
const animationClock = new THREE.Clock();
let isInitialized = false;

function animate() {
  if (!isInitialized) return;
  animFrameId = requestAnimationFrame(animate);

  // Handle intro zoom-out animation
  if (introAnim) {
    const isComplete = updateIntroZoom(introAnim, camera);
    if (isComplete) {
      introAnim = null;
      controls.update();
    }
  } else {
    controls.update();
    const cameraDistance = camera.position.length();
    updateAutoRotate(controls, shouldAutoRotate(cameraDistance));
  }

  const elapsed = animationClock.getElapsedTime();

  // t=0 fully zoomed in (dist=8), t=1 fully zoomed out (dist=200)
  const dist = camera.position.length();
  const t = Math.max(0, Math.min(1, (dist - 8) / (200 - 8)));

  starMaterial.uniforms['magThreshold'].value = 9.0 - t * 3.1;
  starMaterial.uniforms['brightnessMult'].value = 1.0 - t * 0.4;
  starMaterial.uniforms['sizeMult'].value = 1.0 - t * 0.32;
  bloomPass.strength = 0.2 - t * 0.14;

  updatePlanetAnimations(planets, elapsed);

  composer.render();
  labelRenderer.render(scene, camera);
}

// --- Cleanup ---

function dispose() {
  cancelAnimationFrame(animFrameId);
  window.removeEventListener('mousemove', handleMouseMove);
  window.removeEventListener('touchmove', handleTouchMove);
  renderer.domElement.removeEventListener('mousedown', handleMouseDown);
  renderer.domElement.removeEventListener('wheel', handleWheel);

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
    for (const l of c.lines) {
      l.geometry.dispose();
      skyGroup.remove(l);
    }
    for (const m of c.mats) m.dispose();
    c.hitMesh.geometry.dispose();
    (c.hitMesh.material as THREE.Material).dispose();
    skyGroup.remove(c.hitMesh);
  }

  graticuleMaterial.dispose();
  equatorMaterial.dispose();
  starMaterial.dispose();
  zodiacStarMaterial.dispose();

  disposeScene(setup);
}

if (import.meta.hot) {
  import.meta.hot.dispose(dispose);
}

// Start initialization
init();
