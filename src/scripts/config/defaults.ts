/**
 * Default observer settings — location, date, time.
 * Change here to set a different default starting point.
 */

export const DEFAULT_OBSERVER = {
  placeName: 'San Francisco, CA',
  latitude: 37.7749,
  longitude: -122.4194,
  elevation: 16, // meters
  date: '2026-04-26',
  time: '21:00',
  timeZone: 'America/Los_Angeles',
} as const;
