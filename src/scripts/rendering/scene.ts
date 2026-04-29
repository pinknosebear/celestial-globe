/**
 * Scene setup — THREE.js scene, camera, renderer, composer.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { THEME } from '../config/theme';
import { SPHERE, CAMERA, CONTROLS } from '../config/constants';

export interface SceneSetup {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  labelRenderer: CSS2DRenderer;
  controls: OrbitControls;
  skyGroup: THREE.Group;
  planetGroup: THREE.Group;
  bloomPass: UnrealBloomPass;
}

/**
 * Initialize THREE.js scene, camera, renderer, and post-processing.
 */
export function initializeScene(canvas: HTMLCanvasElement): SceneSetup {
  // Renderer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  // Composer & post-processing
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(new THREE.Scene(), new THREE.Camera()));

  // Camera
  const camera = new THREE.PerspectiveCamera(
    CAMERA.fov,
    window.innerWidth / window.innerHeight,
    1,
    1000
  );
  camera.position.set(0, 0, CAMERA.initialDistance);

  // Render pass & bloom
  const renderPass = new RenderPass(new THREE.Scene(), camera);
  composer.passes[0] = renderPass;

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    THEME.bloom.strength,
    THEME.bloom.radius,
    THEME.bloom.threshold
  );
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  // Label renderer
  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  document.getElementById('labels')!.appendChild(labelRenderer.domElement);

  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(THEME.colors.background);
  scene.add(new THREE.AmbientLight('#ffffff'));

  // Groups
  const skyGroup = new THREE.Group();
  skyGroup.matrixAutoUpdate = false;
  scene.add(skyGroup);

  const planetGroup = new THREE.Group();
  skyGroup.add(planetGroup);

  // Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableZoom = true;
  controls.minDistance = CAMERA.minDistance;
  controls.maxDistance = CAMERA.maxDistance;
  controls.rotateSpeed = CONTROLS.rotateSpeed;
  controls.enableDamping = CONTROLS.enableDamping;
  controls.dampingFactor = CONTROLS.dampingFactor;
  controls.autoRotateSpeed = CONTROLS.autoRotateSpeed;

  // Update render pass with actual scene/camera
  renderPass.scene = scene;
  renderPass.camera = camera;

  return {
    scene,
    camera,
    renderer,
    composer,
    labelRenderer,
    controls,
    skyGroup,
    planetGroup,
    bloomPass,
  };
}

/**
 * Handle window resize.
 */
export function onWindowResize(setup: SceneSetup): void {
  setup.camera.aspect = window.innerWidth / window.innerHeight;
  setup.camera.updateProjectionMatrix();
  setup.renderer.setSize(window.innerWidth, window.innerHeight);
  setup.composer.setSize(window.innerWidth, window.innerHeight);
  setup.bloomPass.resolution.set(window.innerWidth, window.innerHeight);
  setup.labelRenderer.setSize(window.innerWidth, window.innerHeight);
}

/**
 * Dispose of all THREE.js resources.
 */
export function disposeScene(setup: SceneSetup): void {
  setup.controls.dispose();
  setup.composer.dispose();
  setup.renderer.dispose();
  setup.labelRenderer.domElement.remove();
}
