/**
 * Planets — planet rendering (sprites, labels, position updates).
 */

import * as Astronomy from 'astronomy-engine';
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { PLANETS, SPHERE } from '../../config/constants';
import {
  raDegDecDegToXYZ,
  getEclipticLongitude,
  isRetrograde,
  getZodiacSignInfo,
} from '../../astronomy/calculations';
import { createPlanetSpriteMaterial } from '../materials';
import type { SkyState, PlanetState } from '../../types';

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
    div.innerHTML = `<span class="planet-info"></span><span class="planet-name">${planetDef.glyph}</span>`;
    const label = new CSS2DObject(div);
    label.position.set(0, 0, 0);
    label.visible = false;
    sprite.add(label);
    (label as any).infoSpan = div.querySelector('.planet-info');

    planets.push({
      name: planetDef.name,
      body: (Astronomy.Body as any)[planetDef.name],
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
 * Update planet positions based on observer location and observation date.
 */
export function updatePlanetPositions(
  planets: PlanetState[],
  state: SkyState,
  observationDate: Date,
  observer: Astronomy.Observer
): void {
  for (const planet of planets) {
    const eq = Astronomy.Equator(planet.body, observationDate, observer, false, true);
    const position = raDegDecDegToXYZ(eq.ra * 15, eq.dec, SPHERE.radius - 1);
    const mag = Astronomy.Illumination(planet.body, observationDate).mag;
    const scale = THREE.MathUtils.clamp(planet.baseSize + (2.5 - mag) * 0.35, 5.5, 15);

    // Compute astrological ecliptic data
    const eclipticLon = getEclipticLongitude(planet.body, observationDate);
    const retrograde = isRetrograde(planet.body, observationDate);
    const zodiac = getZodiacSignInfo(eclipticLon);

    planet.sprite.position.copy(position);
    planet.currentScale = scale;
    planet.sprite.scale.setScalar(scale);
    planet.sprite.visible = true;
    planet.eclipticLongitude = eclipticLon;
    planet.retrograde = retrograde;
    planet.signName = zodiac.signName;
    planet.degreeInSign = zodiac.degreeInSign;
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
