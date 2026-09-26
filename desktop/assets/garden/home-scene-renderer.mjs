import * as THREE from './vendor/three/three.module.mjs';
import { Pipeline } from './vendor/sakura/core/post.mjs';
import { buildSky } from './vendor/sakura/core/sky.mjs';
import { PAL } from './vendor/sakura/core/palette.mjs';
import { setOutlineResolution } from './vendor/sakura/core/outline.mjs';
import { buildCampusScene } from './home-scene-world.mjs';

// Sakura Crossing's MIT cel/ink/grade pipeline, hosted as an optional homepage
// view. Sources, modifications and both licenses live in ./vendor/SOURCE.json.
export async function mountHomeScene(container, { skin = 'lake', motion = true } = {}) {
  if (!container.isConnected) return { destroy() {} };

  const canvas = document.createElement('canvas');
  canvas.className = 'home-scene-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  let world;
  let pipeline;
  let resizeObserver;
  let intersectionObserver;
  let frame = 0;
  let destroyed = false;
  let inView = true;
  let width = 0;
  let height = 0;
  let lastDraw = 0;
  const started = performance.now();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const animated = () => motion !== false && !reducedMotion.matches;

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
    document.removeEventListener('visibilitychange', syncPlayback);
    reducedMotion.removeEventListener('change', syncPlayback);
    canvas.removeEventListener('webglcontextlost', contextLost);
    disposeScene(scene);
    world?.dispose?.();
    pipeline?.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  }

  function contextLost(event) {
    event.preventDefault();
    destroy();
    container.dataset.sceneState = 'fallback';
    const status = container.querySelector('.scene-loading');
    if (status) status.textContent = '校园小景暂时无法展开，继续使用像素庭院。';
  }

  let camera;
  let sky;
  function draw(now) {
    world.update?.(animated() ? (now - started) / 1000 : 0);
    sky.dome.position.copy(camera.position);
    sky.clouds.position.copy(camera.position);
    pipeline.render();
    container.dataset.sceneState = 'ready';
  }

  function tick(now) {
    frame = 0;
    if (!container.isConnected) return destroy();
    if (destroyed || document.hidden || !inView || !animated()) return;
    // Small background gestures only: a homepage does not need a 60 fps game loop.
    if (now - lastDraw >= 1000 / 30) {
      draw(now);
      lastDraw = now;
    }
    frame = requestAnimationFrame(tick);
  }

  function syncPlayback() {
    cancelAnimationFrame(frame);
    frame = 0;
    if (destroyed) return;
    if (!container.isConnected) return destroy();
    if (document.hidden || !inView || !width || !height) {
      container.dataset.sceneMode = 'paused';
      return;
    }
    container.dataset.sceneMode = animated() ? 'animated' : 'still';
    draw(performance.now());
    if (animated()) frame = requestAnimationFrame(tick);
  }

  try {
    world = buildCampusScene(THREE, scene, skin);
    const view = world.camera;
    const light = world.lighting || {};
    camera = new THREE.PerspectiveCamera(view.fov ?? 38, 1, view.near ?? 0.1, view.far ?? 240);
    const target = new THREE.Vector3(...view.target);
    const cameraOffset = new THREE.Vector3(...view.position).sub(target);
    const fogNear = light.fogNear ?? 44;
    const fogFar = light.fogFar ?? 120;
    scene.fog = new THREE.Fog(light.fog ?? PAL.fog, fogNear, fogFar);
    addLights(scene, light);

    const skyRadius = camera.far * 0.82;
    sky = buildSky(scene, skyRadius);
    // Upstream clouds are authored for a radius-500 town. Keep their proportions
    // inside this smaller camera volume instead of clipping them at the far plane.
    sky.clouds.scale.setScalar(skyRadius / 500);
    for (const [field, uniform] of [['skyTop', 'uTop'], ['skyMid', 'uMid'], ['skyHaze', 'uHaze']]) {
      if (light[field] !== undefined) sky.dome.material.uniforms[uniform].value.set(light[field]);
    }

    pipeline = new Pipeline(renderer, scene, camera, { pixelBudget: 1.6e6 });
    pipeline.ink.mat.uniforms.uSkyDepth.value = skyRadius * 0.9;
    canvas.addEventListener('webglcontextlost', contextLost);
    container.append(canvas);

    function resize() {
      if (destroyed || !container.isConnected) return destroy();
      const rect = container.getBoundingClientRect();
      width = Math.floor(rect.width);
      height = Math.floor(rect.height);
      if (width < 1 || height < 1) return syncPlayback();
      camera.aspect = width / height;
      // Preserve the campus subject in a narrow card instead of cropping its sides.
      const retreat = Math.max(1, 1.45 / camera.aspect);
      camera.position.copy(target).addScaledVector(cameraOffset, retreat);
      camera.lookAt(target);
      camera.updateProjectionMatrix();
      pipeline.setSize(width, height);
      // The town-sized source keeps distant silhouettes too busy in these small
      // views. Fade ink within each scene's haze and use a lighter sampling width.
      // A narrow card retreats the camera; shift both ranges to keep the subject
      // as clear as it was in the wide composition.
      const retreatDistance = cameraOffset.length() * (retreat - 1);
      scene.fog.near = fogNear + retreatDistance;
      scene.fog.far = fogFar + retreatDistance;
      pipeline.ink.mat.uniforms.uFadeStart.value = fogNear * 0.85 + retreatDistance;
      pipeline.ink.mat.uniforms.uFadeEnd.value = fogNear + (fogFar - fogNear) * 0.42 + retreatDistance;
      pipeline.ink.mat.uniforms.uThickness.value *= 0.8;
      setOutlineResolution(pipeline.size.x, pipeline.size.y);
      syncPlayback();
    }

    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    intersectionObserver = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      syncPlayback();
    });
    intersectionObserver.observe(container);
    document.addEventListener('visibilitychange', syncPlayback);
    reducedMotion.addEventListener('change', syncPlayback);
    resize();
    return { destroy };
  } catch (error) {
    destroy();
    throw error;
  }
}

function addLights(scene, light) {
  const sun = new THREE.DirectionalLight(light.sun ?? PAL.sun, light.sunIntensity ?? 2.25);
  sun.position.set(-32, 48, 36);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 130 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.035;
  const fill = new THREE.DirectionalLight(light.fill ?? PAL.fill, light.fillIntensity ?? 1.08);
  fill.position.set(30, 20, -28);
  const bounce = new THREE.DirectionalLight(0xd8cbe8, 0.34);
  bounce.position.set(10, -18, 30);
  const hemi = new THREE.HemisphereLight(light.hemiSky ?? PAL.hemiSky, light.hemiGround ?? PAL.hemiGround, light.hemiIntensity ?? 1.12);
  scene.add(sun, sun.target, fill, bounce, hemi);
}

function disposeScene(scene) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  scene.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      for (const uniform of Object.values(material.uniforms || {})) if (uniform.value?.isTexture) textures.add(uniform.value);
    }
    object.shadow?.dispose();
  });
  textures.forEach(texture => texture.dispose());
  materials.forEach(material => material.dispose());
  geometries.forEach(geometry => geometry.dispose());
  scene.clear();
}
