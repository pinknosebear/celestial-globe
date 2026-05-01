/**
 * Astronomical calculations — coordinate transforms, time conversions, rotation matrices.
 */

import * as THREE from 'three';
import type { Matrix3Tuple } from '../types';

/**
 * Multiply two 3x3 matrices.
 */
export function multiply3x3(a: number[][], b: number[][]) {
  return a.map((row) =>
    b[0].map((_, colIndex) =>
      row[0] * b[0][colIndex] +
      row[1] * b[1][colIndex] +
      row[2] * b[2][colIndex]
    )
  );
}

/**
 * Apply a 3x3 rotation matrix to a THREE.Group.
 */
export function applyRotationMatrixToGroup(group: THREE.Group, rotation: number[][] | Matrix3Tuple): void {
  const matrix = new THREE.Matrix4().set(
    rotation[0][0], rotation[0][1], rotation[0][2], 0,
    rotation[1][0], rotation[1][1], rotation[1][2], 0,
    rotation[2][0], rotation[2][1], rotation[2][2], 0,
    0, 0, 0, 1
  );
  group.matrix.copy(matrix);
  group.matrixWorldNeedsUpdate = true;
}

/**
 * Convert RA (degrees) and Dec (degrees) to XYZ coordinates on a sphere.
 */
export function raDegDecDegToXYZ(raDeg: number, decDeg: number, r: number): THREE.Vector3 {
  const ra = (raDeg * Math.PI) / 180;
  const dec = (decDeg * Math.PI) / 180;
  return new THREE.Vector3(
    r * Math.cos(dec) * Math.cos(ra),
    r * Math.sin(dec),
    r * Math.cos(dec) * Math.sin(ra)
  );
}

/**
 * Parse GMT offset from string like "GMT-07:00" or "UTC+05:30".
 */
export function parseGmtOffset(text: string): number {
  const normalized = text.replace('UTC', 'GMT');
  const match = normalized.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number.parseInt(match[2], 10);
  const minutes = Number.parseInt(match[3] ?? '0', 10);
  return sign * (hours * 60 + minutes);
}

/**
 * Format offset minutes as "+HH:MM" or "-HH:MM".
 */
export function formatOffsetMinutes(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteMinutes = Math.abs(offsetMinutes);
  const hours = Math.floor(absoluteMinutes / 60).toString().padStart(2, '0');
  const minutes = (absoluteMinutes % 60).toString().padStart(2, '0');
  return `${sign}${hours}:${minutes}`;
}

/**
 * Get timezone offset in minutes for a given date and timezone.
 */
export function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
  });
  const zoneName = formatter.formatToParts(date).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  return parseGmtOffset(zoneName);
}

/**
 * Create observation Date object from SkyState (date, time, timezone).
 */
export function makeObservationDate(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const baseUtcMs = Date.UTC(year, month - 1, day, hour, minute);
  let resolved = new Date(baseUtcMs);

  for (let i = 0; i < 3; i++) {
    const offsetMinutes = getTimeZoneOffsetMinutes(resolved, timeZone);
    const corrected = new Date(baseUtcMs - offsetMinutes * 60_000);
    if (Math.abs(corrected.getTime() - resolved.getTime()) < 1_000) {
      resolved = corrected;
      break;
    }
    resolved = corrected;
  }

  return resolved;
}

/**
 * Convert ecliptic longitude to zodiac sign name and degree within sign.
 * @param eclipticLon - Ecliptic longitude in degrees (0–360)
 * @returns { signName: string, degreeInSign: number }
 */
export function getZodiacSignInfo(eclipticLon: number): {
  signName: string;
  degreeInSign: number;
} {
  const signNames = [
    'Aries',
    'Taurus',
    'Gemini',
    'Cancer',
    'Leo',
    'Virgo',
    'Libra',
    'Scorpio',
    'Sagittarius',
    'Capricorn',
    'Aquarius',
    'Pisces',
  ];
  const signIndex = Math.floor(eclipticLon / 30) % 12;
  return {
    signName: signNames[signIndex],
    degreeInSign: eclipticLon % 30,
  };
}
