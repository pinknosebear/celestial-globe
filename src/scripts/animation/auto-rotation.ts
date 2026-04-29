/**
 * Auto-Rotation — automatic globe rotation at globe view level.
 */

import { CONTROLS } from '../config/constants';

/**
 * Determine if auto-rotation should be enabled based on camera distance.
 */
export function shouldAutoRotate(cameraDistance: number): boolean {
  return cameraDistance > CONTROLS.globeViewThreshold;
}

/**
 * Set auto-rotate state on controls.
 */
export function updateAutoRotate(
  controls: any, // THREE.js OrbitControls
  shouldRotate: boolean
): void {
  controls.autoRotate = shouldRotate;
}

/**
 * Get auto-rotation threshold distance.
 */
export function getAutoRotationThreshold(): number {
  return CONTROLS.globeViewThreshold;
}

/**
 * Get auto-rotation speed.
 */
export function getAutoRotationSpeed(): number {
  return CONTROLS.autoRotateSpeed;
}
