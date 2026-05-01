/**
 * Astrological chart report generation — convert sky state to text-based chart.
 */

import type { CelestialSnapshot, SkyState } from '../types';

/**
 * Format ecliptic longitude as "Sign Degree'Minutes"".
 * @param eclipticLon Ecliptic longitude in degrees (0–360)
 * @returns Formatted string e.g. "Taurus 5°12'"
 */
function formatLongitude(eclipticLon: number): string {
  const signNames = [
    'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
    'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'
  ];
  const signIndex = Math.floor(eclipticLon / 30);
  const degInSign = eclipticLon % 30;
  const degrees = Math.floor(degInSign);
  const minutes = Math.round((degInSign - degrees) * 60);
  return `${signNames[signIndex]} ${degrees}°${minutes}'`;
}

/**
 * Generate a text-based astrological chart from a celestial snapshot.
 * Lists bodies with their zodiac positions and retrograde status.
 */
export function generateChartReport(snapshot: CelestialSnapshot): string {
  const lines: string[] = [];
  const date = new Date(snapshot.time.epochMs);
  const state = snapshot.input;

  const dateStr = date.toLocaleDateString('en-US', {
    timeZone: snapshot.time.timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const timeStr = date.toLocaleTimeString('en-US', {
    timeZone: snapshot.time.timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });

  lines.push('═══════════════════════════════════════════════════════');
  lines.push('                    CELESTIAL CHART');
  lines.push('═══════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`Location: ${state.placeName}`);
  lines.push(`Coordinates: ${state.latitude.toFixed(4)}°, ${state.longitude.toFixed(4)}°`);
  lines.push(`Date: ${dateStr}`);
  lines.push(`Time: ${timeStr} (${state.timeZone})`);
  lines.push(`Elevation: ${state.elevation}m`);
  lines.push('');
  lines.push('───────────────────────────────────────────────────────');
  lines.push('                    PLANET POSITIONS');
  lines.push('───────────────────────────────────────────────────────');
  lines.push('');

  for (const body of snapshot.bodies) {
    const lon = body.astrology.ecliptic.longitudeDeg;
    const retroSign = body.astrology.retrograde ? ' (℞)' : '';
    const posStr = formatLongitude(lon);
    const nameStr = body.name.padEnd(10);
    lines.push(`${nameStr} ${posStr}${retroSign}`);
  }

  if (snapshot.unavailableAstrologyPoints.length > 0) {
    lines.push('');
    lines.push('Unavailable points:');
    for (const point of snapshot.unavailableAstrologyPoints) {
      lines.push(`${point.id}: ${point.reason}`);
    }
  }

  lines.push('');
  lines.push('───────────────────────────────────────────────────────');
  lines.push('Legend: (℞) = Retrograde motion');
  lines.push('═══════════════════════════════════════════════════════');

  return lines.join('\n');
}

/**
 * Download a chart report as a text file.
 */
export function downloadChartReport(content: string, state: SkyState): void {
  const filename = `${state.placeName.replace(/[^a-z0-9]/gi, '_')}_chart.txt`;
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
