import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { PLANETS } from '../../config/constants';
import { formatZodiacLongitude, normalizeDegrees } from '../../astronomy/zodiac-format';
import type { CelestialBodyId, CelestialSnapshot } from '../../types';

const SIGN_LABELS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const OUTER_RADIUS = 92;
const INNER_RADIUS = 58;
const SIGN_LABEL_RADIUS = 78;
const PLANET_BASE_RADIUS = 44;
const PLANET_LANE_SPACING = 7;
const PLANET_MIN_SEPARATION_DEG = 7;

export interface NatalChartView {
  group: THREE.Group;
  dynamicGroup: THREE.Group;
}

export interface NatalLayoutBody {
  id: CelestialBodyId;
  longitudeDeg: number;
}

export interface NatalPlanetLayoutItem extends NatalLayoutBody {
  lane: number;
  radius: number;
  x: number;
  y: number;
  labelX: number;
  labelY: number;
}

function chartAngleRad(longitudeDeg: number): number {
  return ((90 - normalizeDegrees(longitudeDeg)) * Math.PI) / 180;
}

function chartPoint(longitudeDeg: number, radius: number): THREE.Vector3 {
  const angle = chartAngleRad(longitudeDeg);
  return new THREE.Vector3(
    Math.cos(angle) * radius,
    Math.sin(angle) * radius,
    0
  );
}

function createCircle(radius: number, color: string, opacity = 0.55): THREE.LineLoop {
  const points = Array.from({ length: 192 }, (_, index) => {
    const angle = (index / 192) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
  });
  return new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity })
  );
}

function createLine(from: THREE.Vector3, to: THREE.Vector3, color: string, opacity = 0.45): THREE.Line {
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([from, to]),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity })
  );
}

function createTextLabel(text: string, className: string, position: THREE.Vector3): CSS2DObject {
  const div = document.createElement('div');
  div.className = className;
  div.textContent = text;
  const label = new CSS2DObject(div);
  label.position.copy(position);
  return label;
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const disposable = child as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
      element?: HTMLElement;
    };
    disposable.geometry?.dispose();
    if (Array.isArray(disposable.material)) {
      disposable.material.forEach((material) => material.dispose());
    } else {
      disposable.material?.dispose();
    }
    disposable.element?.remove();
  });
}

function clearGroup(group: THREE.Group): void {
  for (const child of [...group.children]) {
    disposeObject(child);
    group.remove(child);
  }
}

export function computeNatalPlanetLayout(
  bodies: readonly NatalLayoutBody[],
  baseRadius = PLANET_BASE_RADIUS,
  laneSpacing = PLANET_LANE_SPACING,
  minSeparationDeg = PLANET_MIN_SEPARATION_DEG
): NatalPlanetLayoutItem[] {
  if (bodies.length === 0) return [];

  const sorted = bodies
    .map((body) => ({ ...body, longitudeDeg: normalizeDegrees(body.longitudeDeg) }))
    .sort((a, b) => a.longitudeDeg - b.longitudeDeg);

  let largestGapIndex = 0;
  let largestGap = -1;
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i].longitudeDeg;
    const next = sorted[(i + 1) % sorted.length].longitudeDeg;
    const gap = (next - current + 360) % 360;
    if (gap > largestGap) {
      largestGap = gap;
      largestGapIndex = i;
    }
  }

  const startIndex = (largestGapIndex + 1) % sorted.length;
  const ordered = Array.from({ length: sorted.length }, (_, index) => sorted[(startIndex + index) % sorted.length]);
  const startLongitude = ordered[0].longitudeDeg;
  const laneLastLongitude: number[] = [];

  return ordered.map((body) => {
    const unwrappedLongitude = body.longitudeDeg < startLongitude
      ? body.longitudeDeg + 360
      : body.longitudeDeg;
    let lane = 0;
    while (
      laneLastLongitude[lane] !== undefined &&
      unwrappedLongitude - laneLastLongitude[lane] < minSeparationDeg
    ) {
      lane++;
    }
    laneLastLongitude[lane] = unwrappedLongitude;

    const radius = baseRadius - lane * laneSpacing;
    const point = chartPoint(body.longitudeDeg, radius);
    const labelPoint = chartPoint(body.longitudeDeg, radius - 10);

    return {
      ...body,
      lane,
      radius,
      x: point.x,
      y: point.y,
      labelX: labelPoint.x,
      labelY: labelPoint.y,
    };
  });
}

export function createNatalChartView(): NatalChartView {
  const group = new THREE.Group();
  group.name = 'natal-chart';
  group.visible = false;

  group.add(createCircle(OUTER_RADIUS, '#d8c78f', 0.68));
  group.add(createCircle(INNER_RADIUS, '#d8c78f', 0.35));
  group.add(createCircle(PLANET_BASE_RADIUS + 7, '#6f8795', 0.28));

  for (let sign = 0; sign < 12; sign++) {
    const longitude = sign * 30;
    group.add(createLine(
      chartPoint(longitude, INNER_RADIUS),
      chartPoint(longitude, OUTER_RADIUS),
      '#d8c78f',
      0.45
    ));
    group.add(createTextLabel(
      SIGN_LABELS[sign],
      'natal-sign-label',
      chartPoint(longitude + 15, SIGN_LABEL_RADIUS)
    ));
  }

  const dynamicGroup = new THREE.Group();
  dynamicGroup.name = 'natal-chart-planets';
  group.add(dynamicGroup);

  return { group, dynamicGroup };
}

export function updateNatalChartView(view: NatalChartView, snapshot: CelestialSnapshot): void {
  clearGroup(view.dynamicGroup);

  const planetDefs = new Map(PLANETS.map((planet) => [planet.id, planet]));
  const layout = computeNatalPlanetLayout(snapshot.bodies.map((body) => ({
    id: body.id,
    longitudeDeg: body.astrology.ecliptic.longitudeDeg,
  })));

  for (const item of layout) {
    const body = snapshot.bodiesById[item.id];
    const planetDef = planetDefs.get(item.id);
    if (!body || !planetDef) continue;

    const markerPosition = new THREE.Vector3(item.x, item.y, 0);
    const labelPosition = new THREE.Vector3(item.labelX, item.labelY, 0);
    const retrogradeMarker = body.astrology.retrograde ? ' ℞' : '';
    const glyph = createTextLabel(planetDef.glyph, 'natal-planet-glyph', markerPosition);
    const label = createTextLabel(
      `${body.name} ${formatZodiacLongitude(body.astrology.ecliptic.longitudeDeg)}${retrogradeMarker}`,
      'natal-planet-label',
      labelPosition
    );

    view.dynamicGroup.add(createLine(
      chartPoint(body.astrology.ecliptic.longitudeDeg, INNER_RADIUS),
      markerPosition,
      '#6f8795',
      0.22
    ));
    view.dynamicGroup.add(glyph);
    view.dynamicGroup.add(label);
  }
}

export function disposeNatalChartView(view: NatalChartView): void {
  disposeObject(view.group);
}
