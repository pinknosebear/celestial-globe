/**
 * Intro Zoom Animation — zoom-out animation from sky view to globe view.
 */

import * as THREE from 'three';
import { ANIMATION } from '../config/constants';
import type { IntroAnimState } from '../types';

/**
 * Trigger the intro zoom-out animation.
 */
export function startIntroZoom(camera: THREE.Camera): IntroAnimState {
  return {
    startDir: camera.position.clone().normalize(),
    startDist: camera.position.length(),
    endDist: ANIMATION.introZoomEndDist,
    startTime: performance.now(),
    duration: ANIMATION.introZoomDuration,
  };
}

/**
 * Update intro zoom animation state.
 * Returns true if animation is complete.
 */
export function updateIntroZoom(
  introAnim: IntroAnimState,
  camera: THREE.Camera
): boolean {
  const progress = Math.min(1, (performance.now() - introAnim.startTime) / introAnim.duration);
  const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
  const targetDist = THREE.MathUtils.lerp(introAnim.startDist, introAnim.endDist, eased);

  camera.position.copy(introAnim.startDir.clone().multiplyScalar(targetDist));

  return progress >= 1;
}

/**
 * Get delay before animation starts.
 */
export function getIntroZoomDelay(): number {
  return ANIMATION.introZoomDelay;
}
