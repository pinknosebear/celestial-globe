/**
 * Interaction — hover detection, raycasting, constellation/planet selection.
 */

import * as THREE from 'three';
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
    if (prevHovered && zodiacPoints) {
      const prev = constellations.find(c => c.abbrev === prevHovered)!;
      const sizeAttr = zodiacPoints.geometry.attributes['starSize'] as THREE.BufferAttribute;
      const brightAttr = zodiacPoints.geometry.attributes['brightness'] as THREE.BufferAttribute;
      for (let i = 0; i < prev.starIndices.length; i++) {
        const si = prev.starIndices[i];
        sizeAttr.setX(si, prev.baseSizes[i]);
        brightAttr.setX(si, prev.baseBrightnesses[i]);
      }
      sizeAttr.needsUpdate = true;
      brightAttr.needsUpdate = true;
      prev.label.visible = false;
    }

    if (newHovered && zodiacPoints) {
      const next = constellations.find(c => c.abbrev === newHovered)!;
      const sizeAttr = zodiacPoints.geometry.attributes['starSize'] as THREE.BufferAttribute;
      const brightAttr = zodiacPoints.geometry.attributes['brightness'] as THREE.BufferAttribute;
      for (let i = 0; i < next.starIndices.length; i++) {
        const si = next.starIndices[i];
        sizeAttr.setX(si, next.baseSizes[i] * 1.5);
        brightAttr.setX(si, Math.min(1.0, next.baseBrightnesses[i] * 1.2));
      }
      sizeAttr.needsUpdate = true;
      brightAttr.needsUpdate = true;
      next.label.visible = true;
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
