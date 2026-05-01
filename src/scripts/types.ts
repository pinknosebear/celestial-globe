/**
 * TypeScript type definitions — shared across the app.
 */

import type * as THREE from 'three';
import type { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export interface SkyState {
  placeName: string;
  latitude: number;
  longitude: number;
  elevation: number;
  date: string;
  time: string;
  timeZone: string;
}

export type Vec3Tuple = readonly [number, number, number];
export type Matrix3Tuple = readonly [Vec3Tuple, Vec3Tuple, Vec3Tuple];
export type DeepReadonly<T> =
  T extends (...args: any[]) => unknown
    ? T
    : T extends readonly (infer U)[]
      ? readonly DeepReadonly<U>[]
      : T extends object
        ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
        : T;

export type CelestialBodyId =
  | 'Sun'
  | 'Moon'
  | 'Mercury'
  | 'Venus'
  | 'Mars'
  | 'Jupiter'
  | 'Saturn'
  | 'Uranus'
  | 'Neptune'
  | 'Pluto';

export type UnsupportedAstrologyPointId = 'Chiron' | 'NorthNode' | 'SouthNode';

export interface CelestialCoordinatesSnapshot {
  frame: string;
  rightAscensionHours?: number;
  rightAscensionDeg?: number;
  declinationDeg?: number;
  azimuthDeg?: number;
  altitudeDeg?: number;
  longitudeDeg?: number;
  latitudeDeg?: number;
  distanceAu: number;
  vectorAu: Vec3Tuple;
  unitVector: Vec3Tuple;
}

export interface ZodiacPositionSnapshot {
  frame: 'ECT';
  longitudeDeg: number;
  latitudeDeg: number;
  distanceAu: number;
  signName: string;
  degreeInSign: number;
}

export interface CelestialBodySnapshot {
  id: CelestialBodyId;
  name: string;
  apparent: {
    equatorial: CelestialCoordinatesSnapshot & {
      frame: 'EQJ';
      rightAscensionHours: number;
      rightAscensionDeg: number;
      declinationDeg: number;
    };
    horizontal: CelestialCoordinatesSnapshot & {
      frame: 'HOR';
      azimuthDeg: number;
      altitudeDeg: number;
    };
  };
  astrology: {
    ecliptic: ZodiacPositionSnapshot;
    retrograde: boolean;
    eclipticLongitudeVelocityDegPerDay: number;
  };
  illumination: {
    magnitude: number;
    phaseAngleDeg: number;
    phaseFraction: number;
  };
}

export interface UnsupportedAstrologyPointSnapshot {
  id: UnsupportedAstrologyPointId;
  reason: string;
}

export interface CelestialSnapshot {
  readonly version: 1;
  readonly input: DeepReadonly<SkyState>;
  readonly observer: DeepReadonly<{
    placeName: string;
    latitude: number;
    longitude: number;
    elevation: number;
    timeZone: string;
  }>;
  readonly time: DeepReadonly<{
    localDate: string;
    localTime: string;
    timeZone: string;
    utcIso: string;
    epochMs: number;
    offsetMinutes: number;
    offsetLabel: string;
    localSiderealTimeHours: number;
  }>;
  readonly frames: DeepReadonly<{
    eqjToHorizonMatrix: Matrix3Tuple;
    equatorialToRenderMatrix: Matrix3Tuple;
  }>;
  readonly bodies: readonly DeepReadonly<CelestialBodySnapshot>[];
  readonly bodiesById: DeepReadonly<Record<CelestialBodyId, CelestialBodySnapshot>>;
  readonly unavailableAstrologyPoints: readonly DeepReadonly<UnsupportedAstrologyPointSnapshot>[];
}

export interface ResolvedPlace {
  name: string;
  latitude: number;
  longitude: number;
  timeZone: string;
}

export interface StarData {
  x: number[];
  y: number[];
  z: number[];
  mag: number[];
  ci: number[];
}

export interface ZodiacEntry {
  name: string;
  labelCoords: [number, number]; // [ra_deg, dec_deg]
  lines: number[][][]; // array of segments, each segment is [[ra,dec], ...]
}

export type ZodiacData = Record<string, ZodiacEntry>;

export interface ConstellationState {
  abbrev: string;
  name: string;
  isZodiac: boolean;
  starIndices: number[];
  baseSizes: Float32Array;
  baseBrightnesses: Float32Array;
  lines: THREE.Line[];
  mats: THREE.LineBasicMaterial[];
  label: CSS2DObject;
  labelAnchor: THREE.Object3D;
  hitMesh: THREE.Mesh;
  baseLineVisible: boolean;
  hoverLineVisible: boolean;
}

export interface PlanetState {
  id: CelestialBodyId;
  name: string;
  baseSize: number;
  currentScale: number;
  pulsePhase: number;
  pulseSpeed: number;
  spinSpeed: number;
  sprite: THREE.Sprite;
  label: CSS2DObject;
}

export interface IntroAnimState {
  startDir: any; // THREE.Vector3
  startDist: number;
  endDist: number;
  startTime: number;
  duration: number;
}
