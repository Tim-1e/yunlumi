import * as THREE from 'three';
import { U, pointsMaterial, makePoints, attr } from '../gfx/common.js';
import { mulberry32, gaussian, randOnSphere, TAU } from '../core/math.js';

export const MOON_DIR = new THREE.Vector3(0.82, 0.3, 0.48).normalize();

export function createSky(scene) {
  const skyU = {
    uAurora: { value: 0 },
    uMoonDir: { value: MOON_DIR.clone() },
    uFinale: { value: 0 },
  };

  const domeMat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uDawn: U.uDawn, ...skyU },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uDawn;
      uniform float uAurora;
      uniform float uFinale;
      uniform vec3 uMoonDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 zenith = vec3(0.010, 0.016, 0.060);
        vec3 mid = vec3(0.045, 0.035, 0.150);
        vec3 horizon = vec3(0.230, 0.100, 0.280);
        vec3 col = mix(horizon, mid, smoothstep(-0.05, 0.28, h));
        col = mix(col, zenith, smoothstep(0.28, 0.95, h));
        col = mix(col, vec3(0.05, 0.04, 0.12), smoothstep(0.0, -0.35, h));
        // moon
        float md = dot(d, uMoonDir);
        float disc = smoothstep(0.99935, 0.99965, md);
        float halo = pow(max(md, 0.0), 90.0) * 0.45 + pow(max(md, 0.0), 10.0) * 0.12;
        vec3 moonCol = vec3(1.0, 0.95, 0.86);
        // subtle craters
        float cr = sin(d.x * 900.0) * sin(d.z * 830.0 + d.y * 400.0);
        col += moonCol * disc * (1.05 - 0.08 * cr) + vec3(0.55, 0.62, 1.0) * halo;
        // aurora curtains
        float az = atan(d.z, d.x);
        float band = smoothstep(0.04, 0.22, h) * smoothstep(0.85, 0.35, h);
        float w = sin(az * 5.0 + uTime * 0.13 + sin(az * 3.0 - uTime * 0.09) * 2.2) * 0.5 + 0.5;
        float curtain = pow(w, 3.0) * (0.55 + 0.45 * sin(az * 46.0 + uTime * 0.7 + h * 14.0));
        vec3 acol = mix(vec3(0.25, 1.0, 0.72), vec3(0.85, 0.35, 1.0), smoothstep(0.12, 0.6, h));
        acol = mix(acol, vec3(1.0, 0.75, 0.4), uFinale * (0.5 + 0.5 * sin(az * 2.0 + uTime)));
        col += acol * curtain * band * (0.05 + uAurora * 0.5 + uFinale * 0.4);
        // dawn
        vec3 dawnCol = mix(vec3(1.0, 0.56, 0.36), vec3(0.42, 0.58, 0.95), smoothstep(-0.05, 0.6, h));
        float sun = pow(max(dot(d, normalize(vec3(-0.82, 0.05, -0.48))), 0.0), 24.0);
        dawnCol += vec3(1.0, 0.8, 0.5) * sun;
        col = mix(col, dawnCol, uDawn);
        gl_FragColor = vec4(col, 1.0);
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2800, 48, 24), domeMat);
  dome.renderOrder = -100;
  dome.frustumCulled = false;
  scene.add(dome);

  // Stars + a particle milky way
  const rng = mulberry32(99);
  const NS = 6000;
  const NM = 9000;
  const N = NS + NM;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const size = new Float32Array(N);
  const seed = new Float32Array(N);
  const v = [0, 0, 0];
  const R = 2400;
  for (let i = 0; i < NS; i++) {
    randOnSphere(rng, v);
    if (v[1] < -0.15) v[1] = -v[1];
    pos.set([v[0] * R, v[1] * R, v[2] * R], i * 3);
    const t = rng();
    const c = t < 0.15 ? [0.7, 0.8, 1.0] : t < 0.3 ? [1.0, 0.85, 0.7] : [0.95, 0.95, 1.0];
    col.set(c, i * 3);
    size[i] = rng() < 0.03 ? 22 + rng() * 14 : 6 + rng() * 9;
    seed[i] = rng();
  }
  const e1 = new THREE.Vector3(1, 0.35, 0.2).normalize();
  const e2 = new THREE.Vector3(-0.2, 0.55, 0.9).normalize();
  const n = new THREE.Vector3().crossVectors(e1, e2).normalize();
  const tmp = new THREE.Vector3();
  for (let i = NS; i < N; i++) {
    const a = rng() * TAU;
    const spread = gaussian(rng) * 0.09 * (0.6 + 0.4 * Math.sin(a * 3));
    tmp.copy(e1).multiplyScalar(Math.cos(a)).addScaledVector(e2, Math.sin(a)).addScaledVector(n, spread).normalize();
    if (tmp.y < -0.1) tmp.y = -tmp.y;
    pos.set([tmp.x * R, tmp.y * R, tmp.z * R], i * 3);
    const t = rng();
    const c = t < 0.4 ? [0.55, 0.6, 1.0] : t < 0.7 ? [0.95, 0.6, 0.95] : [1.0, 0.92, 0.85];
    col.set(c.map((x) => x * (0.35 + rng() * 0.4)), i * 3);
    size[i] = 4 + rng() * 8;
    seed[i] = rng();
  }
  const g = new THREE.BufferGeometry();
  attr(g, 'position', pos, 3);
  attr(g, 'aColor', col, 3);
  attr(g, 'aSize', size, 1);
  attr(g, 'aSeed', seed, 1);
  const starMat = pointsMaterial({
    uniforms: { uFinale: skyU.uFinale },
    vertex: /* glsl */ `
      uniform float uFinale;
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aSeed;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float tw = 0.6 + 0.4 * sin(uTime * (0.8 + aSeed * 3.0) + aSeed * 60.0);
        float alpha = tw * (1.0 - uDawn * 0.97) * (1.0 + uFinale * 0.8);
        alpha *= smoothstep(-0.06, 0.12, normalize(position).y);
        vColor = aColor;
        gl_PointSize = pointSize(mv, aSize, alpha);
        vAlpha = alpha;
        gl_Position = projectionMatrix * mv;
      }`,
  });
  const stars = makePoints(g, starMat, -90);
  scene.add(stars);

  return {
    uniforms: skyU,
    update(camPos) {
      dome.position.copy(camPos);
      stars.position.copy(camPos);
    },
  };
}
