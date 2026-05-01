import { describe, expect, it } from 'vitest';
import { computeNatalPlanetLayout } from './natal-chart';

describe('computeNatalPlanetLayout', () => {
  it('assigns separate radial lanes to close planets', () => {
    const layout = computeNatalPlanetLayout([
      { id: 'Sun', longitudeDeg: 10 },
      { id: 'Moon', longitudeDeg: 12 },
      { id: 'Mercury', longitudeDeg: 50 },
    ]);

    const sun = layout.find((item) => item.id === 'Sun')!;
    const moon = layout.find((item) => item.id === 'Moon')!;
    const mercury = layout.find((item) => item.id === 'Mercury')!;

    expect(sun.lane).not.toBe(moon.lane);
    expect(mercury.lane).toBe(0);
  });

  it('treats planets close across 0 degrees as a cluster', () => {
    const layout = computeNatalPlanetLayout([
      { id: 'Venus', longitudeDeg: 358 },
      { id: 'Mars', longitudeDeg: 2 },
      { id: 'Jupiter', longitudeDeg: 120 },
    ]);

    const venus = layout.find((item) => item.id === 'Venus')!;
    const mars = layout.find((item) => item.id === 'Mars')!;

    expect(venus.lane).not.toBe(mars.lane);
  });
});
