import { describe, expect, it } from 'vitest';
import { formatZodiacLongitude, normalizeDegrees } from './zodiac-format';

describe('zodiac formatting', () => {
  it('formats sign degree and rounded minutes', () => {
    expect(formatZodiacLongitude(42.566)).toBe('Taurus 12°34′');
  });

  it('rolls over to the next sign when minute rounding crosses a boundary', () => {
    expect(formatZodiacLongitude(29.999)).toBe('Taurus 0°00′');
  });

  it('normalizes negative and over-360 degree values', () => {
    expect(normalizeDegrees(-1)).toBe(359);
    expect(formatZodiacLongitude(361.5)).toBe('Aries 1°30′');
  });
});
