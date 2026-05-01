const SIGN_NAMES = [
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
] as const;

export function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

export function formatZodiacLongitude(longitudeDeg: number): string {
  const totalMinutes = Math.round(normalizeDegrees(longitudeDeg) * 60) % (360 * 60);
  const signIndex = Math.floor(totalMinutes / (30 * 60));
  const minutesInSign = totalMinutes % (30 * 60);
  const degrees = Math.floor(minutesInSign / 60);
  const minutes = minutesInSign % 60;

  return `${SIGN_NAMES[signIndex]} ${degrees}°${minutes.toString().padStart(2, '0')}′`;
}
