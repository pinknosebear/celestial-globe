/**
 * Materials & Shaders — all material and texture creation.
 */

import * as THREE from 'three';
import { THEME } from '../config/theme';

/**
 * Create graticule (grid line) material.
 */
export function createGraticuleMaterial(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color: new THREE.Color(THEME.colors.graticule),
    transparent: true,
    opacity: THEME.opacity.graticule,
  });
}

/**
 * Create equator highlight material.
 */
export function createEquatorMaterial(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color: new THREE.Color(THEME.colors.equator),
    transparent: true,
    opacity: THEME.opacity.equator,
  });
}

/**
 * Create constellation line material.
 */
export function createConstellationLineMaterial(isZodiac: boolean): THREE.LineBasicMaterial {
  const color = isZodiac ? THEME.colors.constellationLinesZodiac : THEME.colors.constellationLines;
  return new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: THEME.opacity.constellationLines,
    depthWrite: false,
  });
}

/**
 * Create star point cloud material (regular stars).
 */
export function createStarMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      magThreshold: { value: 9.0 },
      brightnessMult: { value: 1.0 },
      sizeMult: { value: 1.0 },
    },
    vertexShader: `
      attribute float starSize;
      attribute float brightness;
      attribute float mag;
      uniform float sizeMult;
      varying float vBrightness;
      varying float vMag;
      void main() {
        vBrightness = brightness;
        vMag = mag;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = starSize * sizeMult;
      }
    `,
    fragmentShader: `
      uniform float magThreshold;
      uniform float brightnessMult;
      varying float vBrightness;
      varying float vMag;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float fade = smoothstep(vMag - 0.5, vMag + 0.5, magThreshold);
        float glow = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(1.0, 0.97, 0.93, glow * vBrightness * fade * brightnessMult);
      }
    `,
    transparent: true,
    depthWrite: false,
  });
}

/**
 * Create zodiac star material (bright stars in constellations).
 */
export function createZodiacStarMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { brightnessMult: { value: 1.0 } },
    vertexShader: `
      attribute float starSize;
      attribute float brightness;
      attribute float coreness;
      varying float vBrightness;
      varying float vCoreness;
      void main() {
        vBrightness = brightness;
        vCoreness = coreness;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = starSize;
      }
    `,
    fragmentShader: `
      varying float vBrightness;
      varying float vCoreness;
      void main() {
        vec3 gold = vec3(0.980, 0.933, 0.784);
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float whiteCore = smoothstep(vCoreness * 0.3, 0.0, d) * vCoreness;
        vec3 color = mix(gold, vec3(1.0), whiteCore);
        float glow = smoothstep(0.5, 0.05 + vCoreness * 0.15, d);
        gl_FragColor = vec4(color, glow * vBrightness);
      }
    `,
    transparent: true,
    depthWrite: false,
  });
}

/**
 * Create planet sprite texture with glyph and glow.
 */
export function createPlanetTexture(color: string, glyph: string): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const gradient = ctx.createRadialGradient(64, 64, 6, 64, 64, 60);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.35, color);
  gradient.addColorStop(0.72, `${color}cc`);
  gradient.addColorStop(1, `${color}00`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);

  ctx.fillStyle = THEME.colors.planetGlyph;
  ctx.font = '700 46px "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(255, 245, 214, 0.35)';
  ctx.shadowBlur = 10;
  ctx.fillText(glyph, 64, 67);

  return new THREE.CanvasTexture(canvas);
}

/**
 * Create planet sprite material.
 */
export function createPlanetSpriteMaterial(color: string, glyph: string): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    map: createPlanetTexture(color, glyph),
    transparent: true,
    depthWrite: false,
  });
}
