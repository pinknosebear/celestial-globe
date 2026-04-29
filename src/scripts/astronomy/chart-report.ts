/**
 * Astrological chart report generation — convert sky state to text-based chart.
 */

import type { PlanetState, SkyState } from '../types';

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
 * Generate a text-based astrological chart from current sky state.
 * Lists planets with their zodiac positions and retrograde status.
 */
export function generateChartReport(planets: PlanetState[], state: SkyState, date: Date): string {
  const lines: string[] = [];

  const dateStr = date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const timeStr = date.toLocaleTimeString('en-US', {
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

  const visiblePlanets = planets.filter(p =>
    p.eclipticLongitude !== undefined && p.signName !== undefined
  );

  for (const planet of visiblePlanets) {
    const lon = planet.eclipticLongitude!;
    const retroSign = planet.retrograde ? ' (℞)' : '';
    const posStr = formatLongitude(lon);
    const nameStr = `${planet.name.padEnd(10)} (${planet.body.name.padEnd(7)})`;
    lines.push(`${nameStr} ${posStr}${retroSign}`);
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
