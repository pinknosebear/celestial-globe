/**
 * App Orchestrator — coordinates all modules for the celestial globe application.
 */

import * as THREE from 'three';

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
import { createPlanets, applyPlanetSnapshot, updatePlanetAnimations } from './rendering/objects/planets';
import { createNatalChartView, disposeNatalChartView, updateNatalChartView } from './rendering/objects/natal-chart';
import {
  applyConstellationVisualState,
  updateHover,
  handleConstellationHover,
  handlePlanetHover,
  type ConstellationDisplayState,
} from './ui/interaction';
import { getControlElements, parseSkyStateFromControls, handlePlaceSearch } from './ui/controls';
import { getTimeZoneForCoordinates, reverseGeocode } from './astronomy/geolocation';
import { createCelestialSnapshot } from './astronomy/celestial-snapshot';
import { startIntroZoom, updateIntroZoom } from './animation/intro-zoom';
import { shouldAutoRotate, updateAutoRotate } from './animation/auto-rotation';
import { applyRotationMatrixToGroup } from './astronomy/calculations';

import { SPHERE, ANIMATION } from './config/constants';
import { DEFAULT_OBSERVER } from './config/defaults';

import type {
  CelestialSnapshot,
  SkyState,
  IntroAnimState,
  ConstellationState,
  PlanetState,
  ResolvedPlace,
} from './types';

type ViewMode = 'orb' | 'natal2d';

const GRATICULE_STEP = SPHERE.graticulStep;
const GRATICULE_SEGMENTS = SPHERE.graticuleSegments;

const DEFAULT_SKY_STATE = DEFAULT_OBSERVER;

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

const graticule = createGraticule(GRATICULE_STEP, GRATICULE_SEGMENTS);
const equator = createEquator();
skyGroup.add(graticule);
skyGroup.add(equator);

// --- State ---

let starPoints: THREE.Points | null = null;
let zodiacPoints: THREE.Points | null = null;
const constellations: ConstellationState[] = [];
const planets: PlanetState[] = [];
const natalChart = createNatalChartView();
scene.add(natalChart.group);
let hoveredAbbrev: string | null = null;
let hoveredPlanetName: string | null = null;
let currentSkyState: SkyState = { ...DEFAULT_SKY_STATE };
let currentSnapshot: CelestialSnapshot | null = null;
let viewMode: ViewMode = 'orb';
let savedOrbCameraPosition: THREE.Vector3 | null = null;
let savedOrbCameraQuaternion: THREE.Quaternion | null = null;
let introAnim: IntroAnimState | null = null;
let enableRotation = true;
const displayState: ConstellationDisplayState & {
  showGraticule: boolean;
  showEquator: boolean;
  showPlanets: boolean;
} = {
  showGraticule: true,
  showEquator: true,
  showZodiacLines: true,
  showOtherConstellationLines: false,
  showConstellationStars: true,
  showPlanets: true,
};

// --- Utility Functions ---

function formatLocationDetails(state: SkyState): string {
  return `${state.latitude.toFixed(4)}, ${state.longitude.toFixed(4)} | ${state.timeZone} | ${state.elevation} m`;
}

function updateResolvedPlace(place: ResolvedPlace): void {
  currentSkyState = {
    ...currentSkyState,
    placeName: place.name,
    latitude: place.latitude,
    longitude: place.longitude,
    timeZone: place.timeZone,
  };
  uiElements.locationStatus.textContent = 'Resolved from place search';
  uiElements.locationDetails.textContent = formatLocationDetails(currentSkyState);
}

function updateSummary(snapshot: CelestialSnapshot) {
  const date = new Date(snapshot.time.epochMs);
  const timeZone = snapshot.time.timeZone;
  const dateStr = date.toLocaleString('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timeStr = date.toLocaleString('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
  uiElements.skySummary.textContent = `${snapshot.observer.placeName} | ${dateStr} ${timeStr} ${snapshot.time.offsetLabel} | Elev: ${snapshot.observer.elevation}m`;
}

function setViewButtonState(mode: ViewMode): void {
  const isOrb = mode === 'orb';
  uiElements.viewOrbButton.classList.toggle('active', isOrb);
  uiElements.viewNatal2dButton.classList.toggle('active', !isOrb);
  uiElements.viewOrbButton.setAttribute('aria-pressed', String(isOrb));
  uiElements.viewNatal2dButton.setAttribute('aria-pressed', String(!isOrb));
}

function applyDisplayState(): void {
  graticule.visible = displayState.showGraticule;
  equator.visible = displayState.showEquator;
  planetGroup.visible = displayState.showPlanets;
  if (!displayState.showPlanets) {
    hoveredPlanetName = handlePlanetHover(null, hoveredPlanetName, planets);
  }
  applyConstellationVisualState(constellations, zodiacPoints, hoveredAbbrev, displayState);
}

function clearHoverState(): void {
  hoveredAbbrev = handleConstellationHover(null, hoveredAbbrev, constellations, zodiacPoints, displayState);
  hoveredPlanetName = handlePlanetHover(null, hoveredPlanetName, planets);
}

function setViewMode(mode: ViewMode): void {
  if (mode === viewMode) return;

  clearHoverState();
  introAnim = null;
  viewMode = mode;
  setViewButtonState(mode);

  if (mode === 'natal2d') {
    savedOrbCameraPosition = camera.position.clone();
    savedOrbCameraQuaternion = camera.quaternion.clone();
    if (currentSnapshot) updateNatalChartView(natalChart, currentSnapshot);

    skyGroup.visible = false;
    natalChart.group.visible = true;
    controls.enabled = false;
    camera.position.set(0, 0, 190);
    camera.quaternion.identity();
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    return;
  }

  natalChart.group.visible = false;
  skyGroup.visible = true;
  controls.enabled = true;
  if (savedOrbCameraPosition && savedOrbCameraQuaternion) {
    camera.position.copy(savedOrbCameraPosition);
    camera.quaternion.copy(savedOrbCameraQuaternion);
  }
  controls.update();
}

async function applySkyState(state: SkyState) {
  const snapshot = createCelestialSnapshot(state);
  currentSkyState = { ...state };
  currentSnapshot = snapshot;

  uiElements.placeNameInput.value = snapshot.observer.placeName;
  uiElements.dateInput.value = snapshot.time.localDate;
  uiElements.timeInput.value = snapshot.time.localTime;
  uiElements.elevationInput.value = String(snapshot.observer.elevation);
  uiElements.locationDetails.textContent = formatLocationDetails(currentSkyState);

  updateSummary(snapshot);
  applyPlanetSnapshot(planets, snapshot);
  updateNatalChartView(natalChart, snapshot);
  applyRotationMatrixToGroup(skyGroup, snapshot.frames.equatorialToRenderMatrix);
  applyDisplayState();
}

// --- Event Handlers ---

const handleMouseMove = (e: Event) => {
  if (viewMode !== 'orb') {
    clearHoverState();
    return;
  }

  const me = e as MouseEvent;
  const rect = renderer.domElement.getBoundingClientRect();
  const isOverCanvas = me.clientX >= rect.left && me.clientX <= rect.right &&
                       me.clientY >= rect.top && me.clientY <= rect.bottom;

  if (isOverCanvas) {
    updateHover(me.clientX, me.clientY, camera, constellations, displayState.showPlanets ? planets : [], (abbrev) => {
      hoveredAbbrev = handleConstellationHover(abbrev, hoveredAbbrev, constellations, zodiacPoints, displayState);
    }, (name) => {
      hoveredPlanetName = handlePlanetHover(name, hoveredPlanetName, planets);
    });
  } else {
    // Clear hover when cursor is over UI or outside canvas
    clearHoverState();
  }
};

const handleTouchMove = (e: Event) => {
  if (viewMode !== 'orb') {
    clearHoverState();
    return;
  }

  const te = e as TouchEvent;
  if (te.touches.length > 0) {
    updateHover(te.touches[0].clientX, te.touches[0].clientY, camera, constellations, displayState.showPlanets ? planets : [], (abbrev) => {
      hoveredAbbrev = handleConstellationHover(abbrev, hoveredAbbrev, constellations, zodiacPoints, displayState);
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
    await handlePlaceSearch(uiElements.placeNameInput.value, uiElements, updateResolvedPlace);
  });

  uiElements.useMyLocationButton.addEventListener('click', async () => {
    uiElements.locationStatus.textContent = 'Getting location...';
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        let placeName = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`;
        try {
          const reversedPlace = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
          placeName = reversedPlace;
        } catch {
          // use fallback coordinates above
        }
        const elevation = Math.round(pos.coords.altitude || 0);
        uiElements.placeNameInput.value = placeName;
        uiElements.elevationInput.value = String(elevation);
        currentSkyState = {
          ...currentSkyState,
          placeName,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          elevation,
          timeZone: getTimeZoneForCoordinates(pos.coords.latitude, pos.coords.longitude),
        };
        uiElements.locationStatus.textContent = '';
        uiElements.locationDetails.textContent = formatLocationDetails(currentSkyState);
      },
      () => {
        uiElements.locationStatus.textContent = 'Location access denied.';
      }
    );
  });

  uiElements.skyControls.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newState = parseSkyStateFromControls(uiElements, currentSkyState);
    await applySkyState(newState);
    enableRotation = uiElements.enableRotationCheckbox.checked;
  });

  uiElements.viewOrbButton.addEventListener('click', () => setViewMode('orb'));
  uiElements.viewNatal2dButton.addEventListener('click', () => setViewMode('natal2d'));

  const wireDisplayCheckbox = (
    checkbox: HTMLInputElement,
    key: keyof typeof displayState
  ) => {
    checkbox.addEventListener('change', () => {
      displayState[key] = checkbox.checked;
      applyDisplayState();
    });
  };

  wireDisplayCheckbox(uiElements.toggleGraticuleCheckbox, 'showGraticule');
  wireDisplayCheckbox(uiElements.toggleEquatorCheckbox, 'showEquator');
  wireDisplayCheckbox(uiElements.toggleZodiacLinesCheckbox, 'showZodiacLines');
  wireDisplayCheckbox(uiElements.toggleOtherConstellationLinesCheckbox, 'showOtherConstellationLines');
  wireDisplayCheckbox(uiElements.toggleConstellationStarsCheckbox, 'showConstellationStars');
  wireDisplayCheckbox(uiElements.togglePlanetsCheckbox, 'showPlanets');

  // Apply initial sky state
  setViewButtonState(viewMode);
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
  } else if (viewMode === 'orb') {
    controls.update();
    const cameraDistance = camera.position.length();
    updateAutoRotate(controls, enableRotation && shouldAutoRotate(cameraDistance));
  }

  const elapsed = animationClock.getElapsedTime();

  // t=0 fully zoomed in (dist=8), t=1 fully zoomed out (dist=200)
  const dist = camera.position.length();
  const t = Math.max(0, Math.min(1, (dist - 8) / (200 - 8)));

  starMaterial.uniforms['magThreshold'].value = 9.0 - t * 3.1;
  starMaterial.uniforms['brightnessMult'].value = 1.0 - t * 0.4;
  starMaterial.uniforms['sizeMult'].value = 1.0 - t * 0.32;
  bloomPass.strength = 0.2 - t * 0.14;

  if (viewMode === 'orb') {
    updatePlanetAnimations(planets, elapsed);
  }

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
  disposeNatalChartView(natalChart);

  disposeScene(setup);
}

if (import.meta.hot) {
  import.meta.hot.dispose(dispose);
}

// Start initialization
init();
