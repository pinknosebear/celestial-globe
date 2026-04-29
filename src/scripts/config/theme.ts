/**
 * Theme configuration — all colors, fonts, and visual styling.
 * Update here to change the entire app appearance without touching rendering logic.
 */

export const THEME = {
  colors: {
    background: '#081f2b',
    stars: '#fffbef',
    starsGlow: '#fffbef',
    graticule: '#1a3a4a',
    equator: '#2a5a6a',
    constellationLines: '#445566',
    constellationLinesZodiac: '#8899aa',
    planetGlyph: 'rgba(255, 250, 235, 0.98)',
  },
  fonts: {
    constellation: 'Cormorant Garamond, serif',
    size: '14px',
  },
  opacity: {
    graticule: 0.6,
    equator: 0.9,
    constellationLines: 0.7,
    constellationLinesZodiac: 0.7,
  },
  bloom: {
    strength: 0.2,
    radius: 0.6,
    threshold: 0.1,
  },
} as const;
