import * as THREE from 'three';
import { pointsMaterial, makePoints, attr, SOFT_FRAG } from '../gfx/common.js';
import { mulberry32, fbm3, smoothstep, randInSphere, clamp } from '../core/math.js';
import { MOON_DIR } from './sky.js';

export const MAX_LIGHTS = 8;

/** Moonlit sea of particle clouds + cumulus towers. Parts around the player and ripples on pulses. */
export function createClouds(scene, towers, maxCount = 72000) {
  const rng = mulberry32(2024);
  const pos = new Float32Array(maxCount * 3);
  const size = new Float32Array(maxCount);
  const seed = new Float32Array(maxCount);
  const shade = new Float32Array(maxCount);
  const moon = new Float32Array(maxCount);
  const seaN = Math.floor(maxCount * 0.68);
  const R = 1150;
  let i = 0;
  let guard = 0;
  while (i < seaN && guard++ < maxCount * 40) {
    const x = (rng() * 2 - 1) * R;
    const z = (rng() * 2 - 1) * R;
    if (x * x + z * z > R * R) continue;
    const n = fbm3(x * 0.0035 + 10, 0.5, z * 0.0035 - 4, 4);
    const dens = smoothstep(0.36, 0.64, n);
    if (rng() > dens * 0.95 + 0.04) continue;
    const bill = fbm3(x * 0.018, 3.3, z * 0.018, 2);
    const y = -20 + n * 34 + rng() * rng() * 26 * dens + bill * 12;
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    size[i] = 13 + rng() * 22;
    seed[i] = rng();
    shade[i] = clamp((y + 16) / 52, 0, 1);
    moon[i] = clamp((x * MOON_DIR.x + z * MOON_DIR.z) / R * 0.5 + 0.5, 0, 1) * 0.5;
    i++;
  }
  // Towers
  const v = [0, 0, 0];
  const puffs = [];
  towers.forEach((t) => {
    for (let j = 0; j < 34; j++) {
      const f = Math.pow(j / 33, 0.9);
      const h = f * t.height;
      const crown = smoothstep(0.65, 0.92, f) * (1 - smoothstep(0.92, 1.0, f));
      const rad = t.radius * (1 - 0.5 * f + crown * 0.7);
      const a = rng() * Math.PI * 2;
      const off = rad * 0.45 * rng();
      puffs.push({
        x: t.x + Math.cos(a) * off,
        y: h,
        z: t.z + Math.sin(a) * off,
        r: rad * (0.45 + 0.35 * rng()),
        f,
      });
    }
  });
  while (i < maxCount) {
    const p = puffs[Math.floor(rng() * puffs.length)];
    randInSphere(rng, v);
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    const k = Math.pow(l, 0.35) / l; // bias to the surface
    const x = p.x + v[0] * k * p.r;
    const y = p.y + v[1] * k * p.r * 0.8;
    const z = p.z + v[2] * k * p.r;
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    size[i] = 12 + rng() * 20;
    seed[i] = rng();
    shade[i] = clamp(0.25 + 0.6 * p.f + v[1] * 0.25, 0, 1);
    const nx = v[0] * k;
    const nz = v[2] * k;
    moon[i] = clamp(nx * MOON_DIR.x + nz * MOON_DIR.z + v[1] * k * MOON_DIR.y, 0, 1);
    i++;
  }
  // Shuffle so drawRange prefixes stay uniformly distributed (quality scaling).
  for (let j = maxCount - 1; j > 0; j--) {
    const r = Math.floor(rng() * (j + 1));
    for (let c = 0; c < 3; c++) {
      const tmp = pos[j * 3 + c];
      pos[j * 3 + c] = pos[r * 3 + c];
      pos[r * 3 + c] = tmp;
    }
    let tmp = size[j];
    size[j] = size[r];
    size[r] = tmp;
    tmp = seed[j];
    seed[j] = seed[r];
    seed[r] = tmp;
    tmp = shade[j];
    shade[j] = shade[r];
    shade[r] = tmp;
    tmp = moon[j];
    moon[j] = moon[r];
    moon[r] = tmp;
  }

  const g = new THREE.BufferGeometry();
  attr(g, 'position', pos, 3);
  attr(g, 'aSize', size, 1);
  attr(g, 'aSeed', seed, 1);
  attr(g, 'aShade', shade, 1);
  attr(g, 'aMoon', moon, 1);

  const lights = [];
  const lightCols = [];
  for (let k = 0; k < MAX_LIGHTS; k++) {
    lights.push(new THREE.Vector4(0, -9999, 0, 1));
    lightCols.push(new THREE.Vector3(0, 0, 0));
  }
  const cu = {
    uCloudAlpha: { value: 0.1 },
    uLights: { value: lights },
    uLightCols: { value: lightCols },
  };
  const mat = pointsMaterial({
    fragment: SOFT_FRAG,
    uniforms: cu,
    vertex: /* glsl */ `
      uniform float uCloudAlpha;
      uniform vec4 uLights[${MAX_LIGHTS}];
      uniform vec3 uLightCols[${MAX_LIGHTS}];
      attribute float aSize;
      attribute float aSeed;
      attribute float aShade;
      attribute float aMoon;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * 0.06 + aSeed * 6.283) * 5.0;
        p.z += cos(uTime * 0.05 + aSeed * 9.0) * 4.0;
        p.y += sin(uTime * 0.11 + aSeed * 12.0) * 1.6;
        // parting around the player
        vec3 dp = p - uPlayer;
        float dl = length(dp) + 1e-3;
        float push = smoothstep(26.0, 0.0, dl);
        p += dp / dl * push * 14.0;
        // pulse ripple
        float pw = pulseWave(p);
        vec3 dq = p - uPulse.xyz;
        p += normalize(dq + vec3(0.0, 0.001, 0.0)) * pw * 16.0;

        vec3 lowC = vec3(0.060, 0.055, 0.180);
        vec3 highC = vec3(0.40, 0.39, 0.62);
        vec3 c = mix(lowC, highC, aShade);
        c += vec3(0.30, 0.16, 0.22) * aMoon * aShade;
        // warm glow from the player's light
        float pg = exp(-dl * dl / 2400.0);
        c += uPlayerColor * pg * 0.9;
        c += vec3(0.9, 0.8, 1.0) * pw * 0.9;
        for (int k = 0; k < ${MAX_LIGHTS}; k++) {
          vec3 dd = p - uLights[k].xyz;
          float att = exp(-dot(dd, dd) / (uLights[k].w * uLights[k].w));
          c += uLightCols[k] * att;
        }
        // dawn: clouds turn rosy gold
        c = mix(c, mix(vec3(0.9, 0.55, 0.5), vec3(1.0, 0.85, 0.7), aShade), uDawn * 0.85);

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float dc = -mv.z;
        float alpha = uCloudAlpha * (0.7 + 0.3 * hash11(aSeed * 91.0));
        alpha *= smoothstep(4.0, 34.0, dc);
        alpha *= 1.0 - smoothstep(900.0, 1700.0, length(p.xz - uCam.xz));
        vColor = c;
        gl_PointSize = pointSize(mv, aSize, alpha);
        vAlpha = alpha;
        gl_Position = projectionMatrix * mv;
      }`,
  });
  const points = makePoints(g, mat, -50);
  scene.add(points);

  return {
    points,
    uniforms: cu,
    lights,
    lightCols,
    setQuality(frac) {
      g.setDrawRange(0, Math.floor(maxCount * frac));
      // keep overall brightness roughly constant when thinning particles
      cu.uCloudAlpha.value = 0.1 / Math.sqrt(Math.max(0.3, frac));
    },
  };
}
