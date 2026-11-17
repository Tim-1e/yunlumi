import * as THREE from 'three';
import { pointsMaterial, makePoints, attr, colorFromHex, hexToRGB } from '../gfx/common.js';
import { mulberry32, randInSphere, randOnSphere, dampFactor, smoothstep, TAU } from '../core/math.js';
import { CONSTELLATIONS, NODE_RADIUS } from '../core/data.js';
import { buildCreature } from '../core/shapes.js';

const CREATURE_VERT = /* glsl */ `
uniform float uForm;
uniform float uKind;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uSize;
uniform float uRainbow;
uniform float uAnimT;
uniform float uGain;
attribute vec3 aStart;
attribute vec4 aAnim;
attribute float aTone;
attribute float aSeed;

vec3 rotX(vec3 p, vec2 pv, float a) {
  vec2 q = p.yz - pv; float c = cos(a); float s = sin(a);
  q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  return vec3(p.x, q + pv);
}
vec3 rotZ(vec3 p, vec2 pv, float a) {
  vec2 q = p.xy - pv; float c = cos(a); float s = sin(a);
  q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  return vec3(q + pv, p.z);
}

void main() {
  vec3 p = position;
  float part = aAnim.x;
  float t = uAnimT;
  float alphaMul = 1.0;
  float twinkle = 0.0;
  if (part > 5.5) {
    p += vec3(sin(t * 0.4 + aSeed * 20.0), cos(t * 0.33 + aSeed * 13.0), sin(t * 0.27 + aSeed * 7.0)) * 3.0;
    twinkle = 1.0;
    alphaMul = 0.45;
  } else if (uKind < 0.5) { // 星鹿 deer: galloping
    p.y += sin(t * 2.4) * 0.9;
    if (part > 0.5 && part < 2.5) p = rotX(p, aAnim.yz, sin(t * 4.8 + aAnim.w) * 0.55);
    if (part > 4.5) twinkle = 1.0;
  } else if (uKind < 1.5) { // 云鲸 whale: vertical undulation, spout
    p.y += sin(p.z * 0.06 - t * 1.3) * 5.0 * aAnim.w;
    if (part > 2.5 && part < 3.5) p = rotZ(p, vec2(aAnim.z, aAnim.y), sin(t * 1.3) * 0.4 * aAnim.w);
    if (part > 4.5) {
      float h = fract(t * 0.45 + aAnim.w);
      p.y += h * 30.0;
      p.x += aAnim.y * h * 14.0;
      p.z += aAnim.z * h * 14.0;
      alphaMul = 1.0 - h;
      twinkle = 1.0;
    }
  } else if (uKind < 2.5) { // 锦鲤 koi: lateral swimming
    p.x += sin(p.z * 0.16 - t * 4.0) * 2.6 * aAnim.w;
    if (part > 3.5 && part < 4.5) p.y += sin(p.z * 0.3 - t * 5.0) * 1.5 * aAnim.w;
    if (part > 2.5 && part < 3.5) p = rotZ(p, vec2(aAnim.z, aAnim.y), sin(t * 6.0) * 0.5 * aAnim.w);
  } else if (uKind < 3.5) { // 青鸾 luan: wing flaps, streaming tail
    p.y -= sin(t * 2.6) * 1.2;
    if (part > 2.5 && part < 3.5) p = rotZ(p, vec2(aAnim.z, aAnim.y), sin(t * 2.6) * 0.75 * aAnim.w);
    if (part > 3.5 && part < 4.5) {
      p.x += sin(p.z * 0.08 + t * 2.0) * 5.0 * aAnim.w;
      p.y += sin(p.z * 0.06 + t * 1.6) * 3.0 * aAnim.w;
    }
    if (part > 4.5) twinkle = 1.0;
  } else { // 昙花 bloom: breathing petals
    if (part > 2.5 && part < 3.5) {
      float breath = 0.5 + 0.5 * sin(t * 0.6);
      p.xz *= 1.0 + (breath - 0.5) * 0.3 * aAnim.w;
      p.y *= 1.0 - (breath - 0.5) * 0.35 * aAnim.w;
      float ang = t * 0.08 * (aAnim.y - 1.5);
      float c = cos(ang); float s = sin(ang);
      p.xz = vec2(c * p.x - s * p.z, s * p.x + c * p.z);
    }
    if (part > 4.5) { p.x += sin(t * 1.5 + aSeed * 6.0) * aAnim.w * 1.5; twinkle = 1.0; }
  }
  float f = clamp(uForm * 1.7 - aSeed * 0.7, 0.0, 1.0);
  float e = f * f * (3.0 - 2.0 * f);
  vec3 swirl = vec3(sin(aSeed * 71.0 + t), cos(aSeed * 53.0 + t * 1.3), sin(aSeed * 37.0 - t)) * sin(e * 3.14159) * 10.0;
  vec3 lp = mix(aStart, p, e) + swirl;

  vec3 base = uColor;
  if (uRainbow > 0.5) base = hsv2rgb(vec3(fract(aSeed * 0.25 + atan(p.z, p.x) / 6.2832 + uTime * 0.04), 0.5, 1.0));
  vec3 c = mix(base, vec3(1.0), aTone * 0.7);
  float tw = 1.0 + twinkle * 0.6 * sin(uTime * 6.0 + aSeed * 80.0);
  c *= tw * (1.0 + (1.0 - e) * 0.8);

  vec4 wp = modelMatrix * vec4(lp, 1.0);
  c += vec3(1.0) * pulseWave(wp.xyz) * 1.5;
  vec4 mv = viewMatrix * wp;
  float alpha = uAlpha * alphaMul * (0.55 + 0.45 * aTone);
  vColor = c * uGain;
  gl_PointSize = pointSize(mv, uSize * (0.75 + aTone * 0.5) * (1.0 + (1.0 - e) * 0.6), alpha);
  vAlpha = alpha;
  gl_Position = projectionMatrix * mv;
}
`;

/** A constellation spirit sculpted from particles. */
export class Creature {
  constructor(scene, kind, color, count, scale, opts = {}) {
    this.kind = kind;
    this.count = count;
    const shape = buildCreature(kind, count, opts.seed || 1);
    const g = new THREE.BufferGeometry();
    attr(g, 'position', shape.pos, 3);
    this.aStart = attr(g, 'aStart', new Float32Array(count * 3), 3, true);
    attr(g, 'aAnim', shape.anim, 4);
    attr(g, 'aTone', shape.tone, 1);
    const seed = new Float32Array(count);
    const rng = mulberry32(kind * 31 + 7);
    for (let i = 0; i < count; i++) seed[i] = rng();
    attr(g, 'aSeed', seed, 1);
    this.geometry = g;
    this.u = {
      uForm: { value: 0 },
      uKind: { value: kind },
      uColor: { value: colorFromHex(color) },
      uAlpha: { value: 0 },
      uSize: { value: (opts.size || 0.9) * scale }, // world units (object scale is not applied to point size)
      uRainbow: { value: opts.rainbow ? 1 : 0 },
      uAnimT: { value: 0 },
      uGain: { value: opts.gain ?? 0.8 },
    };
    this.points = makePoints(g, pointsMaterial({ vertex: CREATURE_VERT, uniforms: this.u }), 25);
    this.points.scale.setScalar(scale);
    this.points.visible = false;
    scene.add(this.points);
    this.scale = scale;
    this.state = 'hidden';
    this.t = 0;
    this.animSpeed = opts.animSpeed || 1;
    this.animT = 0;
    this.dummy = new THREE.Object3D();
    this.prev = new THREE.Vector3();
    this.from = new THREE.Vector3();
    this.blend = 0;
    this.path = null;
    this.giftT = 0;
  }

  setQuality(frac) {
    this.geometry.setDrawRange(0, Math.floor(this.count * frac));
  }

  hide() {
    this.state = 'hidden';
    this.points.visible = false;
    this.u.uForm.value = 0;
    this.u.uAlpha.value = 0;
  }

  /**
   * Begin forming at `center`, particles flying in from world-space `sources` (array of Vector3).
   * facing: world direction for +Z (or null to keep upright identity).
   */
  form(center, sources, facing, rng, jitter = 6) {
    const pts = this.points;
    pts.position.copy(center);
    if (facing) {
      this.dummy.position.copy(center);
      this.dummy.lookAt(center.x + facing.x, center.y + facing.y, center.z + facing.z);
      pts.quaternion.copy(this.dummy.quaternion);
    } else pts.quaternion.identity();
    pts.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(pts.matrixWorld).invert();
    const v = new THREE.Vector3();
    const r = [0, 0, 0];
    const arr = this.aStart.array;
    for (let i = 0; i < this.count; i++) {
      const s = sources[i % sources.length];
      randInSphere(rng, r);
      v.set(s.x + r[0] * jitter, s.y + r[1] * jitter, s.z + r[2] * jitter).applyMatrix4(inv);
      arr[i * 3] = v.x;
      arr[i * 3 + 1] = v.y;
      arr[i * 3 + 2] = v.z;
    }
    this.aStart.needsUpdate = true;
    this.state = 'forming';
    this.t = 0;
    this.points.visible = true;
    this.prev.copy(center);
  }

  /** Switch to following a path function (time) => Vector3, blending from the current position. */
  follow(path) {
    this.path = path;
    this.from.copy(this.points.position);
    this.blend = 0;
    this.state = 'roam';
  }

  update(dt, time, formTime = 4) {
    if (this.state === 'hidden') return;
    this.t += dt;
    this.animT += dt * this.animSpeed;
    this.u.uAnimT.value = this.animT;
    const u = this.u;
    if (this.state === 'forming') {
      u.uForm.value = Math.min(1, this.t / formTime);
      u.uAlpha.value = Math.min(1, this.t * 1.5);
    } else {
      u.uForm.value = 1;
      u.uAlpha.value = 1;
    }
    if (this.state === 'roam' && this.path) {
      this.blend = Math.min(1, this.blend + dt / 6);
      const target = this.path(time);
      const w = smoothstep(0, 1, this.blend);
      const P = this.points.position;
      this.prev.copy(P);
      P.copy(this.from).lerp(target, w);
      if (this.kind !== 4) {
        const vx = P.x - this.prev.x;
        const vy = P.y - this.prev.y;
        const vz = P.z - this.prev.z;
        if (vx * vx + vy * vy + vz * vz > 1e-6) {
          this.dummy.position.copy(P);
          this.dummy.lookAt(P.x + vx, P.y + vy * 0.5, P.z + vz);
          this.points.quaternion.slerp(this.dummy.quaternion, dampFactor(2.2, dt));
        }
      } else {
        this.points.rotation.y += dt * 0.12;
      }
    }
  }

  get position() {
    return this.points.position;
  }
}

/** Dormant stars, constellation lines and the spirits they awaken. */
export class Constellations {
  constructor(scene, layout, quality = 1) {
    this.layout = layout;
    this.offsets = [];
    this.nodes = []; // {c, n, pos:Vector3, g}
    let gi = 0;
    CONSTELLATIONS.forEach((C, c) => {
      this.offsets.push(gi);
      layout[c].nodes.forEach((p, n) => {
        this.nodes.push({ c, n, g: gi++, pos: new THREE.Vector3(p[0], p[1], p[2]) });
      });
    });
    this.NN = this.nodes.length;
    this.nodeState = new Float32Array(32);
    this.nodeTarget = new Float32Array(32);
    this.nodeHot = new Float32Array(32);

    // ---- node particles ----
    const rng = mulberry32(808);
    const PER = 170;
    const pos = [];
    const off = [];
    const info = [];
    const col = [];
    const v = [0, 0, 0];
    this.nodes.forEach((N) => {
      const rgb = hexToRGB(CONSTELLATIONS[N.c].color);
      for (let k = 0; k < PER; k++) {
        let type;
        if (k < 60) {
          type = 0;
          randInSphere(rng, v);
          off.push(v[0] * 2.6, v[1] * 2.6, v[2] * 2.6);
        } else if (k < 100) {
          type = 1;
          randOnSphere(rng, v);
          off.push(v[0], v[1], v[2]);
        } else {
          type = 2;
          off.push((rng() - 0.5) * 1.6, rng(), (rng() - 0.5) * 1.6);
        }
        pos.push(N.pos.x, N.pos.y, N.pos.z);
        info.push(N.g, type, rng());
        col.push(rgb[0], rgb[1], rgb[2]);
      }
    });
    const g = new THREE.BufferGeometry();
    attr(g, 'position', Float32Array.from(pos), 3);
    attr(g, 'aOff', Float32Array.from(off), 3);
    attr(g, 'aInfo', Float32Array.from(info), 3);
    attr(g, 'aColor', Float32Array.from(col), 3);
    const nu = { uNodeState: { value: this.nodeState }, uNodeHot: { value: this.nodeHot } };
    const nmat = pointsMaterial({
      uniforms: nu,
      vertex: /* glsl */ `
        uniform float uNodeState[32];
        uniform float uNodeHot[32];
        attribute vec3 aOff;
        attribute vec3 aInfo;
        attribute vec3 aColor;
        void main() {
          int idx = int(aInfo.x + 0.5);
          float st = uNodeState[idx];
          float hot = uNodeHot[idx];
          float type = aInfo.y;
          float s = aInfo.z;
          vec3 p = position;
          float size = 1.0;
          float alpha = 1.0;
          vec3 dorm = vec3(0.62, 0.66, 0.95);
          vec3 c = mix(dorm, aColor, st);
          float beat = 0.5 + 0.5 * sin(uTime * (2.0 + hot * 6.0) + s * 6.0);
          if (type < 0.5) {
            float r = 1.0 + st * 0.8 + hot * 0.4 * beat;
            p += aOff * r + vec3(sin(uTime * 2.0 + s * 30.0), cos(uTime * 1.7 + s * 20.0), 0.0) * 0.3;
            size = 1.3 + st * 0.6;
            alpha = (0.45 + 0.55 * st) * (0.6 + 0.4 * beat) + hot * 0.4;
            c = mix(c, vec3(1.0), 0.35);
          } else if (type < 1.5) {
            float a = uTime * (0.6 + s) + s * 30.0;
            float r = 5.0 + st * 4.0 + hot * 2.5 * beat;
            vec3 o = aOff;
            float ca = cos(a); float sa = sin(a);
            o.xz = vec2(ca * o.x - sa * o.z, sa * o.x + ca * o.z);
            p += o * r;
            size = 0.7;
            alpha = 0.35 + 0.65 * st + hot * 0.5;
          } else {
            float h = fract(aOff.y + uTime * (0.05 + st * 0.08));
            p += vec3(aOff.x * (1.0 + st), -25.0 + h * 125.0, aOff.z * (1.0 + st));
            size = 1.1 + st * 1.2;
            alpha = (0.14 + 0.5 * st + hot * 0.2) * sin(h * 3.14159);
          }
          if (hot > 0.2 && hot < 0.75) c = mix(c, vec3(1.0, 0.45, 0.55), 0.5 * beat);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vColor = c * (1.0 + pulseWave(p) * 1.5);
          gl_PointSize = max(pointSize(mv, size, alpha), (type > 1.5 ? 1.4 : 2.0) * uPR);
          vAlpha = alpha * (1.0 - uDawn * 0.5);
          gl_Position = projectionMatrix * mv;
        }`,
    });
    this.nodePoints = makePoints(g, nmat, 18);
    scene.add(this.nodePoints);

    // ---- edges ----
    this.edges = [];
    const eA = [];
    const eB = [];
    const eInfo = [];
    const eCol = [];
    CONSTELLATIONS.forEach((C, c) => {
      const rgb = hexToRGB(C.color);
      C.edges.forEach(([a, b]) => {
        const idx = this.edges.length;
        const A = this.nodes[this.offsets[c] + a].pos;
        const B = this.nodes[this.offsets[c] + b].pos;
        this.edges.push({ c, a, b, idx, progress: 0, drawing: false });
        const n = Math.max(40, Math.round(A.distanceTo(B) * 2.2));
        for (let k = 0; k < n; k++) {
          eA.push(A.x, A.y, A.z);
          eB.push(B.x, B.y, B.z);
          eInfo.push(idx, k / (n - 1), rng());
          eCol.push(rgb[0], rgb[1], rgb[2]);
        }
      });
    });
    this.edgeState = new Float32Array(32);
    const eg = new THREE.BufferGeometry();
    attr(eg, 'position', Float32Array.from(eA), 3);
    attr(eg, 'aB', Float32Array.from(eB), 3);
    attr(eg, 'aInfo', Float32Array.from(eInfo), 3);
    attr(eg, 'aColor', Float32Array.from(eCol), 3);
    const emat = pointsMaterial({
      uniforms: { uEdge: { value: this.edgeState } },
      vertex: /* glsl */ `
        uniform float uEdge[32];
        attribute vec3 aB;
        attribute vec3 aInfo;
        attribute vec3 aColor;
        void main() {
          int idx = int(aInfo.x + 0.5);
          float pr = uEdge[idx];
          float u = aInfo.y;
          float s = aInfo.z;
          vec3 p = mix(position, aB, u);
          p += vec3(sin(uTime * 2.0 + s * 40.0), cos(uTime * 1.6 + s * 31.0), sin(uTime * 1.3 + s * 17.0)) * 0.6;
          float vis = step(u, pr) * step(0.001, pr);
          float hd = (u - pr) * 18.0;
          float headGlow = exp(-hd * hd) * step(pr, 0.999);
          float alpha = vis * (0.55 + 0.45 * sin(uTime * 4.0 - u * 20.0 + s * 3.0)) + headGlow * 1.5 * step(0.001, pr);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vColor = mix(aColor, vec3(1.0), 0.25 + headGlow * 0.6);
          gl_PointSize = max(pointSize(mv, 0.9 + headGlow * 2.0, alpha), 1.6 * uPR);
          vAlpha = alpha * (1.0 - uDawn * 0.4);
          gl_Position = projectionMatrix * mv;
        }`,
    });
    this.edgePoints = makePoints(eg, emat, 17);
    scene.add(this.edgePoints);

    // ---- spirits ----
    this.creatures = CONSTELLATIONS.map(
      (C, c) => new Creature(scene, C.kind, C.color, 6000, C.creatureScale, { seed: c + 1, size: 0.75, animSpeed: 1 }),
    );
    this.finale = new Creature(scene, 4, '#ffffff', 36000, 4.4, { seed: 99, size: 0.6, rainbow: true, animSpeed: 0.8, gain: 0.55 });
    this.setQuality(quality);
    this.rng = mulberry32(5150);
  }

  setQuality(frac) {
    this.creatures.forEach((cr) => cr.setQuality(frac));
    this.finale.setQuality(frac);
  }

  reset() {
    this.nodeState.fill(0);
    this.nodeTarget.fill(0);
    this.nodeHot.fill(0);
    this.edgeState.fill(0);
    this.edges.forEach((e) => {
      e.progress = 0;
      e.drawing = false;
    });
    this.creatures.forEach((c) => c.hide());
    this.finale.hide();
  }

  /** Visual ignition of star n in constellation c. */
  ignite(c, n, litArr) {
    const g = this.offsets[c] + n;
    this.nodeTarget[g] = 1;
    this.edges.forEach((e) => {
      if (e.c !== c || e.drawing) return;
      if ((e.a === n && litArr[e.b]) || (e.b === n && litArr[e.a])) e.drawing = true;
    });
  }

  /** Awaken constellation c's spirit; it will roam along `path`. */
  awaken(c, path) {
    const L = this.layout[c];
    const center = new THREE.Vector3(L.center[0], L.center[1], L.center[2]);
    const sources = this.nodes.filter((N) => N.c === c).map((N) => N.pos);
    const C = CONSTELLATIONS[c];
    const facing = C.kind === 4 ? null : new THREE.Vector3(L.right[0], 0, L.right[2]);
    const cr = this.creatures[c];
    cr.form(center, sources, facing, this.rng, 6);
    cr.pendingPath = path;
  }

  startFinale(center) {
    // particles stream in from the whole sky
    const srcs = [];
    const v = [0, 0, 0];
    for (let i = 0; i < 64; i++) {
      randOnSphere(this.rng, v);
      srcs.push(new THREE.Vector3(center.x + v[0] * 520, Math.max(20, center.y + v[1] * 260), center.z + v[2] * 520));
    }
    this.finale.form(center, srcs, null, this.rng, 60);
  }

  update(dt, time, playerPos, light, cost) {
    for (let g = 0; g < this.NN; g++) {
      this.nodeState[g] += (this.nodeTarget[g] - this.nodeState[g]) * dampFactor(3, dt);
      let hot = 0;
      if (this.nodeTarget[g] < 0.5) {
        const d = this.nodes[g].pos.distanceTo(playerPos);
        if (d < 55) hot = light >= cost ? 1 : 0.5;
      }
      this.nodeHot[g] += (hot - this.nodeHot[g]) * dampFactor(6, dt);
    }
    this.edges.forEach((e) => {
      if (e.drawing && e.progress < 1) e.progress = Math.min(1, e.progress + dt * 0.9);
      this.edgeState[e.idx] = e.progress;
    });
    this.creatures.forEach((cr) => {
      cr.update(dt, time);
      if (cr.state === 'forming' && cr.t > 6 && cr.pendingPath) {
        cr.follow(cr.pendingPath);
        cr.pendingPath = null;
      }
    });
    this.finale.update(dt, time, 7);
  }

  /** Dormant node whose ignition is pending and nearest to p (prefers partially-lit constellations). */
  guideTarget(p, lit) {
    let best = null;
    let bestScore = Infinity;
    for (const N of this.nodes) {
      if (lit[N.c][N.n]) continue;
      const started = lit[N.c].some(Boolean);
      const d = N.pos.distanceTo(p) * (started ? 0.55 : 1);
      if (d < bestScore) {
        bestScore = d;
        best = N;
      }
    }
    return best;
  }

  /** Dormant node intersected by segment a->b. */
  hitNode(a, b, lit) {
    const r2 = NODE_RADIUS * NODE_RADIUS;
    for (const N of this.nodes) {
      if (lit[N.c][N.n]) continue;
      const P = N.pos;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const len2 = dx * dx + dy * dy + dz * dz;
      let t = 0;
      if (len2 > 1e-9) t = Math.max(0, Math.min(1, ((P.x - a.x) * dx + (P.y - a.y) * dy + (P.z - a.z) * dz) / len2));
      const cx = a.x + dx * t - P.x;
      const cy = a.y + dy * t - P.y;
      const cz = a.z + dz * t - P.z;
      if (cx * cx + cy * cy + cz * cz < r2) return N;
    }
    return null;
  }
}

/** Ally orbit paths after awakening (functions of global time). */
export function allyPath(c) {
  const TAUc = TAU;
  const P = [
    { r: 250, alt: 150, amp: 30, w: 0.034, ph: 0.3 },
    { r: 390, alt: 115, amp: 25, w: -0.016, ph: 1.4 },
    { r: 210, alt: 195, amp: 35, w: 0.042, ph: 2.6 },
    { r: 470, alt: 245, amp: 40, w: -0.03, ph: 3.9 },
    { r: 130, alt: 275, amp: 10, w: 0.01, ph: 5.0 },
  ][c];
  const v = new THREE.Vector3();
  return (t) => {
    const a = P.ph + t * P.w;
    const r = P.r + Math.sin(a * 3) * 40;
    return v.set(Math.cos(a % TAUc) * r, P.alt + Math.sin(a * 2.3) * P.amp, Math.sin(a % TAUc) * r);
  };
}

/** Finale: all spirits circle the great bloom. */
export function finalePath(c, center) {
  const v = new THREE.Vector3();
  return (t) => {
    const a = (c / 5) * TAU + t * 0.12;
    const r = 200 + (c % 2) * 50;
    return v.set(center.x + Math.cos(a) * r, center.y - 30 + Math.sin(t * 0.5 + c) * 40, center.z + Math.sin(a) * r);
  };
}
