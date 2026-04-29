/**
 * TypeScript type definitions — shared across the app.
 */

export interface SkyState {
  placeName: string;
  latitude: number;
  longitude: number;
  elevation: number;
  date: string;
  time: string;
  timeZone: string;
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
  starIndices: number[];
  baseSizes: Float32Array;
  baseBrightnesses: Float32Array;
  lines: any[]; // THREE.Line[]
  mats: any[]; // THREE.LineBasicMaterial[]
  label: any; // CSS2DObject
  hitMesh: any; // THREE.Mesh
}

export interface PlanetState {
  name: string;
  body: any; // Astronomy.Body
  baseSize: number;
  currentScale: number;
  pulsePhase: number;
  pulseSpeed: number;
  spinSpeed: number;
  sprite: any; // THREE.Sprite
  label: any; // CSS2DObject
}

export interface IntroAnimState {
  startDir: any; // THREE.Vector3
  startDist: number;
  endDist: number;
  startTime: number;
  duration: number;
}
