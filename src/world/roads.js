import * as THREE from 'three';
import { pointsMaterial, makePoints, attr, hexToRGB } from '../gfx/common.js';
import { mulberry32, sampleCatmull, randInSphere, segCrossesDisc, TAU } from '../core/math.js';
import { CONSTELLATIONS } from '../core/data.js';

const SAMPLES = 320;
const KIND_ROAD = 0;
const KIND_CLUSTER = 1;
const KIND_FREE = 2;
const FREE_MAX = 500;
export const RING_RADIUS = 7;

/**
 * 云路: golden rivers of light motes flowing along curves, plus wind rings.
 */
export class Roads {
  constructor(scene, roadDefs, clusterCenters) {
    const rng = mulberry32(404);
    this.rng = rng;
    this.roads = roadDefs.map((r) => {
      const s = sampleCatmull(r.pts, SAMPLES);
      let len = 0;
      for (let i = 1; i < SAMPLES; i++) {
        len += Math.hypot(s[i * 3] - s[i * 3 - 3], s[i * 3 + 1] - s[i * 3 - 2], s[i * 3 + 2] - s[i * 3 - 1]);
      }
      const tint = r.target >= 0 ? hexToRGB(CONSTELLATIONS[r.target].color) : [1, 0.85, 0.45];
      return { s, len, target: r.target, tint };
    });

    // ---- motes ----
    const kinds = [];
    const road = [];
    const u0 = [];
    const flow = [];
    const offs = [];
    const home = [];
    const colors = [];
    const v = [0, 0, 0];
    this.roads.forEach((R, ri) => {
      const n = Math.round(R.len / 2.3);
      for (let k = 0; k < n; k++) {
        kinds.push(KIND_ROAD);
        road.push(ri);
        u0.push(rng());
        flow.push((3 + rng() * 3) / R.len); // 3..6 world units / s along the road
        randInSphere(rng, v);
        offs.push(v[0] * 6, v[1] * 4, v[2] * 6);
        home.push(0, 0, 0);
        const gold = [1, 0.84, 0.48];
        const m = 0.35 + rng() * 0.25;
        colors.push(gold[0] * (1 - m) + R.tint[0] * m, gold[1] * (1 - m) + R.tint[1] * m, gold[2] * (1 - m) + R.tint[2] * m);
      }
    });
    clusterCenters.forEach((c) => {
      for (let k = 0; k < 26; k++) {
        kinds.push(KIND_CLUSTER);
        road.push(-1);
        u0.push(rng());
        flow.push(0.2 + rng() * 0.5);
        randInSphere(rng, v);
        offs.push(v[0] * 16, v[1] * 10, v[2] * 16);
        home.push(c[0], c[1], c[2]);
        colors.push(1, 0.9, 0.62);
      }
    });
    this.freeStart = kinds.length;
    for (let k = 0; k < FREE_MAX; k++) {
      kinds.push(KIND_FREE);
      road.push(-1);
      u0.push(0);
      flow.push(0);
      offs.push(0, 0, 0);
      home.push(0, 0, 0);
      colors.push(1, 0.92, 0.7);
    }
    const N = kinds.length;
    this.N = N;
    this.kind = Uint8Array.from(kinds);
    this.road = Int16Array.from(road);
    this.u0 = Float32Array.from(u0);
    this.flow = Float32Array.from(flow);
    this.offs = Float32Array.from(offs);
    this.home = Float32Array.from(home);
    this.state = new Uint8Array(N); // 0 idle, 1 attracted, 2 gone
    this.timer = new Float32Array(N);
    this.spd = new Float32Array(N);
    this.vel = new Float32Array(N * 3);
    this.pos = new Float32Array(N * 3);
    this.info = new Float32Array(N * 2); // alpha, seed
    this.appear = new Float32Array(N);
    for (let i = 0; i < N; i++) this.info[i * 2 + 1] = rng();
    this.nextFree = 0;

    const g = new THREE.BufferGeometry();
    this.aPos = attr(g, 'position', this.pos, 3, true);
    this.aInfo = attr(g, 'aInfo', this.info, 2, true);
    this.aCol = attr(g, 'aColor', Float32Array.from(colors), 3, true);
    const mat = pointsMaterial({
      vertex: /* glsl */ `
        attribute vec2 aInfo;
        attribute vec3 aColor;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float alpha = aInfo.x;
          float tw = 0.75 + 0.25 * sin(uTime * 5.0 + aInfo.y * 40.0);
          float big = alpha > 1.01 ? 1.5 : 1.0;
          alpha = min(alpha, 1.0) * tw;
          float dc = length(position - uCam);
          alpha *= 1.0 - smoothstep(500.0, 900.0, dc) * 0.85;
          alpha *= 1.0 - uDawn * 0.7;
          vColor = aColor * (1.0 + pulseWave(position) * 2.0);
          // far motes keep a minimum on-screen size so roads read as rivers from afar
          gl_PointSize = max(pointSize(mv, 1.0 * big, alpha), 2.2 * uPR);
          vAlpha = alpha;
          gl_Position = projectionMatrix * mv;
        }`,
    });
    this.points = makePoints(g, mat, 15);
    scene.add(this.points);

    // ---- wind rings ----
    this.rings = [];
    const ringPos = [];
    const ringInfo = [];
    const RP = 170;
    const tmpN = new THREE.Vector3();
    const b1 = new THREE.Vector3();
    const b2 = new THREE.Vector3();
    this.roads.forEach((R) => {
      [0.24, 0.52, 0.8].forEach((u) => {
        const i = Math.floor(u * (SAMPLES - 1));
        const c = new THREE.Vector3(R.s[i * 3], R.s[i * 3 + 1], R.s[i * 3 + 2]);
        tmpN.set(R.s[i * 3 + 3] - R.s[i * 3 - 3], R.s[i * 3 + 4] - R.s[i * 3 - 2], R.s[i * 3 + 5] - R.s[i * 3 - 1]).normalize();
        b1.set(0, 1, 0);
        if (Math.abs(tmpN.y) > 0.9) b1.set(1, 0, 0);
        b1.crossVectors(tmpN, b1).normalize();
        b2.crossVectors(tmpN, b1).normalize();
        const idx = this.rings.length;
        this.rings.push({ c, n: tmpN.clone(), cd: 0, flash: 0 });
        for (let k = 0; k < RP; k++) {
          const a = (k / RP) * TAU;
          const rr = RING_RADIUS + (rng() - 0.5) * 0.8;
          ringPos.push(
            c.x + (b1.x * Math.cos(a) + b2.x * Math.sin(a)) * rr,
            c.y + (b1.y * Math.cos(a) + b2.y * Math.sin(a)) * rr,
            c.z + (b1.z * Math.cos(a) + b2.z * Math.sin(a)) * rr,
          );
          ringInfo.push(idx, a);
        }
      });
    });
    const NR = this.rings.length;
    this.ringState = new Float32Array(32);
    this.ringFlash = new Float32Array(32);
    const rg = new THREE.BufferGeometry();
    attr(rg, 'position', Float32Array.from(ringPos), 3);
    attr(rg, 'aRing', Float32Array.from(ringInfo), 2);
    const ru = { uRingState: { value: this.ringState }, uRingFlash: { value: this.ringFlash } };
    const rmat = pointsMaterial({
      uniforms: ru,
      vertex: /* glsl */ `
        uniform float uRingState[32];
        uniform float uRingFlash[32];
        attribute vec2 aRing;
        void main() {
          int idx = int(aRing.x + 0.5);
          float ready = uRingState[idx];
          float flash = uRingFlash[idx];
          float a = aRing.y;
          float wave = 0.5 + 0.5 * sin(a * 3.0 - uTime * 5.0);
          vec3 c = mix(vec3(0.55, 0.9, 1.0), vec3(1.0, 0.85, 0.5), wave);
          float alpha = (0.18 + 0.82 * ready) * (0.35 + 0.65 * wave) + flash;
          vec3 p = position;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vColor = c * (1.0 + flash * 2.0);
          gl_PointSize = max(pointSize(mv, 0.9 + flash * 1.2, alpha), 1.8 * uPR);
          vAlpha = alpha * (1.0 - uDawn * 0.6);
          gl_Position = projectionMatrix * mv;
        }`,
    });
    this.ringPoints = makePoints(rg, rmat, 16);
    scene.add(this.ringPoints);
    this.NR = NR;
    this.reset();
  }

  reset() {
    this.state.fill(0);
    this.timer.fill(0);
    this.appear.fill(1);
    for (let i = this.freeStart; i < this.N; i++) {
      this.state[i] = 2;
      this.timer[i] = Infinity;
      this.info[i * 2] = 0;
    }
    this.time = 0;
    this.rings.forEach((r) => {
      r.cd = 0;
      r.flash = 0;
    });
  }

  /** Spawn free-floating motes (gloom drops, ally gifts). */
  spawnFree(x, y, z, count, speed = 14) {
    const v = [0, 0, 0];
    for (let k = 0; k < count; k++) {
      const i = this.freeStart + this.nextFree;
      this.nextFree = (this.nextFree + 1) % FREE_MAX;
      randInSphere(this.rng, v);
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = v[0] * speed;
      this.vel[i * 3 + 1] = v[1] * speed + 3;
      this.vel[i * 3 + 2] = v[2] * speed;
      this.state[i] = 0;
      this.timer[i] = 18;
      this.appear[i] = 1;
    }
  }

  /**
   * @param {THREE.Vector3} p player position
   * @param {number} magnetR attraction radius
   * @param {(i:number)=>void} onCollect
   */
  update(dt, p, magnetR, onCollect) {
    this.time += dt;
    const t = this.time;
    const { pos, state, timer, info, kind, roads, appear } = this;
    const m2 = magnetR * magnetR;
    for (let i = 0; i < this.N; i++) {
      const st = state[i];
      if (st === 2) {
        if (kind[i] !== KIND_FREE) {
          timer[i] -= dt;
          if (timer[i] <= 0) {
            state[i] = 0;
            appear[i] = 0;
          }
        }
        info[i * 2] = 0;
        continue;
      }
      let x;
      let y;
      let z;
      let ef = 1;
      if (st === 0) {
        const k = kind[i];
        if (k === KIND_ROAD) {
          const R = roads[this.road[i]];
          const u = (this.u0[i] + t * this.flow[i]) % 1;
          ef = Math.min(1, u * 25, (1 - u) * 25);
          const f = u * (SAMPLES - 1);
          const j = Math.min(SAMPLES - 2, Math.floor(f));
          const w = f - j;
          const s = R.s;
          const sw = Math.sin(t * 0.8 + this.u0[i] * 50);
          x = s[j * 3] + (s[j * 3 + 3] - s[j * 3]) * w + this.offs[i * 3] * (1 + 0.2 * sw);
          y = s[j * 3 + 1] + (s[j * 3 + 4] - s[j * 3 + 1]) * w + this.offs[i * 3 + 1] + sw * 0.8;
          z = s[j * 3 + 2] + (s[j * 3 + 5] - s[j * 3 + 2]) * w + this.offs[i * 3 + 2] * (1 - 0.2 * sw);
        } else if (k === KIND_CLUSTER) {
          const a = t * this.flow[i] + this.u0[i] * TAU;
          const ox = this.offs[i * 3];
          const oz = this.offs[i * 3 + 2];
          x = this.home[i * 3] + ox * Math.cos(a) - oz * Math.sin(a);
          y = this.home[i * 3 + 1] + this.offs[i * 3 + 1] + Math.sin(a * 2) * 2;
          z = this.home[i * 3 + 2] + ox * Math.sin(a) + oz * Math.cos(a);
        } else {
          // free mote: drift and slow down
          timer[i] -= dt;
          if (timer[i] <= 0) {
            state[i] = 2;
            timer[i] = Infinity;
            info[i * 2] = 0;
            continue;
          }
          const dk = Math.exp(-1.6 * dt);
          this.vel[i * 3] *= dk;
          this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dk + Math.sin(t * 2 + i) * 0.5 * dt;
          this.vel[i * 3 + 2] *= dk;
          x = pos[i * 3] + this.vel[i * 3] * dt;
          y = pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt;
          z = pos[i * 3 + 2] + this.vel[i * 3 + 2] * dt;
        }
        const dx = p.x - x;
        const dy = p.y - y;
        const dz = p.z - z;
        if (appear[i] > 0.5 && dx * dx + dy * dy + dz * dz < m2) {
          state[i] = 1;
          this.spd[i] = 8;
        }
      } else {
        // attracted: home in on the player
        x = pos[i * 3];
        y = pos[i * 3 + 1];
        z = pos[i * 3 + 2];
        const dx = p.x - x;
        const dy = p.y - y;
        const dz = p.z - z;
        const d = Math.hypot(dx, dy, dz) || 1e-6;
        this.spd[i] += 160 * dt;
        const step = Math.min(d, this.spd[i] * dt);
        x += (dx / d) * step;
        y += (dy / d) * step;
        z += (dz / d) * step;
        if (d - step < 2.2) {
          state[i] = 2;
          timer[i] = kind[i] === KIND_FREE ? Infinity : 22 + this.rng() * 10;
          info[i * 2] = 0;
          pos[i * 3] = x;
          pos[i * 3 + 1] = y;
          pos[i * 3 + 2] = z;
          onCollect(i);
          continue;
        }
      }
      if (appear[i] < 1) appear[i] = Math.min(1, appear[i] + dt * 0.6);
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      info[i * 2] = state[i] === 1 ? 1.6 : ef * appear[i] * (kind[i] === KIND_FREE ? Math.min(1, timer[i] / 3) : 1);
    }
    this.aPos.needsUpdate = true;
    this.aInfo.needsUpdate = true;

    for (let r = 0; r < this.NR; r++) {
      const R = this.rings[r];
      if (R.cd > 0) R.cd -= dt;
      R.flash = Math.max(0, R.flash - dt * 1.8);
      this.ringState[r] = R.cd > 0 ? 0 : 1;
      this.ringFlash[r] = R.flash;
    }
  }

  /** Check segment a->b against all ready rings. Returns ring or null. */
  checkRings(a, b) {
    for (let r = 0; r < this.NR; r++) {
      const R = this.rings[r];
      if (R.cd > 0) continue;
      if (segCrossesDisc(a.x, a.y, a.z, b.x, b.y, b.z, R.c.x, R.c.y, R.c.z, R.n.x, R.n.y, R.n.z, RING_RADIUS + 1.5)) {
        R.cd = 12;
        R.flash = 1;
        return R;
      }
    }
    return null;
  }

  moteColor(i) {
    const c = this.aCol.array;
    return [c[i * 3], c[i * 3 + 1], c[i * 3 + 2]];
  }

  /** Nearest idle mote position (for hints). */
  nearestIdle(p, out) {
    let best = Infinity;
    for (let i = 0; i < this.freeStart; i += 3) {
      if (this.state[i] !== 0) continue;
      const dx = this.pos[i * 3] - p.x;
      const dy = this.pos[i * 3 + 1] - p.y;
      const dz = this.pos[i * 3 + 2] - p.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < best) {
        best = d;
        out.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      }
    }
    return Math.sqrt(best);
  }
}
