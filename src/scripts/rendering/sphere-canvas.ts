/**
 * Sphere Canvas — the sphere and all celestial objects rendered on it (stars, constellations, planets).
 * This is the main visual canvas where all astronomy data is plotted.
 */

import * as THREE from 'three';
import { SPHERE } from '../config/constants';
import { createGraticuleMaterial, createEquatorMaterial, createStarMaterial, createZodiacStarMaterial } from './materials';

/**
 * Create the sphere graticule (grid lines).
 */
export function createGraticule(
  graticuleStep: number,
  graticuleSegments: number
): THREE.Group {
  function makeLatitudeCircle(latDeg: number): THREE.LineLoop {
    const phi = (latDeg * Math.PI) / 180;
    const pts = Array.from({ length: graticuleSegments }, (_, i) => {
      const lon = (i / graticuleSegments) * Math.PI * 2;
      return new THREE.Vector3(
        SPHERE.radius * Math.cos(phi) * Math.cos(lon),
        SPHERE.radius * Math.sin(phi),
        SPHERE.radius * Math.cos(phi) * Math.sin(lon)
      );
    });
    return new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(pts),
      createGraticuleMaterial()
    );
  }

  function makeLongitudeMeridian(lonDeg: number): THREE.Line {
    const theta = (lonDeg * Math.PI) / 180;
    const pts = Array.from({ length: graticuleSegments }, (_, i) => {
      const lat = -Math.PI / 2 + (i / (graticuleSegments - 1)) * Math.PI;
      return new THREE.Vector3(
        SPHERE.radius * Math.cos(lat) * Math.cos(theta),
        SPHERE.radius * Math.sin(lat),
        SPHERE.radius * Math.cos(lat) * Math.sin(theta)
      );
    });
    return new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      createGraticuleMaterial()
    );
  }

  const graticuleGroup = new THREE.Group();
  for (let lat = -90 + graticuleStep; lat < 90; lat += graticuleStep) {
    graticuleGroup.add(makeLatitudeCircle(lat));
  }
  for (let lon = 0; lon < 360; lon += graticuleStep) {
    graticuleGroup.add(makeLongitudeMeridian(lon));
  }

  return graticuleGroup;
}

/**
 * Create equator highlight line.
 */
export function createEquator(): THREE.LineLoop {
  const graticuleSegments = SPHERE.graticuleSegments;
  const pts = Array.from({ length: graticuleSegments }, (_, i) => {
    const lon = (i / graticuleSegments) * Math.PI * 2;
    return new THREE.Vector3(
      SPHERE.radius * Math.cos(lon),
      0,
      SPHERE.radius * Math.sin(lon)
    );
  });
  return new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(pts),
    createEquatorMaterial()
  );
}

/**
 * Add graticule and equator to scene.
 */
export function addGridToScene(skyGroup: THREE.Group): void {
  skyGroup.add(createGraticule(SPHERE.graticulStep, SPHERE.graticuleSegments));
  skyGroup.add(createEquator());
}
