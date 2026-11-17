import * as THREE from 'three';
import { pointsMaterial, makePoints, attr } from '../gfx/common.js';
import { mulberry32 } from '../core/math.js';

const TRAIL_MAX = 420; // samples
const SUB = 3; // particles per sample (braided spiral)

/**
 * The player: a little comet of light (Lumi). Its tail length visualises carried light.
 */
export class Comet {
  constructor(scene) {
    // ---------- core / halo / orbiters (object-space, follows player) ----------
    const rng = mulberry32(5);
    const NC = 64;
    const off = new Float32Array(NC * 3);
    const info = new Float32Array(NC * 3); // type, seed, size
    for (let i = 0; i < NC; i++) {
      const type = i === 0 ? 0 : i === 1 ? 1 : i < 14 ? 2 : 3;
      info[i * 3] = type;
      info[i * 3 + 1] = rng();
      // world-unit sizes; the camera sits ~10 units behind, so keep these small
      info[i * 3 + 2] = type === 0 ? 1.0 : type === 1 ? 4.5 : type === 2 ? 0.32 : 0.22;
    }
    const g = new THREE.BufferGeometry();
    attr(g, 'position', off, 3);
    attr(g, 'aInfo', info, 3);
    this.coreU = {
      uHurt: { value: 0 },
      uDash: { value: 0 },
      uTint: { value: new THREE.Color(1, 0.85, 0.5) },
    };
    const coreMat = pointsMaterial({
      uniforms: this.coreU,
      vertex: /* glsl */ `
        uniform float uHurt;
        uniform float uDash;
        uniform vec3 uTint;
        attribute vec3 aInfo;
        void main() {
          float type = aInfo.x;
          float s = aInfo.y;
          vec3 p = vec3(0.0);
          float size = aInfo.z;
          vec3 c = uTint;
          float alpha = 1.0;
          if (type < 0.5) { c = vec3(1.0, 0.97, 0.9); size *= 1.0 + 0.15 * sin(uTime * 9.0); }
          else if (type < 1.5) { alpha = 0.28 + uDash * 0.3; size *= 1.0 + 0.1 * sin(uTime * 3.0) + uDash * 0.6; }
          else if (type < 2.5) {
            float a = uTime * (2.0 + s * 2.0) + s * 40.0;
            float r = 1.8 + s * 1.4;
            p = vec3(cos(a) * r, sin(a * 1.3 + s * 7.0) * r * 0.6, sin(a) * r);
            c = mix(uTint, vec3(0.7, 0.95, 1.0), s);
          } else {
            float a = uTime * (0.8 + s) + s * 90.0;
            float r = 3.0 + 2.0 * fract(s * 13.0 + uTime * 0.2);
            p = vec3(cos(a) * r, sin(a * 0.7) * r * 0.8, sin(a) * r);
            alpha = 0.6;
          }
          c = mix(c, vec3(1.0, 0.2, 0.45), uHurt);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vColor = c;
          gl_PointSize = pointSize(mv, size, alpha);
          vAlpha = alpha;
          gl_Position = projectionMatrix * mv;
        }`,
    });
    this.core = makePoints(g, coreMat, 40);
    scene.add(this.core);

    // ---------- tail (world-space ring buffer) ----------
    this.samples = new Float32Array(TRAIL_MAX * 3);
    this.head = 0;
    this.count = 0;
    this.last = new THREE.Vector3(0, -9999, 0);
    const NT = TRAIL_MAX * SUB;
    this.tPos = new Float32Array(NT * 3);
    this.tInfo = new Float32Array(NT * 2); // u along tail (0 head .. 1 end, <0 hidden), sub index
    this.tCol = new Float32Array(NT * 3);
    const tg = new THREE.BufferGeometry();
    this.aTPos = attr(tg, 'position', this.tPos, 3, true);
    this.aTInfo = attr(tg, 'aInfo', this.tInfo, 2, true);
    this.aTCol = attr(tg, 'aColor', this.tCol, 3, true);
    const tailMat = pointsMaterial({
      vertex: /* glsl */ `
        attribute vec2 aInfo;
        attribute vec3 aColor;
        void main() {
          float u = aInfo.x;
          float alpha = u < 0.0 ? 0.0 : (1.0 - u) * (0.55 + 0.45 * sin(uTime * 12.0 + aInfo.y * 2.1 + u * 40.0));
          vec3 p = position;
          // braid: each sub-strand spirals around the path
          float a = uTime * 5.0 + u * 30.0 + aInfo.y * 2.094;
          float r = 0.5 + u * 2.6;
          p += vec3(cos(a) * r, sin(a) * r, sin(a * 0.7) * r);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vColor = aColor;
          gl_PointSize = pointSize(mv, 0.6 * (1.0 - u * 0.5), alpha);
          vAlpha = alpha;
          gl_Position = projectionMatrix * mv;
        }`,
    });
    this.tail = makePoints(tg, tailMat, 30);
    scene.add(this.tail);
    this.palette = [[1, 0.85, 0.5]];
  }

  reset(pos) {
    this.head = 0;
    this.count = 0;
    this.last.copy(pos);
    this.core.position.copy(pos);
    this.tInfo.fill(-1);
    this.aTInfo.needsUpdate = true;
  }

  setPalette(cols) {
    this.palette = cols.length ? cols : [[1, 0.85, 0.5]];
  }

  /** light: carried light -> tail length. */
  update(pos, light, dt, time) {
    this.core.position.copy(pos);
    // add a sample whenever we moved far enough
    const spacing = 0.7;
    let d = this.last.distanceTo(pos);
    if (d > 60) {
      // teleport / reset: restart tail
      this.count = 0;
      this.last.copy(pos);
      d = 0;
    }
    while (d >= spacing) {
      this.last.lerp(pos, spacing / d);
      this.samples[this.head * 3] = this.last.x;
      this.samples[this.head * 3 + 1] = this.last.y;
      this.samples[this.head * 3 + 2] = this.last.z;
      this.head = (this.head + 1) % TRAIL_MAX;
      this.count = Math.min(TRAIL_MAX, this.count + 1);
      d = this.last.distanceTo(pos);
    }
    const len = Math.min(this.count, Math.floor(24 + Math.min(light, 400) * 0.98));
    const pal = this.palette;
    for (let k = 0; k < TRAIL_MAX; k++) {
      const visible = k < len;
      const si = (this.head - 1 - k + TRAIL_MAX * 2) % TRAIL_MAX;
      const u = visible ? k / Math.max(1, len) : -1;
      const ci = pal[Math.floor(k / 14 + time * 2) % pal.length];
      for (let s = 0; s < SUB; s++) {
        const i = k * SUB + s;
        this.tInfo[i * 2] = u;
        this.tInfo[i * 2 + 1] = s;
        if (!visible) continue;
        this.tPos[i * 3] = this.samples[si * 3];
        this.tPos[i * 3 + 1] = this.samples[si * 3 + 1];
        this.tPos[i * 3 + 2] = this.samples[si * 3 + 2];
        this.tCol[i * 3] = ci[0];
        this.tCol[i * 3 + 1] = ci[1];
        this.tCol[i * 3 + 2] = ci[2];
      }
    }
    this.aTPos.needsUpdate = true;
    this.aTInfo.needsUpdate = true;
    this.aTCol.needsUpdate = true;
  }

  setVisible(v) {
    this.core.visible = v;
    this.tail.visible = v;
  }
}

/** Speed dust: particles wrapped in a box around the camera, visible when flying fast. */
export function createDust(scene) {
  const N = 900;
  const rng = mulberry32(17);
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = rng() * 160;
    pos[i * 3 + 1] = rng() * 160;
    pos[i * 3 + 2] = rng() * 160;
    seed[i] = rng();
  }
  const g = new THREE.BufferGeometry();
  attr(g, 'position', pos, 3);
  attr(g, 'aSeed', seed, 1);
  const du = { uSpeed: { value: 0 } };
  const mat = pointsMaterial({
    uniforms: du,
    vertex: /* glsl */ `
      uniform float uSpeed;
      attribute float aSeed;
      void main() {
        vec3 p = mod(position - uCam + 80.0, 160.0) - 80.0 + uCam;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float d = length(p - uCam);
        float alpha = smoothstep(80.0, 30.0, d) * smoothstep(2.0, 8.0, d) * (0.15 + uSpeed * 0.85);
        alpha *= 0.5 + 0.5 * sin(uTime * 3.0 + aSeed * 50.0);
        vColor = mix(vec3(0.6, 0.75, 1.0), vec3(1.0, 0.9, 0.7), aSeed);
        gl_PointSize = pointSize(mv, 0.35 + uSpeed * 0.25, alpha);
        vAlpha = alpha * 0.8;
        gl_Position = projectionMatrix * mv;
      }`,
  });
  const pts = makePoints(g, mat, 10);
  scene.add(pts);
  return du;
}
