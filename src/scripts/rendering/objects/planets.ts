/**
 * Planets — planet rendering (sprites, labels, position updates).
 */

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { PLANETS, SPHERE } from '../../config/constants';
import { createPlanetSpriteMaterial } from '../materials';
import type { CelestialSnapshot, PlanetState } from '../../types';

/**
 * Create planet objects from configuration.
 */
export function createPlanets(planetGroup: THREE.Group): PlanetState[] {
  const planets: PlanetState[] = [];

  for (const planetDef of PLANETS) {
    const spriteMaterial = createPlanetSpriteMaterial(planetDef.color, planetDef.glyph);
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.setScalar(planetDef.size);
    (sprite.userData as any).planetName = planetDef.name;
    planetGroup.add(sprite);

    const div = document.createElement('div');
    div.className = 'planet-label';
    div.textContent = planetDef.name;
    const label = new CSS2DObject(div);
    label.position.set(0, 0, 0);
    label.visible = false;
    sprite.add(label);

    planets.push({
      id: planetDef.id,
      name: planetDef.name,
      baseSize: planetDef.size,
      currentScale: planetDef.size,
      pulsePhase: Math.random() * Math.PI * 2,
      pulseSpeed: 0.85 + Math.random() * 0.7,
      spinSpeed: (Math.random() * 0.12 + 0.04) * (Math.random() > 0.5 ? 1 : -1),
      sprite,
      label,
    });
  }

  return planets;
}

/**
 * Apply immutable snapshot positions to planet sprites.
 */
export function applyPlanetSnapshot(
  planets: PlanetState[],
  snapshot: CelestialSnapshot
): void {
  for (const planet of planets) {
    const body = snapshot.bodiesById[planet.id];
    if (!body) {
      planet.sprite.visible = false;
      continue;
    }

    const unit = body.apparent.equatorial.unitVector;
    const position = new THREE.Vector3(
      unit[0] * (SPHERE.radius - 1),
      unit[1] * (SPHERE.radius - 1),
      unit[2] * (SPHERE.radius - 1)
    );
    const scale = THREE.MathUtils.clamp(
      planet.baseSize + (2.5 - body.illumination.magnitude) * 0.35,
      5.5,
      15
    );

    planet.sprite.position.copy(position);
    planet.currentScale = scale;
    planet.sprite.scale.setScalar(scale);
    planet.sprite.visible = true;
  }
}

/**
 * Update planet animations (pulse, spin).
 */
export function updatePlanetAnimations(planets: PlanetState[], elapsed: number): void {
  for (const planet of planets) {
    const pulse = 1 + Math.sin(elapsed * planet.pulseSpeed + planet.pulsePhase) * 0.035;
    planet.sprite.scale.setScalar(planet.currentScale * pulse);
    (planet.sprite.material as THREE.SpriteMaterial).rotation += planet.spinSpeed * 0.0025;
  }
}
