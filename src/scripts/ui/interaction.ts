/**
 * Interaction — hover detection, raycasting, constellation/planet selection.
 */

import * as THREE from 'three';
import { CONSTELLATIONS } from '../config/constants';
import type { ConstellationState, PlanetState } from '../types';

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

  const newHovered = hits.length > 0 ? ((hits[0].object.userData as any).abbrev as string) : null;
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
  zodiacPoints: THREE.Points | null
): string | null {
  if (newHovered !== prevHovered) {
    // Hide all labels first
    for (const constellation of constellations) {
      constellation.label.visible = false;
      if (constellation.label.element) {
        constellation.label.element.style.display = 'none';
      }
    }

    if (!zodiacPoints) return newHovered;

    const isZodiac = newHovered && CONSTELLATIONS.zodiacSet.includes(newHovered as any);
    const sizeAttr = zodiacPoints.geometry.attributes['starSize'] as THREE.BufferAttribute;
    const brightAttr = zodiacPoints.geometry.attributes['brightness'] as THREE.BufferAttribute;

    // Always restore all stars to base brightness first (clear any previous zodiac boost)
    for (const constellation of constellations) {
      for (let i = 0; i < constellation.starIndices.length; i++) {
        const si = constellation.starIndices[i];
        sizeAttr.setX(si, constellation.baseSizes[i]);
        brightAttr.setX(si, constellation.baseBrightnesses[i]);
      }
    }

    if (newHovered && isZodiac) {
      // Zodiac constellation: brighten stars and show label
      const next = constellations.find(c => c.abbrev === newHovered)!;

      for (let i = 0; i < next.starIndices.length; i++) {
        const si = next.starIndices[i];
        sizeAttr.setX(si, next.baseSizes[i] * 2.5);
        brightAttr.setX(si, Math.min(1.0, next.baseBrightnesses[i] * 2.0));
      }

      next.label.visible = true;
      if (next.label.element) {
        next.label.element.style.display = 'block';
      }
    } else if (newHovered && !isZodiac) {
      // Non-zodiac constellation: show label only (no brightness/size boost)
      const next = constellations.find(c => c.abbrev === newHovered)!;
      next.label.visible = true;
      if (next.label.element) {
        next.label.element.style.display = 'block';
      }
    }

    sizeAttr.needsUpdate = true;
    brightAttr.needsUpdate = true;
  }

  return newHovered;
}

/**
 * Handle planet hover state change.
 */
export function handlePlanetHover(
  newHoveredPlanet: string | null,
  prevHoveredPlanet: string | null,
  planets: PlanetState[]
): string | null {
  if (newHoveredPlanet !== prevHoveredPlanet) {
    for (const planet of planets) {
      if (planet.name === newHoveredPlanet) {
        planet.label.visible = true;
        if ((planet.label as any).infoSpan && planet.signName !== undefined && planet.degreeInSign !== undefined) {
          const retroSign = planet.retrograde ? '℞ ' : '';
          (planet.label as any).infoSpan.textContent = `${retroSign}${planet.degreeInSign.toFixed(1)}° ${planet.signName}`;
        }
      } else {
        planet.label.visible = false;
      }
    }
  }

  return newHoveredPlanet;
}
