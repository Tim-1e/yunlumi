// Pure procedural point-cloud sculptures for the constellation spirits.
// Every creature faces +Z with +Y up (bloom: opens towards +Y).
// Output per point: position xyz, anim vec4 (part, a, b, c), tone (0 base colour .. 1 white).
// Parts: 0 body, 1 front legs, 2 hind legs, 3 wings/fins/petals, 4 tail, 5 special (antler/spout/stamen), 6 aura.
import { TAU, lerp, mulberry32, randInSphere, randOnSphere } from './math.js';

export const KIND = { deer: 0, whale: 1, koi: 2, luan: 3, bloom: 4 };

const _v = [0, 0, 0];

function onEllipsoid(rng, o, cx, cy, cz, rx, ry, rz, fill = 0.25) {
  randOnSphere(rng, _v);
  const s = rng() < fill ? Math.cbrt(rng()) : 1 - rng() * 0.08;
  o.x = cx + _v[0] * rx * s;
  o.y = cy + _v[1] * ry * s;
  o.z = cz + _v[2] * rz * s;
}

function onTube(rng, o, a, b, r0, r1, t = rng()) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  const nx = dx / len;
  const ny = dy / len;
  const nz = dz / len;
  // helper vector not parallel to n
  let hx = 0;
  let hy = 1;
  let hz = 0;
  if (Math.abs(ny) > 0.9) {
    hx = 1;
    hy = 0;
  }
  // u = normalize(n x h)
  let ux = ny * hz - nz * hy;
  let uy = nz * hx - nx * hz;
  let uz = nx * hy - ny * hx;
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul;
  uy /= ul;
  uz /= ul;
  // v = n x u
  const vx = ny * uz - nz * uy;
  const vy = nz * ux - nx * uz;
  const vz = nx * uy - ny * ux;
  const ang = rng() * TAU;
  const r = lerp(r0, r1, t) * (0.8 + 0.2 * rng());
  const c = Math.cos(ang) * r;
  const s = Math.sin(ang) * r;
  o.x = a[0] + dx * t + ux * c + vx * s;
  o.y = a[1] + dy * t + uy * c + vy * s;
  o.z = a[2] + dz * t + uz * c + vz * s;
}

function aura(radius, cy = 0) {
  return (rng, o) => {
    randInSphere(rng, _v);
    o.x = _v[0] * radius;
    o.y = cy + _v[1] * radius * 0.7;
    o.z = _v[2] * radius;
    o.part = 6;
    o.tone = 0.6 + rng() * 0.4;
  };
}

function build(count, rng, parts) {
  const total = parts.reduce((s, p) => s + p.w, 0);
  const pos = new Float32Array(count * 3);
  const anim = new Float32Array(count * 4);
  const tone = new Float32Array(count);
  const o = { x: 0, y: 0, z: 0, part: 0, a: 0, b: 0, c: 0, tone: 0 };
  let i = 0;
  for (let p = 0; p < parts.length; p++) {
    const last = p === parts.length - 1;
    const n = last ? count - i : Math.max(0, Math.round((count * parts[p].w) / total));
    for (let k = 0; k < n && i < count; k++, i++) {
      o.x = o.y = o.z = 0;
      o.part = 0;
      o.a = o.b = o.c = 0;
      o.tone = 0;
      parts[p].f(rng, o, n > 1 ? k / (n - 1) : 0);
      pos[i * 3] = o.x;
      pos[i * 3 + 1] = o.y;
      pos[i * 3 + 2] = o.z;
      anim[i * 4] = o.part;
      anim[i * 4 + 1] = o.a;
      anim[i * 4 + 2] = o.b;
      anim[i * 4 + 3] = o.c;
      tone[i] = o.tone;
    }
  }
  // Fisher–Yates shuffle so any prefix (drawRange for quality levels) is an even sample.
  for (let j = count - 1; j > 0; j--) {
    const r = Math.floor(rng() * (j + 1));
    for (let k = 0; k < 3; k++) {
      const t = pos[j * 3 + k];
      pos[j * 3 + k] = pos[r * 3 + k];
      pos[r * 3 + k] = t;
    }
    for (let k = 0; k < 4; k++) {
      const t = anim[j * 4 + k];
      anim[j * 4 + k] = anim[r * 4 + k];
      anim[r * 4 + k] = t;
    }
    const t = tone[j];
    tone[j] = tone[r];
    tone[r] = t;
  }
  return { pos, anim, tone, count };
}

function antlerSegments(side) {
  const segs = [];
  const branch = (p, d, len, r, depth) => {
    const e = [p[0] + d[0] * len, p[1] + d[1] * len, p[2] + d[2] * len];
    segs.push([p, e, r]);
    if (depth <= 0) return;
    const n1 = norm([d[0] + side * 0.55, d[1] + 0.25, d[2] - 0.15]);
    const n2 = norm([d[0] - side * 0.2, d[1] + 0.1, d[2] + 0.55]);
    branch(e, n1, len * 0.72, r * 0.7, depth - 1);
    branch(e, n2, len * 0.6, r * 0.65, depth - 1);
  };
  branch([side * 1.6, 16.5, 17.5], norm([side * 0.45, 1, -0.3]), 6.2, 0.7, 3);
  return segs;
}

function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function deer(count, rng) {
  const antL = antlerSegments(1);
  const antR = antlerSegments(-1);
  const legs = [
    { x: 3.3, z: 8, part: 1, ph: 0 },
    { x: -3.3, z: 8, part: 1, ph: Math.PI },
    { x: 3.3, z: -8, part: 2, ph: Math.PI },
    { x: -3.3, z: -8, part: 2, ph: 0 },
  ];
  return build(count, rng, [
    { w: 26, f: (r, o) => { onEllipsoid(r, o, 0, 0, 0, 5.6, 6.6, 12.5, 0.3); o.tone = 0.12; } },
    { w: 8, f: (r, o) => { onEllipsoid(r, o, 0, 1.5, 8, 5.2, 6.4, 6, 0.3); o.tone = 0.2; } },
    { w: 7, f: (r, o) => { onTube(r, o, [0, 3, 10], [0, 12.5, 15.5], 3.4, 2.2); o.tone = 0.15; } },
    { w: 6, f: (r, o) => { onEllipsoid(r, o, 0, 14.2, 18.6, 2.6, 2.9, 4.9, 0.3); o.tone = 0.3; } },
    {
      w: 1.5,
      f: (r, o) => {
        const s = r() < 0.5 ? 1 : -1;
        onTube(r, o, [s * 1.8, 16, 17], [s * 4.8, 17.4, 15.2], 0.8, 0.25);
        o.tone = 0.4;
      },
    },
    {
      w: 16,
      f: (r, o) => {
        const segs = r() < 0.5 ? antL : antR;
        const sg = segs[Math.floor(r() * segs.length)];
        onTube(r, o, sg[0], sg[1], sg[2], sg[2] * 0.6);
        o.part = 5;
        o.tone = 0.85;
      },
    },
    {
      w: 21,
      f: (r, o) => {
        const L = legs[Math.floor(r() * 4)];
        const t = r();
        const fwd = L.part === 1 ? 1.2 : -1.6;
        if (t < 0.5) onTube(r, o, [L.x, -2, L.z], [L.x, -11, L.z + fwd], 1.9, 1.1, t * 2);
        else onTube(r, o, [L.x, -11, L.z + fwd], [L.x, -19.5, L.z], 1.0, 0.55, (t - 0.5) * 2);
        o.part = L.part;
        o.a = -2;
        o.b = L.z;
        o.c = L.ph;
        o.tone = t > 0.93 ? 0.9 : 0.1;
      },
    },
    { w: 1.2, f: (r, o) => { onTube(r, o, [0, 3, -12], [0, 5.5, -15.5], 1.2, 0.4); o.tone = 0.95; } },
    { w: 8, f: aura(28, 2) },
  ]);
}

function whaleRadius(s) {
  const r = s < 0.72 ? 13 * Math.pow(s / 0.72, 0.7) : 13 * Math.sqrt(Math.max(0, 1 - ((s - 0.72) / 0.28) ** 2));
  return Math.max(1.4, r);
}

function whale(count, rng) {
  return build(count, rng, [
    {
      w: 55,
      f: (r, o) => {
        const s = r();
        const rad = whaleRadius(s) * (r() < 0.18 ? Math.sqrt(r()) : 1);
        const a = r() * TAU;
        o.x = Math.cos(a) * rad;
        o.y = Math.sin(a) * rad * 0.82;
        o.z = lerp(-42, 34, s);
        o.c = Math.pow(1 - s, 1.6);
        o.tone = Math.sin(a) < -0.35 ? 0.75 : 0.08;
        // throat grooves: brighten stripes on the belly
        if (Math.sin(a) < -0.5 && s > 0.6 && Math.sin(a * 40) > 0.7) o.tone = 1;
      },
    },
    {
      w: 11,
      f: (r, o) => {
        const side = r() < 0.5 ? 1 : -1;
        const u = Math.sqrt(r());
        o.x = side * u * 19;
        o.z = -44 - u * 6 - r() * 9 * (1 - u * 0.55);
        o.y = (r() - 0.5) * 1.2;
        o.c = 1;
        o.tone = u > 0.9 ? 0.9 : 0.3;
      },
    },
    {
      w: 8,
      f: (r, o) => {
        const side = r() < 0.5 ? 1 : -1;
        const u = r();
        const chord = 6 * (1 - u * 0.8);
        o.x = side * lerp(10, 27, u);
        o.y = lerp(-5, -12, u);
        o.z = lerp(14, 3, u) - chord * r();
        o.part = 3;
        o.a = -5; // pivot y
        o.b = side * 10; // pivot x
        o.c = side;
        o.tone = 0.4;
      },
    },
    { w: 2, f: (r, o) => { const u = r(); o.x = (r() - 0.5) * 1.2; o.y = 9 + u * 4 * (1 - Math.abs(r() - 0.5)); o.z = -14 - u * 6; o.c = 0.5; o.tone = 0.5; } },
    {
      w: 5,
      f: (r, o) => {
        o.x = (r() - 0.5) * 1.5;
        o.y = 10.5;
        o.z = 22 + (r() - 0.5) * 1.5;
        o.part = 5;
        o.a = (r() * 2 - 1) * 0.6;
        o.b = (r() * 2 - 1) * 0.6;
        o.c = r();
        o.tone = 1;
      },
    },
    { w: 0.6, f: (r, o) => { const s = r() < 0.5 ? 1 : -1; onEllipsoid(r, o, s * 9.5, 0.5, 24, 0.7, 0.7, 0.7, 1); o.tone = 1; } },
    { w: 8, f: aura(60, 0) },
  ]);
}

function koiRadius(s) {
  return 7.5 * Math.pow(Math.max(0, Math.sin(Math.PI * (0.08 + 0.9 * s))), 0.75) + 0.6;
}

function koi(count, rng) {
  return build(count, rng, [
    {
      w: 45,
      f: (r, o) => {
        const s = r();
        const rad = koiRadius(s) * (r() < 0.15 ? Math.sqrt(r()) : 1);
        const a = r() * TAU;
        o.x = Math.cos(a) * rad * 0.62;
        o.y = Math.sin(a) * rad;
        o.z = lerp(-16, 18, s);
        o.c = Math.pow(1 - s, 1.3);
        const patch = Math.sin(o.z * 0.35 + 1.3) * Math.sin(a * 2 + o.z * 0.2);
        o.tone = patch > 0.15 ? 0.95 : 0;
      },
    },
    {
      w: 22,
      f: (r, o) => {
        const u = r();
        o.z = -16 - u * 26;
        o.y = (r() * 2 - 1) * (2.5 + u * 16) * (0.8 + 0.2 * Math.sin(u * 9));
        o.x = (r() - 0.5) * 0.9;
        o.part = 4;
        o.c = 1 + u * 1.2;
        o.tone = 0.25 + u * 0.6;
      },
    },
    {
      w: 6,
      f: (r, o) => {
        const s = 0.3 + r() * 0.5;
        const z = lerp(-16, 18, s);
        o.z = z;
        o.x = (r() - 0.5) * 0.6;
        o.y = koiRadius(s) + r() * 5.5 * Math.sin((Math.PI * (s - 0.3)) / 0.5);
        o.c = Math.pow(1 - s, 1.3);
        o.tone = 0.5;
      },
    },
    {
      w: 6,
      f: (r, o) => {
        const side = r() < 0.5 ? 1 : -1;
        const u = r();
        const fan = (r() - 0.5) * 6 * u;
        o.x = side * (4 + u * 8);
        o.y = -3 - u * 4 + fan * 0.3;
        o.z = 8 - u * 5 + fan;
        o.part = 3;
        o.a = -3;
        o.b = side * 4;
        o.c = side;
        o.tone = 0.6;
      },
    },
    {
      w: 2,
      f: (r, o) => {
        const side = r() < 0.5 ? 1 : -1;
        const u = r();
        o.x = side * (1.5 + u * 4);
        o.y = -1 - u * 3 - Math.sin(u * 3) * 1.5;
        o.z = 18 + u * 6;
        o.c = 0;
        o.tone = 1;
      },
    },
    { w: 6, f: aura(42, 0) },
  ]);
}

function luan(count, rng) {
  const plumes = 5;
  return build(count, rng, [
    { w: 13, f: (r, o) => { onEllipsoid(r, o, 0, 0, 0, 4, 4, 11, 0.3); o.tone = 0.2; } },
    { w: 5, f: (r, o) => { onTube(r, o, [0, 2, 8], [0, 9, 15], 2.6, 1.6); o.tone = 0.25; } },
    { w: 3, f: (r, o) => { onEllipsoid(r, o, 0, 10.5, 17, 2.2, 2.4, 3.5, 0.3); o.tone = 0.3; } },
    { w: 1, f: (r, o) => { onTube(r, o, [0, 10, 20], [0, 9, 23.5], 0.8, 0.1); o.tone = 1; } },
    {
      w: 3,
      f: (r, o) => {
        const j = Math.floor(r() * 3);
        const u = r();
        o.x = (j - 1) * 1.2 * u;
        o.y = 12 + u * 5 + Math.sin(u * 3) * 1.5;
        o.z = 15 - u * 7;
        o.part = 5;
        o.tone = u > 0.85 ? 1 : 0.6;
      },
    },
    {
      w: 40,
      f: (r, o) => {
        const side = r() < 0.5 ? 1 : -1;
        const u = r();
        const zle = 6 - u * 6 + Math.sin(u * Math.PI) * 3;
        const chord = lerp(16, 6, u);
        const scallop = (Math.sin(u * 14) * 0.5 + 0.5) * 4 * u;
        const v = Math.pow(r(), 0.7);
        o.x = side * (3 + u * 39);
        o.z = lerp(zle, zle - chord - scallop, v);
        o.y = Math.sin(u * Math.PI) * 3 - v * 1;
        o.part = 3;
        o.a = 0; // pivot y
        o.b = side * 3; // pivot x
        o.c = side;
        o.tone = v > 0.82 ? 0.85 : 0.1 + u * 0.2;
      },
    },
    {
      w: 28,
      f: (r, o) => {
        const j = Math.floor(r() * plumes);
        const spread = ((j - (plumes - 1) / 2) / plumes) * 0.9;
        const L = 46 + (j % 2) * 8;
        const u = r();
        const rr = (0.6 + 2.6 * u * u) * Math.sqrt(r());
        const a = r() * TAU;
        o.z = -10 - u * L;
        o.x = Math.sin(spread) * u * L + Math.sin(u * 6 + j) * 3 * u + Math.cos(a) * rr;
        o.y = -u * 6 + Math.sin(u * 5 + j) * 2 + Math.sin(a) * rr * 0.4;
        o.part = 4;
        o.c = u;
        o.tone = u > 0.88 ? 1 : 0.2 + u * 0.3;
      },
    },
    { w: 7, f: aura(60, 0) },
  ]);
}

function bloom(count, rng) {
  const layers = [
    { k: 6, len: 34, el: 0.22 },
    { k: 8, len: 28, el: 0.5 },
    { k: 10, len: 21, el: 0.85 },
    { k: 12, len: 14, el: 1.12 },
  ];
  return build(count, rng, [
    {
      w: 70,
      f: (r, o) => {
        const L = Math.min(3, Math.floor(Math.pow(r(), 0.8) * 4));
        const ly = layers[L];
        const j = Math.floor(r() * ly.k);
        const ang = (j / ly.k) * TAU + L * 0.33;
        const u = r();
        const width = Math.sin(Math.PI * Math.pow(u, 0.7)) * ly.len * 0.3;
        const v = r() * 2 - 1;
        const el = ly.el + u * 0.45;
        const rr = u * ly.len * Math.cos(el);
        const h = u * ly.len * Math.sin(el) - Math.abs(v) * 1.5 * u;
        const lat = v * width;
        o.x = Math.cos(ang) * rr - Math.sin(ang) * lat;
        o.z = Math.sin(ang) * rr + Math.cos(ang) * lat;
        o.y = h;
        o.part = 3;
        o.a = L;
        o.c = u;
        o.tone = Math.abs(v) > 0.86 || u > 0.93 ? 1 : 0.1 + L * 0.12;
      },
    },
    {
      w: 15,
      f: (r, o) => {
        const j = Math.floor(r() * 40);
        const ang = j * 2.39996;
        const tilt = 0.25 + (j % 7) * 0.05;
        const L = 12 + (j % 5) * 1.6;
        const u = r();
        o.x = Math.cos(ang) * Math.sin(tilt) * L * u;
        o.z = Math.sin(ang) * Math.sin(tilt) * L * u;
        o.y = 2 + Math.cos(tilt) * L * u;
        o.part = 5;
        o.c = u;
        o.tone = u > 0.9 ? 1 : 0.5;
      },
    },
    { w: 5, f: (r, o) => { onEllipsoid(r, o, 0, 3, 0, 3, 2.5, 3, 0.6); o.tone = 1; } },
    { w: 10, f: aura(62, 10) },
  ]);
}

const BUILDERS = [deer, whale, koi, luan, bloom];

export function buildCreature(kind, count, seed = 1) {
  const rng = mulberry32(seed * 7919 + kind * 104729);
  return BUILDERS[kind](count, rng);
}
