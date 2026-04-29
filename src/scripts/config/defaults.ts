/**
 * Default observer settings — location, date, time.
 * Change here to set a different default starting point.
 */

const now = new Date();
const dateStr = now.toISOString().slice(0, 10);
const timeStr = now.toTimeString().slice(0, 5);

export const DEFAULT_OBSERVER = {
  placeName: 'San Francisco, CA',
  latitude: 37.7749,
  longitude: -122.4194,
  elevation: 16, // meters
  date: dateStr,
  time: timeStr,
  timeZone: 'America/Los_Angeles',
} as const;
