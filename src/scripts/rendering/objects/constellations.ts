/**
 * Constellations — constellation rendering (lines, labels, stars).
 */

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { SPHERE, CONSTELLATIONS } from '../../config/constants';
import { THEME } from '../../config/theme';
import { raDegDecDegToXYZ } from '../../astronomy/calculations';
import { getStarVisuals } from './stars';
import type { ZodiacData, ConstellationState } from '../../types';

/**
 * Load constellation data and match to catalog stars.
 */
export async function loadConstellations(
  starPositions: Float32Array,
  starMags: Float32Array,
  starCount: number,
  skyGroup: THREE.Group,
  zodiacStarMaterial: THREE.Material
): Promise<{
  zodiacPoints: THREE.Points;
  constellations: ConstellationState[];
}> {
  const res = await fetch('/zodiac.json');
  const zodiacData: ZodiacData = await res.json();

  // Star matching
  const zodiacMemberMap = new Map<string, Set<number>>();
  const MATCH_TOLERANCE_SQ = CONSTELLATIONS.starMatchTolerance;

  for (const [abbrev, entry] of Object.entries(zodiacData)) {
    const memberSet = new Set<number>();
    for (const segment of entry.lines) {
      for (const [raDeg, decDeg] of segment) {
        const target = raDegDecDegToXYZ(raDeg, decDeg, SPHERE.radius);
        let bestDist = Infinity;
        let bestIdx = -1;

        for (let i = 0; i < starCount; i++) {
          const dx = starPositions[i * 3] - target.x;
          const dy = starPositions[i * 3 + 1] - target.y;
          const dz = starPositions[i * 3 + 2] - target.z;
          const distSq = dx * dx + dy * dy + dz * dz;
          if (distSq < bestDist) {
            bestDist = distSq;
            bestIdx = i;
          }
        }
        if (bestIdx >= 0 && bestDist < MATCH_TOLERANCE_SQ) {
          memberSet.add(bestIdx);
        }
      }
    }
    zodiacMemberMap.set(abbrev, memberSet);
  }

  // Zodiac geometry
  const allZodiacIndices = new Set<number>();
  for (const s of zodiacMemberMap.values()) {
    for (const idx of s) allZodiacIndices.add(idx);
  }

  const zodiacCount = allZodiacIndices.size;
  const zPositions = new Float32Array(zodiacCount * 3);
  const zSizes = new Float32Array(zodiacCount);
  const zBrightnesses = new Float32Array(zodiacCount);
  const zCorenesses = new Float32Array(zodiacCount);

  let minMag = Infinity, maxMag = -Infinity;
  for (const idx of allZodiacIndices) {
    const m = starMags[idx];
    if (m < minMag) minMag = m;
    if (m > maxMag) maxMag = m;
  }
  const magRange = maxMag - minMag || 1;

  const globalToZodiac = new Map<number, number>();
  let zi = 0;
  for (const idx of allZodiacIndices) {
    const mag = starMags[idx];
    const visuals = getStarVisuals(mag, 'zodiac');
    zPositions[zi * 3] = starPositions[idx * 3];
    zPositions[zi * 3 + 1] = starPositions[idx * 3 + 1];
    zPositions[zi * 3 + 2] = starPositions[idx * 3 + 2];
    zSizes[zi] = visuals.size;
    zBrightnesses[zi] = visuals.brightness;
    zCorenesses[zi] = (maxMag - mag) / magRange;
    globalToZodiac.set(idx, zi);
    zi++;
  }

  const zodiacGeo = new THREE.BufferGeometry();
  zodiacGeo.setAttribute('position', new THREE.BufferAttribute(zPositions, 3));
  zodiacGeo.setAttribute('starSize', new THREE.BufferAttribute(zSizes.slice(), 1));
  zodiacGeo.setAttribute('brightness', new THREE.BufferAttribute(zBrightnesses.slice(), 1));
  zodiacGeo.setAttribute('coreness', new THREE.BufferAttribute(zCorenesses, 1));

  const zodiacPoints = new THREE.Points(zodiacGeo, zodiacStarMaterial);
  zodiacPoints.renderOrder = 1;
  skyGroup.add(zodiacPoints);

  // Build constellation state
  const constellations: ConstellationState[] = [];
  for (const [abbrev, entry] of Object.entries(zodiacData)) {
    const memberSet = zodiacMemberMap.get(abbrev)!;
    const starIndices = [...memberSet]
      .map(globalIdx => globalToZodiac.get(globalIdx)!)
      .filter(i => i !== undefined);

    const segLines: THREE.Line[] = [];
    const segMats: THREE.LineBasicMaterial[] = [];

    const isZodiac = CONSTELLATIONS.zodiacSet.includes(abbrev as any);

    for (const segment of entry.lines) {
      if (segment.length < 2) continue;
      const pts = segment.map((coord: number[]) =>
        raDegDecDegToXYZ(coord[0], coord[1], SPHERE.radius)
      );
      const lineColor = isZodiac ? THEME.colors.constellationLinesZodiac : THEME.colors.constellationLines;
      const lineMat = new THREE.LineBasicMaterial({
        color: lineColor,
        transparent: true,
        opacity: THEME.opacity.constellationLines,
        depthWrite: false,
      });
      const segLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        lineMat
      );
      skyGroup.add(segLine);
      segLines.push(segLine);
      segMats.push(lineMat);
    }

    const lineVertices: THREE.Vector3[] = [];
    for (const segment of entry.lines) {
      for (const [raDeg, decDeg] of segment) {
        lineVertices.push(raDegDecDegToXYZ(raDeg, decDeg, SPHERE.radius));
      }
    }

    let centroid = new THREE.Vector3();
    for (const v of lineVertices) centroid.add(v);
    centroid.divideScalar(lineVertices.length).normalize().multiplyScalar(SPHERE.radius);

    let maxDist = 0;
    for (const v of lineVertices) {
      const d = centroid.distanceTo(v);
      if (d > maxDist) maxDist = d;
    }
    const hitRadius = maxDist * 1.3 + 3;

    const hitMesh = new THREE.Mesh(
      new THREE.SphereGeometry(hitRadius, 8, 8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hitMesh.position.copy(centroid);
    (hitMesh.userData as any).abbrev = abbrev;
    skyGroup.add(hitMesh);

    const labelAnchor = new THREE.Object3D();
    labelAnchor.position.copy(
      raDegDecDegToXYZ(entry.labelCoords[0], entry.labelCoords[1], SPHERE.radius + 5)
    );
    skyGroup.add(labelAnchor);

    const div = document.createElement('div');
    div.className = 'zodiac-label';
    div.textContent = entry.name;
    const label = new CSS2DObject(div);
    label.visible = false;
    labelAnchor.add(label);

    constellations.push({
      abbrev,
      name: entry.name,
      starIndices,
      baseSizes: new Float32Array(starIndices.map(si => zSizes[si])),
      baseBrightnesses: new Float32Array(starIndices.map(si => zBrightnesses[si])),
      lines: segLines,
      mats: segMats,
      label,
      hitMesh,
    });
  }

  return { zodiacPoints, constellations };
}
