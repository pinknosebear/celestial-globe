import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLANETS } from '../config/constants';
import { createCelestialSnapshot } from './celestial-snapshot';
import type { CelestialBodyId, SkyState, Vec3Tuple } from '../types';

const FIXED_SKY_STATE: SkyState = {
  placeName: 'San Francisco, CA',
  latitude: 37.7749,
  longitude: -122.4194,
  elevation: 16,
  date: '2026-04-30',
  time: '20:15',
  timeZone: 'America/Los_Angeles',
};

function vectorLength(vector: Vec3Tuple): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function collectTsFiles(path: string): string[] {
  const stat = statSync(path);
  if (stat.isFile()) {
    return path.endsWith('.ts') ? [path] : [];
  }

  return readdirSync(path).flatMap((entry) => collectTsFiles(join(path, entry)));
}

describe('createCelestialSnapshot', () => {
  it('creates a deeply frozen serializable snapshot', () => {
    const snapshot = createCelestialSnapshot(FIXED_SKY_STATE);

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.bodies)).toBe(true);
    expect(Object.isFrozen(snapshot.bodies[0])).toBe(true);
    expect(Object.isFrozen(snapshot.bodies[0].apparent.equatorial.unitVector)).toBe(true);
    expect(() => {
      (snapshot as { version: number }).version = 2;
    }).toThrow();

    const parsed = JSON.parse(JSON.stringify(snapshot));
    expect(parsed.time.utcIso).toBe(snapshot.time.utcIso);
    expect(parsed.bodiesById.Sun.apparent.equatorial.unitVector).toHaveLength(3);
    expect(parsed.bodiesById.Sun.apparent.equatorial.unitVector[0]).toBeTypeOf('number');
  });

  it('normalizes observer local time into one stable UTC instant', () => {
    const snapshot = createCelestialSnapshot(FIXED_SKY_STATE);

    expect(snapshot.time.utcIso).toBe('2026-05-01T03:15:00.000Z');
    expect(snapshot.time.offsetMinutes).toBe(-420);
    expect(snapshot.time.offsetLabel).toBe('-07:00');
    expect(snapshot.time.localDate).toBe('2026-04-30');
    expect(snapshot.time.localTime).toBe('20:15');
  });

  it('contains every configured visible body including Pluto', () => {
    const snapshot = createCelestialSnapshot(FIXED_SKY_STATE);
    const expectedIds = PLANETS.map((planet) => planet.id) as CelestialBodyId[];

    expect(snapshot.bodies.map((body) => body.id)).toEqual(expectedIds);
    expect(snapshot.bodiesById.Pluto.id).toBe('Pluto');

    for (const id of expectedIds) {
      const body = snapshot.bodiesById[id];
      expect(body.id).toBe(id);
      expect(Number.isFinite(body.illumination.magnitude)).toBe(true);
      expect(Number.isFinite(body.astrology.ecliptic.longitudeDeg)).toBe(true);
      expect(body.astrology.ecliptic.longitudeDeg).toBeGreaterThanOrEqual(0);
      expect(body.astrology.ecliptic.longitudeDeg).toBeLessThan(360);
      expect(Number.isFinite(body.astrology.ecliptic.degreeInSign)).toBe(true);
      expect(Number.isFinite(body.astrology.eclipticLongitudeVelocityDegPerDay)).toBe(true);
      expect(vectorLength(body.apparent.equatorial.unitVector)).toBeCloseTo(1, 6);
      expect(vectorLength(body.apparent.horizontal.unitVector)).toBeCloseTo(1, 6);
      expect(body.apparent.horizontal.altitudeDeg).toBeGreaterThanOrEqual(-90);
      expect(body.apparent.horizontal.altitudeDeg).toBeLessThanOrEqual(90);
      expect(body.apparent.horizontal.azimuthDeg).toBeGreaterThanOrEqual(0);
      expect(body.apparent.horizontal.azimuthDeg).toBeLessThan(360);
    }
  });

  it('does not fabricate unsupported astrology points', () => {
    const snapshot = createCelestialSnapshot(FIXED_SKY_STATE);

    expect(snapshot.unavailableAstrologyPoints.map((point) => point.id)).toEqual([
      'Chiron',
      'NorthNode',
      'SouthNode',
    ]);
    expect(snapshot.bodiesById).not.toHaveProperty('Chiron');
    expect(snapshot.bodiesById).not.toHaveProperty('NorthNode');
    expect(snapshot.bodiesById).not.toHaveProperty('SouthNode');
  });
});

describe('astronomy dependency boundary', () => {
  it('keeps ephemeris imports out of app orchestration and rendering', () => {
    const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
    const files = [
      join(repoRoot, 'src/scripts/app.ts'),
      ...collectTsFiles(join(repoRoot, 'src/scripts/rendering')),
    ];

    for (const file of files) {
      expect(readFileSync(file, 'utf8')).not.toContain('astronomy-engine');
    }
  });
});
