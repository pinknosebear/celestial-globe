/**
 * Stars — star point cloud rendering.
 */

import * as THREE from 'three';
import { SPHERE, STARS } from '../../config/constants';
import type { StarData } from '../../types';

/**
 * Calculate visual properties for a star based on magnitude.
 */
export function getStarVisuals(mag: number, layer: 'regular' | 'zodiac') {
  const prominence = THREE.MathUtils.clamp((8.5 - mag) / 10.5, 0, 1);
  const sizeCurve = Math.pow(prominence, STARS.sizeCurve);
  const brightnessCurve = Math.pow(prominence, STARS.brightnessCurve);

  if (layer === 'zodiac') {
    return {
      size: STARS.zodiacLayer.baseSizeMin + sizeCurve * (STARS.zodiacLayer.baseSizeMax - STARS.zodiacLayer.baseSizeMin),
      brightness: Math.min(1.0, STARS.zodiacLayer.baseBrightnessMin + brightnessCurve * (STARS.zodiacLayer.baseBrightnessMax - STARS.zodiacLayer.baseBrightnessMin)),
    };
  }

  return {
    size: STARS.regularLayer.baseSizeMin + sizeCurve * (STARS.regularLayer.baseSizeMax - STARS.regularLayer.baseSizeMin),
    brightness: Math.min(1.0, STARS.regularLayer.baseBrightnessMin + brightnessCurve * (STARS.regularLayer.baseBrightnessMax - STARS.regularLayer.baseBrightnessMin)),
  };
}

/**
 * Load stars from JSON and prepare geometry data.
 */
export async function loadStars(): Promise<{ positions: Float32Array; mags: Float32Array; count: number }> {
  const res = await fetch('/stars.json');
  const data: StarData = await res.json();
  const total = data.x.length;

  const positions = new Float32Array(total * 3);
  const mags = new Float32Array(total);
  const sizes = new Float32Array(total);
  const brightnesses = new Float32Array(total);

  let vi = 0;
  for (let i = 0; i < total; i++) {
    const mag = data.mag[i];
    if (mag < STARS.minMagnitude) continue;
    const visuals = getStarVisuals(mag, 'regular');

    positions[vi * 3] = data.x[i] * SPHERE.radius;
    positions[vi * 3 + 1] = data.y[i] * SPHERE.radius;
    positions[vi * 3 + 2] = data.z[i] * SPHERE.radius;
    mags[vi] = mag;
    sizes[vi] = visuals.size;
    brightnesses[vi] = visuals.brightness;
    vi++;
  }

  return {
    positions: positions.subarray(0, vi * 3),
    mags: mags.subarray(0, vi),
    count: vi,
  };
}

/**
 * Create star points geometry.
 */
export function createStarGeometry(
  positions: Float32Array,
  mags: Float32Array,
  visuals: Array<{ size: number; brightness: number }>
): THREE.BufferGeometry {
  const sizes = new Float32Array(visuals.map(v => v.size));
  const brightnesses = new Float32Array(visuals.map(v => v.brightness));

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('starSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('brightness', new THREE.BufferAttribute(brightnesses, 1));
  geo.setAttribute('mag', new THREE.BufferAttribute(mags, 1));

  return geo;
}
