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

  // Only raycast against zodiac constellations (non-zodiac are disabled)
  const zodiacConstellations = constellations.filter(c =>
    CONSTELLATIONS.zodiacSet.includes(c.abbrev as any)
  );
  const hitMeshes = zodiacConstellations.map(c => c.hitMesh);
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
  // Only process zodiac constellations
  if (newHovered && !CONSTELLATIONS.zodiacSet.includes(newHovered as any)) {
    return prevHovered;
  }

  if (newHovered !== prevHovered) {
    if (!zodiacPoints) return newHovered;

    const sizeAttr = zodiacPoints.geometry.attributes['starSize'] as THREE.BufferAttribute;
    const brightAttr = zodiacPoints.geometry.attributes['brightness'] as THREE.BufferAttribute;

    if (newHovered) {
      // When hovering a zodiac sign: brighten that sign, show its label
      const next = constellations.find(c => c.abbrev === newHovered)!;

      // Hide all labels first
      for (const constellation of constellations) {
        constellation.label.visible = false;
        if (constellation.label.element) {
          constellation.label.element.style.display = 'none';
        }
      }

      // Brighten hovered zodiac constellation and show its label
      for (let i = 0; i < next.starIndices.length; i++) {
        const si = next.starIndices[i];
        sizeAttr.setX(si, next.baseSizes[i] * 2.5);
        brightAttr.setX(si, Math.min(1.0, next.baseBrightnesses[i] * 2.0));
      }

      sizeAttr.needsUpdate = true;
      brightAttr.needsUpdate = true;
      next.label.visible = true;
      if (next.label.element) {
        next.label.element.style.display = 'block';
      }
    } else {
      // When hover ends: restore all to base brightness and hide all labels
      for (const constellation of constellations) {
        constellation.label.visible = false;
        if (constellation.label.element) {
          constellation.label.element.style.display = 'none';
        }
      }

      for (const constellation of constellations) {
        for (let i = 0; i < constellation.starIndices.length; i++) {
          const si = constellation.starIndices[i];
          sizeAttr.setX(si, constellation.baseSizes[i]);
          brightAttr.setX(si, constellation.baseBrightnesses[i]);
        }
      }

      sizeAttr.needsUpdate = true;
      brightAttr.needsUpdate = true;
    }
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
      planet.label.visible = planet.name === newHoveredPlanet;
    }
  }

  return newHoveredPlanet;
}
