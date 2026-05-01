/**
 * Interaction — hover detection, raycasting, constellation/planet selection.
 */

import * as THREE from 'three';
import type { ConstellationState, PlanetState } from '../types';

export interface ConstellationDisplayState {
  showZodiacLines: boolean;
  showOtherConstellationLines: boolean;
  showConstellationStars: boolean;
}

const HOVER_SIZE_MULTIPLIER = 2.5;
const HOVER_BRIGHTNESS_MULTIPLIER = 2.0;

function setLabelVisible(constellation: ConstellationState, visible: boolean): void {
  constellation.label.visible = visible;
  constellation.label.element.style.display = visible ? 'block' : 'none';
}

function selectHoveredConstellation(
  hits: THREE.Intersection[],
  constellations: ConstellationState[]
): string | null {
  const byAbbrev = new Map(constellations.map((constellation) => [constellation.abbrev, constellation]));
  const hitConstellations = hits
    .map((hit) => byAbbrev.get((hit.object.userData as any).abbrev as string))
    .filter((constellation): constellation is ConstellationState => Boolean(constellation));
  const zodiacHit = hitConstellations.find((constellation) => constellation.isZodiac);

  return (zodiacHit ?? hitConstellations[0])?.abbrev ?? null;
}

export function applyConstellationVisualState(
  constellations: ConstellationState[],
  zodiacPoints: THREE.Points | null,
  hoveredAbbrev: string | null,
  displayState: ConstellationDisplayState
): void {
  for (const constellation of constellations) {
    const isHovered = constellation.abbrev === hoveredAbbrev;
    const baseLineVisible = constellation.isZodiac
      ? displayState.showZodiacLines
      : displayState.showOtherConstellationLines;

    constellation.baseLineVisible = baseLineVisible;
    constellation.hoverLineVisible = isHovered;
    for (const line of constellation.lines) {
      line.visible = baseLineVisible || isHovered;
    }
    setLabelVisible(constellation, isHovered);
  }

  if (!zodiacPoints) return;

  zodiacPoints.visible = displayState.showConstellationStars;
  const sizeAttr = zodiacPoints.geometry.attributes['starSize'] as THREE.BufferAttribute;
  const brightAttr = zodiacPoints.geometry.attributes['brightness'] as THREE.BufferAttribute;

  for (const constellation of constellations) {
    const isHovered = constellation.abbrev === hoveredAbbrev;
    for (let i = 0; i < constellation.starIndices.length; i++) {
      const si = constellation.starIndices[i];
      const size = isHovered
        ? constellation.baseSizes[i] * HOVER_SIZE_MULTIPLIER
        : constellation.baseSizes[i];
      const brightness = isHovered
        ? Math.min(1.0, constellation.baseBrightnesses[i] * HOVER_BRIGHTNESS_MULTIPLIER)
        : constellation.baseBrightnesses[i];
      sizeAttr.setX(si, size);
      brightAttr.setX(si, brightness);
    }
  }

  sizeAttr.needsUpdate = true;
  brightAttr.needsUpdate = true;
}

/**
 * Update hover state based on mouse/touch position.
 */
export function updateHover(
  clientX: number,
  clientY: number,
  camera: THREE.Camera,
  constellations: ConstellationState[],
  planets: PlanetState[],
  onConstellationHover: (abbrev: string | null) => void,
  onPlanetHover: (name: string | null) => void
): void {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  mouse.x = (clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  // Raycast against all constellations (both zodiac and non-zodiac)
  const hitMeshes = constellations.map(c => c.hitMesh);
  const hits = raycaster.intersectObjects(hitMeshes);
  const planetHits = raycaster.intersectObjects(planets.map(p => p.sprite), false);

  const newHovered = selectHoveredConstellation(hits, constellations);
  const newHoveredPlanet = planetHits.length > 0 ? ((planetHits[0].object.userData as any).planetName as string) : null;

  onConstellationHover(newHovered);
  onPlanetHover(newHoveredPlanet);
}

/**
 * Handle constellation hover state change.
 */
export function handleConstellationHover(
  newHovered: string | null,
  prevHovered: string | null,
  constellations: ConstellationState[],
  zodiacPoints: THREE.Points | null,
  displayState: ConstellationDisplayState
): string | null {
  if (newHovered !== prevHovered) {
    applyConstellationVisualState(constellations, zodiacPoints, newHovered, displayState);
  }

  return newHovered;
}

/**
 * Handle planet hover state change.
 * Shows the planet label when hovering.
 */
export function handlePlanetHover(
  newHoveredPlanet: string | null,
  prevHoveredPlanet: string | null,
  planets: PlanetState[]
): string | null {
  if (newHoveredPlanet !== prevHoveredPlanet) {
    for (const planet of planets) {
      planet.label.visible = planet.name === newHoveredPlanet;
    }
  }

  return newHoveredPlanet;
}
