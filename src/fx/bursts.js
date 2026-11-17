import * as THREE from 'three';
import { pointsMaterial, makePoints, attr } from '../gfx/common.js';
import { randOnSphere, mulberry32 } from '../core/math.js';

/** CPU particle pool for sparks, shockwaves, fireworks. Ring-buffer allocation (oldest overwritten). */
export class Bursts {
  constructor(scene, max = 9000) {
    this.max = max;
    this.next = 0;
    this.rng = mulberry32(77);
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.life = new Float32Array(max); // remaining
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.info = new Float32Array(max * 2); // (life fraction, size)
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -99999;
    const g = new THREE.BufferGeometry();
    this.aPos = attr(g, 'position', this.pos, 3, true);
    this.aCol = attr(g, 'aColor', this.col, 3, true);
    this.aInfo = attr(g, 'aInfo', this.info, 2, true);
    const mat = pointsMaterial({
      vertex: /* glsl */ `
        attribute vec3 aColor;
        attribute vec2 aInfo;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float f = aInfo.x;
          float alpha = f <= 0.0 ? 0.0 : smoothstep(0.0, 0.35, f) * (0.65 + 0.35 * sin(uTime * 30.0 + position.x));
          vColor = aColor;
          gl_PointSize = pointSize(mv, aInfo.y * (0.4 + 0.6 * f), alpha);
          vAlpha = alpha;
          gl_Position = projectionMatrix * mv;
        }`,
    });
    this.points = makePoints(g, mat, 20);
    scene.add(this.points);
    this.active = 0;
  }

  /**
   * opts: {count, color:[r,g,b], color2, speed, spread(0..1 random speed), life, size, drag, gravity,
   *        dir:[x,y,z] (bias), cone (0=sphere .. 1=tight), shell(boolean: all same speed), vel:[x,y,z] inherit}
   */
  emit(x, y, z, o) {
    const n = o.count || 20;
    const c1 = o.color || [1, 0.9, 0.6];
    const c2 = o.color2 || c1;
    const v = [0, 0, 0];
    const rng = this.rng;
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      randOnSphere(rng, v);
      if (o.dir) {
        const cone = o.cone ?? 0.7;
        v[0] = v[0] * (1 - cone) + o.dir[0] * cone;
        v[1] = v[1] * (1 - cone) + o.dir[1] * cone;
        v[2] = v[2] * (1 - cone) + o.dir[2] * cone;
        const l = Math.hypot(v[0], v[1], v[2]) || 1;
        v[0] /= l;
        v[1] /= l;
        v[2] /= l;
      }
      const sp = (o.speed ?? 20) * (o.shell ? 0.95 + rng() * 0.1 : 1 - (o.spread ?? 0.8) * rng());
      const r = o.radius || 0;
      this.pos[i * 3] = x + v[0] * r;
      this.pos[i * 3 + 1] = y + v[1] * r;
      this.pos[i * 3 + 2] = z + v[2] * r;
      this.vel[i * 3] = v[0] * sp + (o.vel ? o.vel[0] : 0);
      this.vel[i * 3 + 1] = v[1] * sp + (o.vel ? o.vel[1] : 0);
      this.vel[i * 3 + 2] = v[2] * sp + (o.vel ? o.vel[2] : 0);
      const t = rng();
      this.col[i * 3] = c1[0] + (c2[0] - c1[0]) * t;
      this.col[i * 3 + 1] = c1[1] + (c2[1] - c1[1]) * t;
      this.col[i * 3 + 2] = c1[2] + (c2[2] - c1[2]) * t;
      const life = (o.life ?? 1.2) * (0.6 + 0.4 * rng());
      this.life[i] = life;
      this.maxLife[i] = life;
      this.size[i] = (o.size ?? 2) * (0.6 + 0.8 * rng());
      this.drag[i] = o.drag ?? 1.5;
      this.grav[i] = o.gravity ?? 0;
    }
  }

  /** Stream of particles flowing from A towards B (e.g. light poured into a star). */
  stream(ax, ay, az, bx, by, bz, o) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const time = o.time || 0.6;
    const n = o.count || 30;
    const rng = this.rng;
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const j = (rng() - 0.5) * 3;
      this.pos[i * 3] = ax + j;
      this.pos[i * 3 + 1] = ay + (rng() - 0.5) * 3;
      this.pos[i * 3 + 2] = az + (rng() - 0.5) * 3;
      const tt = time * (0.7 + 0.6 * rng());
      // with drag 0 the particle arrives at B after tt seconds
      this.vel[i * 3] = dx / tt + (rng() - 0.5) * 8;
      this.vel[i * 3 + 1] = dy / tt + (rng() - 0.5) * 8;
      this.vel[i * 3 + 2] = dz / tt + (rng() - 0.5) * 8;
      const c = o.color || [1, 0.9, 0.6];
      this.col.set(c, i * 3);
      this.life[i] = tt;
      this.maxLife[i] = tt;
      this.size[i] = (o.size ?? 2) * (0.7 + 0.6 * rng());
      this.drag[i] = 0;
      this.grav[i] = 0;
    }
  }

  clear() {
    this.life.fill(0);
    this.info.fill(0);
    this.aInfo.needsUpdate = true;
  }

  update(dt) {
    const { pos, vel, life, maxLife, info, size, drag, grav } = this;
    let active = 0;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) {
        if (info[i * 2] !== 0) info[i * 2] = 0;
        continue;
      }
      active++;
      life[i] -= dt;
      const k = drag[i] > 0 ? Math.exp(-drag[i] * dt) : 1;
      vel[i * 3] *= k;
      vel[i * 3 + 1] = vel[i * 3 + 1] * k - grav[i] * dt;
      vel[i * 3 + 2] *= k;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      info[i * 2] = Math.max(0, life[i] / maxLife[i]);
      info[i * 2 + 1] = size[i];
    }
    this.active = active;
    this.aPos.needsUpdate = true;
    this.aCol.needsUpdate = true;
    this.aInfo.needsUpdate = true;
  }
}
