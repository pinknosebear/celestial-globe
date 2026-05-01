/**
 * CelestialSnapshot — immutable astronomy-layer source of truth for one sky state.
 */

import * as Astronomy from 'astronomy-engine';
import { PLANETS } from '../config/constants';
import {
  formatOffsetMinutes,
  getTimeZoneOffsetMinutes,
  getZodiacSignInfo,
  makeObservationDate,
} from './calculations';
import type {
  CelestialBodyId,
  CelestialBodySnapshot,
  CelestialSnapshot,
  Matrix3Tuple,
  SkyState,
  UnsupportedAstrologyPointSnapshot,
  Vec3Tuple,
  ZodiacPositionSnapshot,
} from '../types';

const SNAPSHOT_VERSION = 1 as const;
const RETROGRADE_STEP_DAYS = 0.5;
const DAY_MS = 86_400_000;

const UNAVAILABLE_ASTROLOGY_POINTS: readonly UnsupportedAstrologyPointSnapshot[] = [
  {
    id: 'Chiron',
    reason: 'Requires an external ephemeris provider; intentionally out of scope for the initial snapshot foundation.',
  },
  {
    id: 'NorthNode',
    reason: 'Requires a chosen true-node or mean-node ephemeris policy; intentionally out of scope for the initial snapshot foundation.',
  },
  {
    id: 'SouthNode',
    reason: 'Requires a chosen true-node or mean-node ephemeris policy; intentionally out of scope for the initial snapshot foundation.',
  },
];

function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

function angularDeltaDegrees(from: number, to: number): number {
  let delta = normalizeDegrees(to) - normalizeDegrees(from);
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

function tupleFromVector(vector: { x: number; y: number; z: number }): Vec3Tuple {
  return [vector.x, vector.y, vector.z];
}

function unitVector(vector: Vec3Tuple): Vec3Tuple {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (length === 0) return [0, 0, 0];
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function astronomyEqjToAppVector(vector: { x: number; y: number; z: number }): Vec3Tuple {
  return [vector.x, vector.z, vector.y];
}

function matrixTuple(matrix: number[][]): Matrix3Tuple {
  return [
    [matrix[0][0], matrix[0][1], matrix[0][2]],
    [matrix[1][0], matrix[1][1], matrix[1][2]],
    [matrix[2][0], matrix[2][1], matrix[2][2]],
  ];
}

function eqjToRenderMatrix(eqjToHorizon: number[][]): Matrix3Tuple {
  const r = eqjToHorizon;
  return [
    [r[0][0], r[0][2], r[0][1]],
    [-r[1][0], -r[1][2], -r[1][1]],
    [r[2][0], r[2][2], r[2][1]],
  ];
}

function getGeocentricEcliptic(body: Astronomy.Body, date: Date): ZodiacPositionSnapshot {
  const ecliptic = body === Astronomy.Body.Sun
    ? Astronomy.SunPosition(date)
    : Astronomy.Ecliptic(Astronomy.GeoVector(body, date, false));
  const longitudeDeg = normalizeDegrees(ecliptic.elon);
  const zodiac = getZodiacSignInfo(longitudeDeg);

  return {
    frame: 'ECT',
    longitudeDeg,
    latitudeDeg: ecliptic.elat,
    distanceAu: ecliptic.vec.Length(),
    signName: zodiac.signName,
    degreeInSign: zodiac.degreeInSign,
  };
}

function getEclipticLongitudeVelocity(body: Astronomy.Body, date: Date): number {
  const before = getGeocentricEcliptic(
    body,
    new Date(date.getTime() - RETROGRADE_STEP_DAYS * DAY_MS)
  ).longitudeDeg;
  const after = getGeocentricEcliptic(
    body,
    new Date(date.getTime() + RETROGRADE_STEP_DAYS * DAY_MS)
  ).longitudeDeg;

  return angularDeltaDegrees(before, after) / (RETROGRADE_STEP_DAYS * 2);
}

function buildBodySnapshot(
  id: CelestialBodyId,
  body: Astronomy.Body,
  date: Date,
  observer: Astronomy.Observer,
  eqjToHorizon: Astronomy.RotationMatrix
): CelestialBodySnapshot {
  const equatorial = Astronomy.Equator(body, date, observer, false, true);
  const horizontalVector = Astronomy.RotateVector(eqjToHorizon, equatorial.vec);
  const horizontalSphere = Astronomy.HorizonFromVector(horizontalVector, undefined as unknown as string);
  const ecliptic = getGeocentricEcliptic(body, date);
  const eclipticLongitudeVelocityDegPerDay = getEclipticLongitudeVelocity(body, date);
  const illumination = Astronomy.Illumination(body, date);

  const equatorialVectorAu = astronomyEqjToAppVector(equatorial.vec);
  const horizontalVectorAu = tupleFromVector(horizontalVector);

  return {
    id,
    name: id,
    apparent: {
      equatorial: {
        frame: 'EQJ',
        rightAscensionHours: equatorial.ra,
        rightAscensionDeg: normalizeDegrees(equatorial.ra * 15),
        declinationDeg: equatorial.dec,
        distanceAu: equatorial.dist,
        vectorAu: equatorialVectorAu,
        unitVector: unitVector(equatorialVectorAu),
      },
      horizontal: {
        frame: 'HOR',
        azimuthDeg: normalizeDegrees(horizontalSphere.lon),
        altitudeDeg: horizontalSphere.lat,
        distanceAu: horizontalSphere.dist,
        vectorAu: horizontalVectorAu,
        unitVector: unitVector(horizontalVectorAu),
      },
    },
    astrology: {
      ecliptic,
      retrograde: eclipticLongitudeVelocityDegPerDay < 0,
      eclipticLongitudeVelocityDegPerDay,
    },
    illumination: {
      magnitude: illumination.mag,
      phaseAngleDeg: illumination.phase_angle,
      phaseFraction: illumination.phase_fraction,
    },
  };
}

function cloneSkyState(state: SkyState): SkyState {
  return { ...state };
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value as Readonly<T>;
  }

  for (const key of Reflect.ownKeys(value as object)) {
    const child = (value as Record<PropertyKey, unknown>)[key];
    deepFreeze(child);
  }

  return Object.freeze(value);
}

/**
 * Create the immutable source of truth for all current sky projections.
 */
export function createCelestialSnapshot(state: SkyState): CelestialSnapshot {
  const input = cloneSkyState(state);
  const observationDate = makeObservationDate(input.date, input.time, input.timeZone);
  const observer = new Astronomy.Observer(input.latitude, input.longitude, input.elevation);
  const offsetMinutes = getTimeZoneOffsetMinutes(observationDate, input.timeZone);
  const localSiderealTimeHours = (
    (Astronomy.SiderealTime(observationDate) + input.longitude / 15) % 24 + 24
  ) % 24;
  const eqjToHorizon = Astronomy.Rotation_EQJ_HOR(observationDate, observer);
  const bodies = PLANETS.map((planet) => {
    const id = planet.id;
    const body = Astronomy.Body[id];
    return buildBodySnapshot(id, body, observationDate, observer, eqjToHorizon);
  });
  const bodiesById = Object.fromEntries(
    bodies.map((body) => [body.id, body])
  ) as Record<CelestialBodyId, CelestialBodySnapshot>;

  return deepFreeze({
    version: SNAPSHOT_VERSION,
    input,
    observer: {
      placeName: input.placeName,
      latitude: input.latitude,
      longitude: input.longitude,
      elevation: input.elevation,
      timeZone: input.timeZone,
    },
    time: {
      localDate: input.date,
      localTime: input.time,
      timeZone: input.timeZone,
      utcIso: observationDate.toISOString(),
      epochMs: observationDate.getTime(),
      offsetMinutes,
      offsetLabel: formatOffsetMinutes(offsetMinutes),
      localSiderealTimeHours,
    },
    frames: {
      eqjToHorizonMatrix: matrixTuple(eqjToHorizon.rot),
      equatorialToRenderMatrix: eqjToRenderMatrix(eqjToHorizon.rot),
    },
    bodies,
    bodiesById,
    unavailableAstrologyPoints: UNAVAILABLE_ASTROLOGY_POINTS.map((point) => ({ ...point })),
  }) as CelestialSnapshot;
}
