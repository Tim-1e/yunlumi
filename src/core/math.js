// Pure math helpers (no DOM / no three.js) — usable from Node self-tests.

export const TAU = Math.PI * 2;

export function clamp(x, a, b) {
  return x < a ? a : x > b ? b : x;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Frame-rate independent smoothing factor: apply `x += (target - x) * dampFactor(l, dt)`. */
export function dampFactor(lambda, dt) {
  return 1 - Math.exp(-lambda * dt);
}

export function damp(a, b, lambda, dt) {
  return lerp(a, b, dampFactor(lambda, dt));
}

export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Deterministic PRNG. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(rng) {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

export function randOnSphere(rng, out = [0, 0, 0]) {
  const z = rng() * 2 - 1;
  const a = rng() * TAU;
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  out[0] = Math.cos(a) * r;
  out[1] = z;
  out[2] = Math.sin(a) * r;
  return out;
}

export function randInSphere(rng, out = [0, 0, 0]) {
  randOnSphere(rng, out);
  const r = Math.cbrt(rng());
  out[0] *= r;
  out[1] *= r;
  out[2] *= r;
  return out;
}

/** Squared distance from point P to segment AB (used for tunnelling-free hit tests). */
export function segPointDist2(ax, ay, az, bx, by, bz, px, py, pz) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len2 = dx * dx + dy * dy + dz * dz;
  let t = 0;
  if (len2 > 1e-12) {
    t = clamp(((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / len2, 0, 1);
  }
  const cx = ax + dx * t - px;
  const cy = ay + dy * t - py;
  const cz = az + dz * t - pz;
  return cx * cx + cy * cy + cz * cz;
}

/**
 * Did the segment A->B pass through a disc (center C, unit normal N, radius R)?
 * Returns true when the segment crosses the disc plane inside the radius.
 */
export function segCrossesDisc(ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz, r) {
  const da = (ax - cx) * nx + (ay - cy) * ny + (az - cz) * nz;
  const db = (bx - cx) * nx + (by - cy) * ny + (bz - cz) * nz;
  if ((da > 0 && db > 0) || (da < 0 && db < 0) || da === db) return false;
  const t = da / (da - db);
  const qx = ax + (bx - ax) * t - cx;
  const qy = ay + (by - ay) * t - cy;
  const qz = az + (bz - az) * t - cz;
  return qx * qx + qy * qy + qz * qz <= r * r;
}

function hash3i(x, y, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1440662683);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function fade(t) {
  return t * t * (3 - 2 * t);
}

/** Smooth value noise in [0,1]. */
export function valueNoise3(x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = fade(x - xi);
  const yf = fade(y - yi);
  const zf = fade(z - zi);
  const c000 = hash3i(xi, yi, zi);
  const c100 = hash3i(xi + 1, yi, zi);
  const c010 = hash3i(xi, yi + 1, zi);
  const c110 = hash3i(xi + 1, yi + 1, zi);
  const c001 = hash3i(xi, yi, zi + 1);
  const c101 = hash3i(xi + 1, yi, zi + 1);
  const c011 = hash3i(xi, yi + 1, zi + 1);
  const c111 = hash3i(xi + 1, yi + 1, zi + 1);
  const x00 = lerp(c000, c100, xf);
  const x10 = lerp(c010, c110, xf);
  const x01 = lerp(c001, c101, xf);
  const x11 = lerp(c011, c111, xf);
  return lerp(lerp(x00, x10, yf), lerp(x01, x11, yf), zf);
}

export function fbm3(x, y, z, octaves = 4) {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise3(x * freq, y * freq, z * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

export function fmtTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r < 10 ? '0' : ''}${r}`;
}

/** Catmull-Rom sampled polyline: returns Float32Array of `samples` points (xyz). */
export function sampleCatmull(points, samples) {
  const out = new Float32Array(samples * 3);
  const n = points.length;
  for (let i = 0; i < samples; i++) {
    const u = (i / (samples - 1)) * (n - 1);
    const seg = Math.min(n - 2, Math.floor(u));
    const t = u - seg;
    const p0 = points[Math.max(0, seg - 1)];
    const p1 = points[seg];
    const p2 = points[seg + 1];
    const p3 = points[Math.min(n - 1, seg + 2)];
    const t2 = t * t;
    const t3 = t2 * t;
    for (let k = 0; k < 3; k++) {
      out[i * 3 + k] =
        0.5 *
        (2 * p1[k] +
          (-p0[k] + p2[k]) * t +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
          (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
    }
  }
  return out;
}
