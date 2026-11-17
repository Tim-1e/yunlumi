import * as THREE from 'three';
import { pointsMaterial, makePoints, attr, INK_FRAG } from '../gfx/common.js';
import { mulberry32, randInSphere } from '../core/math.js';
import { makeGloom, updateGloom, setGloomState } from '../core/gloomAI.js';

export const MAX_GLOOM = 14;
const INK = 240;
const SPARK = 70;

/** 墨魇: ink-shadow swarms. Simulation in core/gloomAI.js, rendering via uniform arrays. */
export class GloomSwarm {
  constructor(scene) {
    this.rng = mulberry32(666);
    this.list = [];
    this.centers = [];
    this.dirs = [];
    this.state = new Float32Array(MAX_GLOOM); // visibility 0..1 (or >1 when dissolving = expand)
    this.mood = new Float32Array(MAX_GLOOM); // 1 when chasing
    for (let i = 0; i < MAX_GLOOM; i++) {
      this.centers.push(new THREE.Vector3(0, -9999, 0));
      this.dirs.push(new THREE.Vector3(0, 0, 1));
    }
    const u = {
      uGC: { value: this.centers },
      uGD: { value: this.dirs },
      uGS: { value: this.state },
      uGM: { value: this.mood },
    };
    const vertHead = /* glsl */ `
      uniform vec3 uGC[${MAX_GLOOM}];
      uniform vec3 uGD[${MAX_GLOOM}];
      uniform float uGS[${MAX_GLOOM}];
      uniform float uGM[${MAX_GLOOM}];
      attribute vec4 aInfo; // owner, type, seed, radius
      vec3 swirlPos(vec3 off, float s, float r, float mood) {
        float a = uTime * (0.6 + s * 1.4 + mood * 1.5) + s * 50.0;
        float c = cos(a); float sn = sin(a);
        vec3 o = off;
        o.xz = vec2(c * o.x - sn * o.z, sn * o.x + c * o.z);
        o += vec3(sin(uTime * 3.1 + s * 20.0), cos(uTime * 2.7 + s * 33.0), sin(uTime * 2.3 + s * 11.0)) * 0.18;
        return o * r;
      }
    `;
    const rng = this.rng;
    const v = [0, 0, 0];
    // ink geometry
    {
      const N = MAX_GLOOM * INK;
      const pos = new Float32Array(N * 3);
      const info = new Float32Array(N * 4);
      for (let g = 0; g < MAX_GLOOM; g++) {
        for (let k = 0; k < INK; k++) {
          const i = g * INK + k;
          randInSphere(rng, v);
          pos.set(v, i * 3);
          info.set([g, 0, rng(), 6], i * 4);
        }
      }
      const geo = new THREE.BufferGeometry();
      attr(geo, 'position', pos, 3);
      attr(geo, 'aInfo', info, 4);
      const mat = pointsMaterial({
        fragment: INK_FRAG,
        blending: THREE.NormalBlending,
        uniforms: u,
        vertex:
          vertHead +
          /* glsl */ `
          void main() {
            int g = int(aInfo.x + 0.5);
            float st = uGS[g];
            float s = aInfo.z;
            float r = aInfo.w * (st > 1.0 ? 1.0 + (st - 1.0) * 3.0 : 1.0);
            vec3 p = uGC[g] + swirlPos(position, s, r, uGM[g]);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            float vis = st > 1.0 ? max(0.0, 2.0 - st) : st;
            float alpha = vis * 0.75;
            vColor = mix(vec3(0.03, 0.0, 0.05), vec3(0.12, 0.02, 0.12), s);
            gl_PointSize = pointSize(mv, 2.6 + s * 2.0, alpha);
            vAlpha = alpha;
            gl_Position = projectionMatrix * mv;
          }`,
      });
      this.ink = makePoints(geo, mat, 12);
      scene.add(this.ink);
    }
    // sparks + eyes (additive)
    {
      const N = MAX_GLOOM * SPARK;
      const pos = new Float32Array(N * 3);
      const info = new Float32Array(N * 4);
      for (let g = 0; g < MAX_GLOOM; g++) {
        for (let k = 0; k < SPARK; k++) {
          const i = g * SPARK + k;
          randInSphere(rng, v);
          const type = k < 2 ? 2 : 1;
          if (type === 2) pos.set([k === 0 ? 1 : -1, 0, 0], i * 3);
          else pos.set(v, i * 3);
          info.set([g, type, rng(), 7.5], i * 4);
        }
      }
      const geo = new THREE.BufferGeometry();
      attr(geo, 'position', pos, 3);
      attr(geo, 'aInfo', info, 4);
      const mat = pointsMaterial({
        uniforms: u,
        vertex:
          vertHead +
          /* glsl */ `
          void main() {
            int g = int(aInfo.x + 0.5);
            float st = uGS[g];
            float s = aInfo.z;
            float mood = uGM[g];
            vec3 c = uGC[g];
            vec3 p;
            float size;
            float vis = st > 1.0 ? max(0.0, 2.0 - st) : st;
            float alpha;
            vec3 col;
            if (aInfo.y > 1.5) {
              vec3 d = normalize(uGD[g]);
              vec3 side = normalize(cross(d, vec3(0.0, 1.0, 0.0)) + vec3(1e-4));
              p = c + d * 4.6 + side * position.x * 1.5 + vec3(0.0, 0.8, 0.0);
              size = 1.5 + mood * 0.8;
              float blink = step(0.06, fract(uTime * 0.33 + aInfo.x * 0.17));
              alpha = vis * blink * (0.8 + mood * 0.6);
              col = mix(vec3(1.0, 0.25, 0.5), vec3(1.0, 0.1, 0.2), mood);
            } else {
              float r = aInfo.w * (st > 1.0 ? 1.0 + (st - 1.0) * 4.0 : 1.0);
              p = c + swirlPos(position, s, r, mood);
              size = 0.6 + s * 0.6;
              alpha = vis * (0.5 + 0.5 * sin(uTime * 8.0 + s * 60.0)) * (0.6 + mood * 0.6);
              col = mix(vec3(0.7, 0.15, 1.0), vec3(1.0, 0.2, 0.45), s);
            }
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            vColor = col;
            gl_PointSize = pointSize(mv, size, alpha);
            vAlpha = alpha;
            gl_Position = projectionMatrix * mv;
          }`,
      });
      this.sparks = makePoints(geo, mat, 13);
      scene.add(this.sparks);
    }
  }

  reset() {
    this.list.length = 0;
    this.sync();
  }

  get aliveCount() {
    let n = 0;
    for (const g of this.list) if (g.alive && g.state !== 'dying') n++;
    return n;
  }

  spawn(x, y, z) {
    if (this.list.length >= MAX_GLOOM) {
      const idx = this.list.findIndex((g) => !g.alive);
      if (idx < 0) return null;
      this.list.splice(idx, 1);
    }
    const g = makeGloom(x, y, z, this.rng);
    this.list.push(g);
    return g;
  }

  kill(g) {
    if (g.state === 'dying' || !g.alive) return;
    setGloomState(g, 'dying');
    g.fade = 1;
  }

  update(dt, p, speedMul) {
    for (const g of this.list) updateGloom(g, p.x, p.y, p.z, dt, this.rng, speedMul);
    // drop dead ones
    for (let i = this.list.length - 1; i >= 0; i--) if (!this.list[i].alive) this.list.splice(i, 1);
    this.sync(dt);
  }

  sync(dt = 1) {
    const k = 1 - Math.exp(-6 * dt);
    for (let i = 0; i < MAX_GLOOM; i++) {
      const g = this.list[i];
      if (!g) {
        this.state[i] = 0;
        this.centers[i].set(0, -9999, 0);
        continue;
      }
      this.centers[i].set(g.x, g.y, g.z);
      const sp = Math.hypot(g.vx, g.vy, g.vz);
      if (sp > 0.5) this.dirs[i].set(g.vx / sp, g.vy / sp, g.vz / sp);
      this.state[i] = g.state === 'dying' ? 1 + (1 - g.fade) : g.fade;
      this.mood[i] += ((g.state === 'chase' ? 1 : 0) - this.mood[i]) * k;
    }
  }
}
