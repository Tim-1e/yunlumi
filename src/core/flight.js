// Pure flight model. Exact exponential-drag integration => identical motion at any frame rate
// for constant input (verified by tests/selftest.mjs).

export const FLIGHT = {
  accel: 63, // terminal cruise speed = accel / drag = 45
  boostAccel: 122, // terminal boost speed ≈ 87
  drag: 1.4,
  strafe: 0.85,
  vertical: 0.85,
  back: 0.65,
  dashSpeed: 118,
  dashTime: 0.34,
  dashCooldown: 2.2,
  boostMax: 3.2, // seconds of boost
  boostDrain: 1,
  boostRegen: 0.42,
  boostRegenDelay: 0.7,
  minY: 6,
  maxY: 330,
  boundR: 660,
  pitchLimit: 1.45,
};

export function forwardFromAngles(yaw, pitch, out = [0, 0, 0]) {
  const cp = Math.cos(pitch);
  out[0] = -Math.sin(yaw) * cp;
  out[1] = Math.sin(pitch);
  out[2] = -Math.cos(yaw) * cp;
  return out;
}

export function rightFromYaw(yaw, out = [0, 0, 0]) {
  out[0] = Math.cos(yaw);
  out[1] = 0;
  out[2] = -Math.sin(yaw);
  return out;
}

export function yawToward(dx, dz) {
  return Math.atan2(-dx, -dz);
}

export function makeFlightState(x = 0, y = 90, z = 0, yaw = 0, pitch = 0) {
  return {
    pos: [x, y, z],
    vel: [0, 0, 0],
    yaw,
    pitch,
    boost: FLIGHT.boostMax,
    boostDelay: 0,
    dashT: 0,
    dashCd: 0,
    boosting: false,
  };
}

const _f = [0, 0, 0];
const _r = [0, 0, 0];

/**
 * Advance the flight state.
 * input: {f,b,l,r,u,d (0..1), boost:boolean, dash:boolean(trigger)}
 * mods:  {boostMax, boostRegen, dashCooldown} multipliers from upgrades
 * returns {dashed:boolean}
 */
export function stepFlight(s, inp, dt, P = FLIGHT, mods = null) {
  const mBoostMax = mods ? mods.boostMax : 1;
  const mBoostRegen = mods ? mods.boostRegen : 1;
  const mDash = mods ? mods.dashCooldown : 1;

  s.pitch = Math.max(-P.pitchLimit, Math.min(P.pitchLimit, s.pitch));
  const fwd = forwardFromAngles(s.yaw, s.pitch, _f);
  const right = rightFromYaw(s.yaw, _r);
  const fb = inp.f - inp.b * P.back;
  const lr = (inp.r - inp.l) * P.strafe;
  const ud = (inp.u - inp.d) * P.vertical;
  let tx = fwd[0] * fb + right[0] * lr;
  let ty = fwd[1] * fb + ud;
  let tz = fwd[2] * fb + right[2] * lr;
  const tl = Math.hypot(tx, ty, tz);
  if (tl > 1) {
    tx /= tl;
    ty /= tl;
    tz /= tl;
  }
  const moving = tl > 0.05;

  // Boost energy
  const boostMax = P.boostMax * mBoostMax;
  s.boosting = false;
  if (inp.boost && moving && s.boost > 0) {
    s.boosting = true;
    s.boost = Math.max(0, s.boost - P.boostDrain * dt);
    s.boostDelay = P.boostRegenDelay;
  } else {
    s.boostDelay -= dt;
    if (s.boostDelay <= 0) s.boost = Math.min(boostMax, s.boost + P.boostRegen * mBoostRegen * dt);
  }
  if (s.boost > boostMax) s.boost = boostMax;

  // Dash (instant burst)
  let dashed = false;
  s.dashCd -= dt;
  s.dashT -= dt;
  if (inp.dash && s.dashCd <= 0) {
    let dx = tx;
    let dy = ty;
    let dz = tz;
    if (!moving) {
      dx = fwd[0];
      dy = fwd[1];
      dz = fwd[2];
    }
    const dl = Math.hypot(dx, dy, dz) || 1;
    s.vel[0] = (dx / dl) * P.dashSpeed;
    s.vel[1] = (dy / dl) * P.dashSpeed;
    s.vel[2] = (dz / dl) * P.dashSpeed;
    s.dashT = P.dashTime;
    s.dashCd = P.dashCooldown * mDash;
    dashed = true;
  }

  // Exact integration of v' = a - drag * v
  const a = s.boosting ? P.boostAccel : P.accel;
  const k = Math.exp(-P.drag * dt);
  const oneMinusK = (1 - k) / P.drag;
  const ax = tx * a;
  const ay = ty * a;
  const az = tz * a;
  for (let i = 0; i < 3; i++) {
    const acc = i === 0 ? ax : i === 1 ? ay : az;
    const vT = acc / P.drag;
    const v0 = s.vel[i];
    s.pos[i] += vT * dt + (v0 - vT) * oneMinusK;
    s.vel[i] = vT + (v0 - vT) * k;
  }

  // Soft world bounds (spring forces, scaled by dt)
  const p = s.pos;
  const v = s.vel;
  const r = Math.hypot(p[0], p[2]);
  if (r > P.boundR) {
    const push = (r - P.boundR) * 3 * dt;
    v[0] -= (p[0] / r) * push;
    v[2] -= (p[2] / r) * push;
    if (r > P.boundR + 140) {
      p[0] *= (P.boundR + 140) / r;
      p[2] *= (P.boundR + 140) / r;
    }
  }
  if (p[1] < P.minY) {
    v[1] += (P.minY - p[1]) * 7 * dt;
    if (v[1] < 0) v[1] *= Math.exp(-9 * dt);
    if (p[1] < P.minY - 8) p[1] = P.minY - 8;
  }
  if (p[1] > P.maxY) {
    v[1] -= (p[1] - P.maxY) * 6 * dt;
    if (p[1] > P.maxY + 60) p[1] = P.maxY + 60;
  }
  return { dashed };
}

export function speedOf(s) {
  return Math.hypot(s.vel[0], s.vel[1], s.vel[2]);
}
