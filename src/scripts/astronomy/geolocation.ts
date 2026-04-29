/**
 * Geolocation — place search, reverse geocoding, timezone lookup.
 */

import tzLookup from 'tz-lookup';
import type { ResolvedPlace } from '../types';

/**
 * Search for places by name using Nominatim.
 */
export async function searchPlaces(query: string): Promise<ResolvedPlace[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '5');
  url.searchParams.set('q', query);

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Place search failed: HTTP ${response.status}`);
  }

  const results = (await response.json()) as Array<{ display_name: string; lat: string; lon: string }>;
  return results.map((result) => {
    const latitude = Number.parseFloat(result.lat);
    const longitude = Number.parseFloat(result.lon);
    return {
      name: result.display_name,
      latitude,
      longitude,
      timeZone: tzLookup(latitude, longitude),
    };
  });
}

/**
 * Reverse geocode coordinates to get place name.
 */
export async function reverseGeocode(lat: number, lon: number): Promise<string> {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', lat.toString());
  url.searchParams.set('lon', lon.toString());

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Reverse geocode failed: HTTP ${response.status}`);
  }

  const result = (await response.json()) as { display_name?: string };
  return result.display_name ?? `Near ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

/**
 * Get timezone for coordinates.
 */
export function getTimeZoneForCoordinates(lat: number, lon: number): string {
  return tzLookup(lat, lon);
}
