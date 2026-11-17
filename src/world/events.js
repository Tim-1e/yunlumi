import * as THREE from 'three';
import { pointsMaterial, makePoints, attr } from '../gfx/common.js';
import { mulberry32, randInSphere, segPointDist2, TAU } from '../core/math.js';

/** 流星: a catchable shooting star that streaks past the player. */
export class ShootingStar {
  constructor(scene, bursts) {
    this.bursts = bursts;
    this.rng = mulberry32(1234);
    this.active = false;
    this.pos = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.side = new THREE.Vector3();
    this.life = 0;
    this.t = 0;
    this.emitAcc = 0;
    const N = 40;
    const off = new Float32Array(N * 3);
    const info = new Float32Array(N);
    const v = [0, 0, 0];
    for (let i = 0; i < N; i++) {
      randInSphere(this.rng, v);
      off.set(i < 2 ? [0, 0, 0] : [v[0] * 2.5, v[1] * 2.5, v[2] * 2.5], i * 3);
      info[i] = i === 0 ? 0 : i === 1 ? 1 : 2;
    }
    const g = new THREE.BufferGeometry();
    attr(g, 'position', off, 3);
    attr(g, 'aType', info, 1);
    this.u = { uVis: { value: 0 } };
    const mat = pointsMaterial({
      uniforms: this.u,
      vertex: /* glsl */ `
        uniform float uVis;
        attribute float aType;
        void main() {
          vec3 p = position * (1.0 + 0.3 * sin(uTime * 10.0 + position.x * 5.0));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float alpha = uVis;
          float size = aType < 0.5 ? 4.0 : aType < 1.5 ? 18.0 : 0.8;
          if (aType > 0.5 && aType < 1.5) alpha *= 0.35;
          vColor = aType < 0.5 ? vec3(1.0) : vec3(1.0, 0.75, 0.9);
          gl_PointSize = max(pointSize(mv, size, alpha), 3.0 * uPR);
          vAlpha = alpha;
          gl_Position = projectionMatrix * mv;
        }`,
    });
    this.points = makePoints(g, mat, 26);
    this.points.visible = false;
    scene.add(this.points);
  }

  spawn(player) {
    const rng = this.rng;
    const a = rng() * TAU;
    const dist = 230 + rng() * 60;
    this.pos.set(player.x + Math.cos(a) * dist, Math.min(300, Math.max(50, player.y + 40 + rng() * 60)), player.z + Math.sin(a) * dist);
    // aim to pass ~35 units beside the player, slightly descending
    const lateral = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar((rng() < 0.5 ? -1 : 1) * 35);
    const target = new THREE.Vector3(player.x, player.y - 10, player.z).add(lateral);
    this.dir.subVectors(target, this.pos).normalize();
    this.side.crossVectors(this.dir, new THREE.Vector3(0, 1, 0)).normalize();
    this.life = 12;
    this.t = 0;
    this.active = true;
    this.points.visible = true;
    this.points.position.copy(this.pos);
  }

  stop() {
    this.active = false;
    this.points.visible = false;
    this.u.uVis.value = 0;
  }

  /** returns 'missed' when it burns out */
  update(dt) {
    if (!this.active) return null;
    this.t += dt;
    this.life -= dt;
    const speed = 52;
    const weave = Math.cos(this.t * 1.6) * 14;
    this.pos.addScaledVector(this.dir, speed * dt).addScaledVector(this.side, weave * dt);
    this.pos.y += Math.sin(this.t * 2.1) * 6 * dt;
    if (this.pos.y < 20) this.pos.y = 20;
    this.points.position.copy(this.pos);
    this.u.uVis.value = Math.min(1, this.t * 2, this.life);
    this.emitAcc += dt;
    while (this.emitAcc > 1 / 60) {
      this.emitAcc -= 1 / 60;
      this.bursts.emit(this.pos.x, this.pos.y, this.pos.z, {
        count: 3,
        color: [1, 0.8, 0.95],
        color2: [0.7, 0.85, 1],
        speed: 4,
        life: 1.4,
        size: 1.5,
        drag: 2,
        gravity: 2,
      });
    }
    if (this.life <= 0) {
      this.stop();
      return 'missed';
    }
    return null;
  }

  check(a, b) {
    if (!this.active || this.t < 0.5) return false;
    const p = this.pos;
    return segPointDist2(a.x, a.y, a.z, b.x, b.y, b.z, p.x, p.y, p.z) < 8 * 8;
  }
}

/** 月灯: hidden moon lanterns — exploration secrets. */
export class Lanterns {
  constructor(scene, spots) {
    this.spots = spots.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    this.found = new Array(this.spots.length).fill(false);
    this.state = new Float32Array(8);
    const rng = mulberry32(4321);
    const PER = 110;
    const pos = [];
    const off = [];
    const info = [];
    const v = [0, 0, 0];
    this.spots.forEach((S, li) => {
      for (let k = 0; k < PER; k++) {
        const type = k < 50 ? 0 : k < 80 ? 1 : 2;
        randInSphere(rng, v);
        pos.push(S.x, S.y, S.z);
        if (type === 0) off.push(v[0] * 2.2, v[1] * 2.8, v[2] * 2.2);
        else if (type === 1) off.push(v[0] * 0.8, rng(), v[2] * 0.8);
        else off.push(Math.cos((k / 30) * TAU), 0, Math.sin((k / 30) * TAU));
        info.push(li, type, rng());
      }
    });
    const g = new THREE.BufferGeometry();
    attr(g, 'position', Float32Array.from(pos), 3);
    attr(g, 'aOff', Float32Array.from(off), 3);
    attr(g, 'aInfo', Float32Array.from(info), 3);
    const mat = pointsMaterial({
      uniforms: { uLS: { value: this.state } },
      vertex: /* glsl */ `
        uniform float uLS[8];
        attribute vec3 aOff;
        attribute vec3 aInfo;
        void main() {
          int li = int(aInfo.x + 0.5);
          float st = uLS[li];
          float type = aInfo.y;
          float s = aInfo.z;
          vec3 p = position;
          float size = 1.0;
          float alpha = st;
          vec3 c = vec3(1.0, 0.72, 0.38);
          float flick = 0.75 + 0.25 * sin(uTime * 13.0 + s * 40.0) * sin(uTime * 7.0 + s * 9.0);
          if (type < 0.5) {
            p += aOff * (1.0 + 0.08 * sin(uTime * 2.0));
            size = 1.4;
            alpha *= 0.7 * flick;
            c = mix(vec3(1.0, 0.55, 0.25), vec3(1.0, 0.9, 0.7), s);
          } else if (type < 1.5) {
            float h = fract(aOff.y + uTime * 0.7);
            p += vec3(aOff.x * (1.0 - h), h * 5.0 - 1.0, aOff.z * (1.0 - h));
            size = 0.9;
            alpha *= (1.0 - h) * flick;
            c = vec3(1.0, 0.85, 0.5);
          } else {
            float a = uTime * 0.8;
            vec3 o = aOff;
            o.xz = vec2(cos(a) * o.x - sin(a) * o.z, sin(a) * o.x + cos(a) * o.z);
            p += o * 6.0 + vec3(0.0, sin(uTime * 1.5 + s * 6.0) * 0.6, 0.0);
            size = 0.55;
            alpha *= 0.7;
          }
          float d = length(p - uCam);
          // a faint tease from afar, full glow when close: an exploration reward
          alpha *= 0.12 + 0.88 * smoothstep(170.0, 80.0, d);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vColor = c;
          gl_PointSize = max(pointSize(mv, size, alpha), 1.5 * uPR);
          vAlpha = alpha;
          gl_Position = projectionMatrix * mv;
        }`,
    });
    this.points = makePoints(g, mat, 19);
    scene.add(this.points);
    this.reset();
  }

  reset() {
    this.found.fill(false);
    for (let i = 0; i < 8; i++) this.state[i] = i < this.spots.length ? 1 : 0;
  }

  get foundCount() {
    return this.found.filter(Boolean).length;
  }

  update(dt) {
    for (let i = 0; i < this.spots.length; i++) {
      if (this.found[i]) this.state[i] = Math.max(0, this.state[i] - dt * 1.5);
    }
  }

  /** Returns index of a lantern touched by segment a->b, or -1. */
  check(a, b) {
    for (let i = 0; i < this.spots.length; i++) {
      if (this.found[i]) continue;
      const p = this.spots[i];
      if (segPointDist2(a.x, a.y, a.z, b.x, b.y, b.z, p.x, p.y, p.z) < 7 * 7) {
        this.found[i] = true;
        return i;
      }
    }
    return -1;
  }
}
