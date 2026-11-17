// Core-logic self test. Run: node tests/selftest.mjs   (Node >= 18, no dependencies)
import { damp, segPointDist2, segCrossesDisc, mulberry32, fbm3, sampleCatmull, fmtTime } from '../src/core/math.js';
import { FLIGHT, makeFlightState, stepFlight, speedOf, forwardFromAngles, rightFromYaw } from '../src/core/flight.js';
import { Run, RULES } from '../src/core/rules.js';
import { makeGloom, updateGloom, setGloomState, GLOOM } from '../src/core/gloomAI.js';
import { buildCreature } from '../src/core/shapes.js';
import { CONSTELLATIONS, layoutConstellations, roadControlPoints, cloudTowers, lanternSpots } from '../src/core/data.js';

let pass = 0;
let fail = 0;
function check(name, cond, extra = '') {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error(`  ✗ ${name} ${extra}`);
  }
}
function near(a, b, eps) {
  return Math.abs(a - b) <= eps;
}
function section(n) {
  console.log(`• ${n}`);
}

section('math');
{
  // damp: one 1/30 step == two 1/60 steps
  const a = damp(0, 10, 5, 1 / 30);
  const b = damp(damp(0, 10, 5, 1 / 60), 10, 5, 1 / 60);
  check('damp frame-rate independent', near(a, b, 1e-9), `${a} vs ${b}`);
  check('segPointDist2 mid', near(segPointDist2(0, 0, 0, 10, 0, 0, 5, 3, 0), 9, 1e-9));
  check('segPointDist2 clamp end', near(segPointDist2(0, 0, 0, 10, 0, 0, 13, 4, 0), 25, 1e-9));
  check('disc crossing hit', segCrossesDisc(0, 0, -5, 0, 1, 5, 0, 0, 0, 0, 0, 1, 3));
  check('disc crossing miss (outside radius)', !segCrossesDisc(5, 0, -5, 5, 0, 5, 0, 0, 0, 0, 0, 1, 3));
  check('disc crossing miss (same side)', !segCrossesDisc(0, 0, 1, 0, 0, 5, 0, 0, 0, 0, 0, 1, 3));
  const r1 = mulberry32(5);
  const r2 = mulberry32(5);
  check('rng deterministic', r1() === r2() && r1() === r2());
  let inRange = true;
  for (let i = 0; i < 500; i++) {
    const n = fbm3(i * 0.37, i * 0.11, i * 0.73);
    if (!(n >= 0 && n <= 1)) inRange = false;
  }
  check('fbm in [0,1]', inRange);
  const s = sampleCatmull([[0, 0, 0], [10, 0, 0], [20, 5, 0]], 21);
  check('catmull endpoints', near(s[0], 0, 1e-6) && near(s[60], 20, 1e-6) && near(s[61], 5, 1e-6));
  check('fmtTime', fmtTime(125.2) === '2:06' && fmtTime(-3) === '0:00');
}

section('flight (frame-rate independence, controls, bounds)');
{
  const run = (fps, seconds, inp) => {
    const s = makeFlightState(0, 100, 0, 0.3, 0.1);
    const steps = Math.round(fps * seconds);
    for (let i = 0; i < steps; i++) stepFlight(s, inp, 1 / fps);
    return s;
  };
  const W = { f: 1, b: 0, l: 0, r: 0, u: 0, d: 0, boost: false, dash: false };
  const a = run(30, 2, W);
  const b = run(144, 2, W);
  const dp = Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]);
  check('same position at 30fps vs 144fps', dp < 0.05, `diff=${dp.toFixed(4)}`);
  check('same speed at 30fps vs 144fps', near(speedOf(a), speedOf(b), 0.02));
  const long = run(60, 8, W);
  check('cruise speed ≈ accel/drag', near(speedOf(long), FLIGHT.accel / FLIGHT.drag, 0.5), speedOf(long).toFixed(2));
  // W moves along forward vector
  const s = makeFlightState(0, 100, 0, 0, 0);
  for (let i = 0; i < 60; i++) stepFlight(s, W, 1 / 60);
  check('W flies towards -Z at yaw 0', s.pos[2] < -10 && Math.abs(s.pos[0]) < 1e-6);
  const f = forwardFromAngles(0.7, 0);
  const r = rightFromYaw(0.7);
  check('right ⟂ forward', near(f[0] * r[0] + f[1] * r[1] + f[2] * r[2], 0, 1e-9));
  // boost faster, drains energy, regenerates
  const B = { ...W, boost: true };
  const sb = run(60, 2, B);
  check('boost faster than cruise', speedOf(sb) > speedOf(a) + 10);
  check('boost drains energy', sb.boost < FLIGHT.boostMax - 1.5);
  const sr = makeFlightState();
  sr.boost = 0;
  for (let i = 0; i < 120; i++) stepFlight(sr, { ...W }, 1 / 60);
  check('boost regenerates', sr.boost > 0.3);
  // dash: trigger once, then cooldown
  const sd = makeFlightState();
  const r0 = stepFlight(sd, { ...W, dash: true }, 1 / 60);
  check('dash triggers', r0.dashed && speedOf(sd) > 90);
  const r1 = stepFlight(sd, { ...W, dash: true }, 1 / 60);
  check('dash cooldown blocks re-trigger', !r1.dashed);
  // floor / bounds
  const sf = makeFlightState(0, 20, 0, 0, -1.4);
  for (let i = 0; i < 600; i++) stepFlight(sf, W, 1 / 60);
  check('cannot sink far below floor', sf.pos[1] > FLIGHT.minY - 8.01, sf.pos[1].toFixed(2));
  const so = makeFlightState(FLIGHT.boundR - 10, 100, 0, -Math.PI / 2, 0); // yaw -90° faces +X (outwards)
  for (let i = 0; i < 1200; i++) stepFlight(so, W, 1 / 60);
  const rr = Math.hypot(so.pos[0], so.pos[2]);
  check('soft boundary holds player', rr < FLIGHT.boundR + 141, rr.toFixed(1));
  check('pitch clamped', (() => { const p = makeFlightState(0, 100, 0, 0, 3); stepFlight(p, W, 1 / 60); return p.pitch <= FLIGHT.pitchLimit; })());
}

section('rules (economy, combo, constellations, dawn)');
{
  const sizes = CONSTELLATIONS.map((c) => c.stars.length);
  const keys = CONSTELLATIONS.map((c) => c.upgrade.key);
  const run = new Run(sizes, keys);
  check('starts with full night', run.time === RULES.nightSeconds && run.light === 0);
  const fail0 = run.tryIgnite(0, 0);
  check('ignite needs light', !fail0.ok && fail0.reason === 'light' && fail0.need === RULES.igniteCost);
  for (let i = 0; i < 40; i++) run.collectMote();
  check('combo multiplier grows', run.mult > 1 && run.combo === 40);
  check('mult capped at 5', (() => { const r = new Run(sizes, keys); for (let i = 0; i < 200; i++) r.collectMote(); return r.mult === 5; })());
  run.tick(RULES.comboWindow + 0.1);
  check('combo decays after window', run.combo === 0);
  check('light collected', run.light === 40);
  const ok = run.tryIgnite(0, 0);
  check('ignite spends light', ok.ok && run.light === 40 - RULES.igniteCost);
  check('cannot re-ignite', run.tryIgnite(0, 0).reason === 'lit');
  // complete deer constellation -> upgrade magnet + time bonus
  run.addLight(500);
  const t0 = run.time;
  let last = null;
  for (let n = 1; n < sizes[0]; n++) last = run.tryIgnite(0, n);
  check('constellation completes', last.completed && run.completed[0]);
  check('completion adds time', near(run.time, t0 + RULES.bonusSecondsPerConstellation, 1e-9));
  check('deer upgrade magnet', run.upgrades.magnet > 1.5);
  // steal
  const before = run.light;
  const st = run.steal();
  check('steal takes ~25%', st === Math.ceil(before * RULES.stealFraction) && run.light === before - st);
  const poor = new Run(sizes, keys);
  poor.addLight(2);
  check('steal never negative', poor.steal() === 2 && poor.light === 0);
  // pulse cost & whale upgrade
  check('pulse cost spent', (() => { const r = new Run(sizes, keys); r.addLight(10); return r.trySpendPulse() && r.light === 10 - RULES.pulseCost; })());
  check('pulse refused when poor', !new Run(sizes, keys).trySpendPulse());
  // complete everything -> win
  run.addLight(999);
  let res = null;
  for (let c = 1; c < sizes.length; c++) for (let n = 0; n < sizes[c]; n++) res = run.tryIgnite(c, n);
  check('all constellations -> win', res.allDone && run.won && run.over);
  check('time bonus awarded', run.timeBonus > 0);
  check('upgrades all applied', run.upgrades.moteValue === 2 && run.upgrades.dashCooldown === 0.5 && run.upgrades.pulseCost === 0.5);
  check('rank is A or S', ['A', 'S'].includes(run.rank()));
  check('no more scoring after over', run.collectMote() === 0);
  // dawn
  const d = new Run(sizes, keys);
  let ev = null;
  for (let i = 0; i < RULES.nightSeconds * 10 + 5; i++) ev = d.tick(0.1) || ev;
  check('dawn ends the run once', ev === 'dawn' && d.over && !d.won && d.tick(1) === null);
  check('dawn rank D with nothing lit', d.rank() === 'D');
}

section('gloom AI');
{
  const rng = mulberry32(3);
  const g = makeGloom(0, 100, 0, rng);
  for (let i = 0; i < 200; i++) updateGloom(g, 300, 100, 0, 1 / 60, rng);
  check('spawn -> wander', g.state === 'wander' && g.fade === 1);
  const g2 = makeGloom(0, 100, 0, rng);
  setGloomState(g2, 'wander');
  g2.fade = 1;
  const d0 = 60;
  let maxSpeed = 0;
  for (let i = 0; i < 120; i++) {
    updateGloom(g2, d0, 100, 0, 1 / 60, rng);
    maxSpeed = Math.max(maxSpeed, Math.hypot(g2.vx, g2.vy, g2.vz));
  }
  check('chases when player near', g2.state === 'chase');
  check('closes distance', Math.hypot(d0 - g2.x, g2.y - 100, g2.z) < d0 - 15);
  check('speed capped', maxSpeed <= GLOOM.chaseSpeed * 1.01, maxSpeed.toFixed(2));
  setGloomState(g2, 'flee');
  const df0 = Math.hypot(d0 - g2.x, g2.y - 100, g2.z);
  for (let i = 0; i < 90; i++) updateGloom(g2, d0, 100, 0, 1 / 60, rng);
  check('flees after stealing', Math.hypot(d0 - g2.x, g2.y - 100, g2.z) > df0 + 10);
  setGloomState(g2, 'dying');
  for (let i = 0; i < 120; i++) updateGloom(g2, d0, 100, 0, 1 / 60, rng);
  check('dies after dissolve', !g2.alive);
  // gives up a long chase
  const g3 = makeGloom(0, 100, 0, rng);
  setGloomState(g3, 'chase');
  g3.fade = 1;
  for (let i = 0; i < 60 * 11; i++) updateGloom(g3, g3.x + 50, 100, 0, 1 / 60, rng);
  check('gives up after chaseMax', g3.state !== 'chase');
}

section('shapes & world data');
{
  for (let k = 0; k < 5; k++) {
    const c = buildCreature(k, 3000, 1);
    let finite = true;
    let maxR = 0;
    for (let i = 0; i < c.pos.length; i++) if (!Number.isFinite(c.pos[i])) finite = false;
    for (let i = 0; i < c.count; i++) maxR = Math.max(maxR, Math.hypot(c.pos[i * 3], c.pos[i * 3 + 1], c.pos[i * 3 + 2]));
    const parts = new Set();
    for (let i = 0; i < c.count; i++) parts.add(c.anim[i * 4]);
    check(`creature ${k} size`, c.pos.length === 9000 && c.anim.length === 12000 && c.tone.length === 3000);
    check(`creature ${k} finite`, finite);
    check(`creature ${k} extent sane`, maxR > 15 && maxR < 120, maxR.toFixed(1));
    check(`creature ${k} has several parts`, parts.size >= 3);
  }
  let edgesOk = true;
  CONSTELLATIONS.forEach((c) => c.edges.forEach(([a, b]) => { if (!(a < c.stars.length && b < c.stars.length && a !== b)) edgesOk = false; }));
  check('edges valid', edgesOk);
  const L = layoutConstellations();
  let inBounds = true;
  L.forEach((l) => l.nodes.forEach((n) => { if (Math.hypot(n[0], n[2]) > FLIGHT.boundR || n[1] < 15 || n[1] > FLIGHT.maxY) inBounds = false; }));
  check('all stars reachable inside bounds', inBounds);
  const roads = roadControlPoints(L);
  check('10 cloud roads', roads.length === 10);
  let roadsOk = true;
  roads.forEach((r) => r.pts.forEach((p) => { if (p.some((x) => !Number.isFinite(x)) || p[1] < 0) roadsOk = false; }));
  check('roads finite and above sea', roadsOk);
  const towers = cloudTowers();
  const lan = lanternSpots(towers);
  check('lanterns placed', lan.length === 7 && lan.every((p) => p[1] >= FLIGHT.minY && p[1] <= FLIGHT.maxY));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
