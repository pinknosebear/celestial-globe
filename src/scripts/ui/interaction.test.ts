import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { applyConstellationVisualState, type ConstellationDisplayState } from './interaction';
import type { ConstellationState } from '../types';

function makeConstellation(abbrev: string, isZodiac: boolean, starIndex: number): ConstellationState {
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]),
    new THREE.LineBasicMaterial()
  );
  return {
    abbrev,
    name: abbrev,
    isZodiac,
    starIndices: [starIndex],
    baseSizes: new Float32Array([2]),
    baseBrightnesses: new Float32Array([0.3]),
    lines: [line],
    mats: [line.material as THREE.LineBasicMaterial],
    label: {
      visible: false,
      element: { style: { display: 'none' } },
    } as any,
    labelAnchor: new THREE.Object3D(),
    hitMesh: new THREE.Mesh(),
    baseLineVisible: isZodiac,
    hoverLineVisible: false,
  };
}

function makePoints(): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('starSize', new THREE.BufferAttribute(new Float32Array([2, 2]), 1));
  geometry.setAttribute('brightness', new THREE.BufferAttribute(new Float32Array([0.3, 0.3]), 1));
  return new THREE.Points(geometry, new THREE.PointsMaterial());
}

const displayState: ConstellationDisplayState = {
  showZodiacLines: true,
  showOtherConstellationLines: false,
  showConstellationStars: true,
};

describe('applyConstellationVisualState', () => {
  it('shows zodiac lines and hides non-zodiac lines by default', () => {
    const zodiac = makeConstellation('Ari', true, 0);
    const other = makeConstellation('Ori', false, 1);

    applyConstellationVisualState([zodiac, other], makePoints(), null, displayState);

    expect(zodiac.lines[0].visible).toBe(true);
    expect(other.lines[0].visible).toBe(false);
  });

  it('reveals hovered non-zodiac lines and label', () => {
    const zodiac = makeConstellation('Ari', true, 0);
    const other = makeConstellation('Ori', false, 1);

    applyConstellationVisualState([zodiac, other], makePoints(), 'Ori', displayState);

    expect(other.lines[0].visible).toBe(true);
    expect(other.label.visible).toBe(true);
    expect(other.label.element.style.display).toBe('block');
  });

  it('brightens hovered constellation stars and restores them after hover', () => {
    const zodiac = makeConstellation('Ari', true, 0);
    const other = makeConstellation('Ori', false, 1);
    const points = makePoints();
    const sizeAttr = points.geometry.attributes['starSize'] as THREE.BufferAttribute;
    const brightAttr = points.geometry.attributes['brightness'] as THREE.BufferAttribute;

    applyConstellationVisualState([zodiac, other], points, 'Ari', displayState);
    expect(sizeAttr.getX(0)).toBe(5);
    expect(brightAttr.getX(0)).toBeCloseTo(0.6);

    applyConstellationVisualState([zodiac, other], points, null, displayState);
    expect(sizeAttr.getX(0)).toBe(2);
    expect(brightAttr.getX(0)).toBeCloseTo(0.3);
  });
});
