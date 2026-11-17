// Pure steering for 墨魇 (gloom) — ink-shadow swarms that hunt the player's light.
import { dampFactor } from './math.js';

export const GLOOM = {
  senseR: 88,
  loseR: 160,
  wanderSpeed: 10,
  chaseSpeed: 27,
  fleeSpeed: 36,
  chaseMax: 9,
  fleeTime: 3.5,
  restTime: 4,
  spawnTime: 1.6,
  dieTime: 0.9,
  steer: 2.6,
  radius: 6.5,
  minY: 14,
  maxY: 300,
};

export function makeGloom(x, y, z, rng) {
  return {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    vz: 0,
    hx: x,
    hy: y,
    hz: z,
    wx: x,
    wy: y,
    wz: z,
    state: 'spawn',
    t: 0,
    chaseT: 0,
    fade: 0,
    stolen: 0,
    alive: true,
    seed: rng(),
  };
}

export function setGloomState(g, s) {
  g.state = s;
  g.t = 0;
  if (s === 'chase') g.chaseT = 0;
}

function pickWander(g, rng) {
  g.wx = g.hx + (rng() * 2 - 1) * 70;
  g.wy = Math.max(GLOOM.minY + 10, Math.min(GLOOM.maxY - 20, g.hy + (rng() * 2 - 1) * 35));
  g.wz = g.hz + (rng() * 2 - 1) * 70;
}

/** Steer one gloom. speedMul scales chase speed for difficulty. */
export function updateGloom(g, px, py, pz, dt, rng, speedMul = 1, P = GLOOM) {
  if (!g.alive) return;
  g.t += dt;
  const dx = px - g.x;
  const dy = py - g.y;
  const dz = pz - g.z;
  const dist = Math.hypot(dx, dy, dz) || 1e-6;
  let tx = 0;
  let ty = 0;
  let tz = 0;
  let speed = P.wanderSpeed;

  const wanderDir = () => {
    let wx = g.wx - g.x;
    let wy = g.wy - g.y;
    let wz = g.wz - g.z;
    const wl = Math.hypot(wx, wy, wz);
    if (wl < 8) {
      pickWander(g, rng);
      wx = g.wx - g.x;
      wy = g.wy - g.y;
      wz = g.wz - g.z;
    }
    const l = Math.hypot(wx, wy, wz) || 1;
    tx = wx / l;
    ty = wy / l;
    tz = wz / l;
  };

  switch (g.state) {
    case 'spawn':
      g.fade = Math.min(1, g.fade + dt / P.spawnTime);
      wanderDir();
      if (g.fade >= 1) setGloomState(g, 'wander');
      break;
    case 'wander':
      g.fade = 1;
      wanderDir();
      if (dist < P.senseR) setGloomState(g, 'chase');
      break;
    case 'chase':
      g.chaseT += dt;
      tx = dx / dist;
      ty = dy / dist;
      tz = dz / dist;
      speed = P.chaseSpeed * speedMul;
      if (dist > P.loseR || g.chaseT > P.chaseMax) setGloomState(g, 'rest');
      break;
    case 'flee':
      tx = -dx / dist;
      ty = -dy / dist + 0.25;
      tz = -dz / dist;
      speed = P.fleeSpeed;
      if (g.t > P.fleeTime) setGloomState(g, 'rest');
      break;
    case 'rest':
      wanderDir();
      speed = P.wanderSpeed * 0.7;
      if (g.t > P.restTime) setGloomState(g, 'wander');
      break;
    case 'dying':
      g.fade -= dt / P.dieTime;
      speed = 0;
      if (g.fade <= 0) {
        g.fade = 0;
        g.alive = false;
      }
      break;
    default:
      setGloomState(g, 'wander');
  }

  const k = dampFactor(P.steer, dt);
  g.vx += (tx * speed - g.vx) * k;
  g.vy += (ty * speed - g.vy) * k;
  g.vz += (tz * speed - g.vz) * k;
  g.x += g.vx * dt;
  g.y += g.vy * dt;
  g.z += g.vz * dt;
  if (g.y < P.minY) {
    g.y = P.minY;
    if (g.vy < 0) g.vy = 0;
  }
  if (g.y > P.maxY) {
    g.y = P.maxY;
    if (g.vy > 0) g.vy = 0;
  }
}

export function gloomCanHurt(g) {
  return g.alive && (g.state === 'wander' || g.state === 'chase' || g.state === 'rest');
}
