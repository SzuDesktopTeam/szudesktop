// 宣传片用的三渲二风景逐帧渲染页（只在采集时经请求拦截注入到引擎同源的 /assets/garden/ 下，不写进仓库）。
// 灯光、天空、雾、描线与调色管线照 home-scene-renderer.mjs 的 mountHomeScene 复刻；
// 不同之处只有：相机按参数推拉/环绕/升降，每帧由外部调用 frame() 确定性地渲染。
import * as THREE from './vendor/three/three.module.mjs';
import { Pipeline } from './vendor/sakura/core/post.mjs';
import { buildSky } from './vendor/sakura/core/sky.mjs';
import { PAL } from './vendor/sakura/core/palette.mjs';
import { setOutlineResolution } from './vendor/sakura/core/outline.mjs';
import { buildCampusScene } from './home-scene-world.mjs';

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

export function setup({ skin = 'lake', width = 1920, height = 1080, scale = 1.5, retreatOverride = null } = {}) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = `display:block;width:${width}px;height:${height}px`;
  document.body.append(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  const scene = new THREE.Scene();
  const world = buildCampusScene(THREE, scene, skin);
  const view = world.camera, light = world.lighting || {};
  const camera = new THREE.PerspectiveCamera(view.fov ?? 38, width / height, view.near ?? 0.1, view.far ?? 240);
  const target = new THREE.Vector3(...view.target);
  const cameraOffset = new THREE.Vector3(...view.position).sub(target);
  const fogNear = light.fogNear ?? 44, fogFar = light.fogFar ?? 120;
  scene.fog = new THREE.Fog(light.fog ?? PAL.fog, fogNear, fogFar);
  addLights(scene, light);
  const skyRadius = camera.far * 0.82;
  const sky = buildSky(scene, skyRadius);
  sky.clouds.scale.setScalar(skyRadius / 500);
  for (const [field, uniform] of [['skyTop', 'uTop'], ['skyMid', 'uMid'], ['skyHaze', 'uHaze']]) {
    if (light[field] !== undefined) sky.dome.material.uniforms[uniform].value.set(light[field]);
  }
  // 与首页相同的 1.5 倍超采样（首页小卡片在 1x 屏上就是 1.5 倍）；这里放宽像素预算，让 1080p 也保持同样的描线精度。
  const pipeline = new Pipeline(renderer, scene, camera, { pixelBudget: 1e8 });
  pipeline.forceScale = scale;
  pipeline.ink.mat.uniforms.uSkyDepth.value = skyRadius * 0.9;
  // resize()：窄画面后退相机、雾与描线淡出范围随之平移。
  const retreat = retreatOverride ?? Math.max(1, 1.45 / camera.aspect);
  const retreatDistance = cameraOffset.length() * (retreat - 1);
  camera.position.copy(target).addScaledVector(cameraOffset, retreat);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  pipeline.setSize(width, height);
  scene.fog.near = fogNear + retreatDistance;
  scene.fog.far = fogFar + retreatDistance;
  pipeline.ink.mat.uniforms.uFadeStart.value = fogNear * 0.85 + retreatDistance;
  pipeline.ink.mat.uniforms.uFadeEnd.value = fogNear + (fogFar - fogNear) * 0.42 + retreatDistance;
  pipeline.ink.mat.uniforms.uThickness.value *= 0.8;
  setOutlineResolution(pipeline.size.x, pipeline.size.y);

  const up = new THREE.Vector3(0, 1, 0);
  // cam: dist 相机距离系数（1 = 首页构图），yaw 绕 Y 轴（度），pitch 俯仰（度，正值抬高），lift 目标点上移（单位），pan 目标点平移 [x,z]
  function frame(time, { dist = 1, yaw = 0, pitch = 0, lift = 0, pan = [0, 0] } = {}) {
    const offset = cameraOffset.clone().multiplyScalar(retreat * dist);
    offset.applyAxisAngle(up, THREE.MathUtils.degToRad(yaw));
    const side = new THREE.Vector3().crossVectors(up, offset).normalize();
    offset.applyAxisAngle(side, THREE.MathUtils.degToRad(-pitch));
    const aim = target.clone().add(new THREE.Vector3(pan[0], lift, pan[1]));
    camera.position.copy(aim).add(offset);
    camera.lookAt(aim);
    camera.updateMatrixWorld();
    world.update?.(time);
    sky.dome.position.copy(camera.position);
    sky.clouds.position.copy(camera.position);
    pipeline.render();
    return { internal: [pipeline.size.x, pipeline.size.y] };
  }
  return { frame, info: { skin, width, height, retreat, fov: camera.fov, target: view.target, position: view.position } };
}
