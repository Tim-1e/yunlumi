import * as THREE from 'three';
import { U, hexToRGB } from './gfx/common.js';
import { clamp, dampFactor, segPointDist2, mulberry32, TAU, smoothstep } from './core/math.js';
import { FLIGHT, makeFlightState, stepFlight, forwardFromAngles, rightFromYaw, yawToward, speedOf } from './core/flight.js';
import { Run, RULES } from './core/rules.js';
import { GLOOM, setGloomState, gloomCanHurt } from './core/gloomAI.js';
import { CONSTELLATIONS, START, layoutConstellations, roadControlPoints, cloudTowers, lanternSpots } from './core/data.js';
import { createSky } from './world/sky.js';
import { createClouds, MAX_LIGHTS } from './world/clouds.js';
import { Roads } from './world/roads.js';
import { Constellations, allyPath, finalePath } from './world/constellations.js';
import { GloomSwarm } from './world/gloom.js';
import { ShootingStar, Lanterns } from './world/events.js';
import { Bursts } from './fx/bursts.js';
import { Comet, createDust } from './fx/comet.js';
import { Sound } from './audio.js';
import { Input } from './input.js';
import { HUD } from './hud.js';

// We author every colour in display space and output it untouched.
THREE.ColorManagement.enabled = false;

const $ = (id) => document.getElementById(id);

function fatal(msg) {
  const e = $('error');
  e.querySelector('p').textContent = msg;
  e.classList.remove('hidden');
  $('menu').classList.add('hidden');
}

// ------------------------------------------------------------------ settings
const QUALITY = {
  high: { frac: 1, pr: 2 },
  medium: { frac: 0.62, pr: 1.5 },
  low: { frac: 0.38, pr: 1 },
};
const settings = { quality: 'auto', sens: 1, invertY: false };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem('yunlumi.settings') || '{}'));
} catch (e) {
  /* ignore */
}
function saveSettings() {
  try {
    localStorage.setItem('yunlumi.settings', JSON.stringify(settings));
  } catch (e) {
    /* ignore */
  }
}
function autoQuality() {
  const mobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  if (mobile) return 'low';
  return (navigator.hardwareConcurrency || 4) >= 8 ? 'high' : 'medium';
}
function qualityKey() {
  const k = settings.quality === 'auto' ? autoQuality() : settings.quality;
  return QUALITY[k] ? k : 'medium';
}
if (!(settings.sens > 0.1 && settings.sens < 5)) settings.sens = 1;

// ------------------------------------------------------------------ renderer
const canvas = $('c');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
} catch (e) {
  fatal('无法创建 WebGL2 上下文。请使用最新版 Chrome / Edge / Firefox / Safari，并开启硬件加速。');
  throw e;
}
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setClearColor(0x04050d, 1);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.5, 6000);
camera.rotation.order = 'YXZ';
scene.add(camera);

const dyn = { scale: 1, acc: 0, frames: 0, timer: 0 };
function pixelRatio() {
  const cap = QUALITY[qualityKey()].pr;
  return Math.max(0.5, Math.min(window.devicePixelRatio || 1, cap) * dyn.scale);
}
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(w, h);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
  U.uPR.value = renderer.getPixelRatio();
}
window.addEventListener('resize', resize);
resize();

// ------------------------------------------------------------------ world
const layout = layoutConstellations();
const towers = cloudTowers();
const sky = createSky(scene);
const clouds = createClouds(scene, towers);
const clusterCenters = [
  ...towers.map((t) => [t.x, t.height + 22, t.z]),
  ...layout.map((L) => [L.center[0] - L.dir[0] * 30, L.center[1] - 45, L.center[2] - L.dir[2] * 30]),
];
const roads = new Roads(scene, roadControlPoints(layout), clusterCenters);
const consts = new Constellations(scene, layout);
const gloom = new GloomSwarm(scene);
const bursts = new Bursts(scene);
const comet = new Comet(scene);
const dustU = createDust(scene);
const star = new ShootingStar(scene, bursts);
const lanterns = new Lanterns(scene, lanternSpots(towers));
const sound = new Sound();
const input = new Input(canvas);
const hud = new HUD();

function applyQuality() {
  const q = QUALITY[qualityKey()];
  clouds.setQuality(q.frac);
  consts.setQuality(q.frac);
  dyn.scale = 1;
  resize();
}
applyQuality();

const SIZES = CONSTELLATIONS.map((c) => c.stars.length);
const KEYS = CONSTELLATIONS.map((c) => c.upgrade.key);
const FINALE_CENTER = new THREE.Vector3(0, 215, 0);
const rng = mulberry32(Date.now() & 0xffff);

// ------------------------------------------------------------------ game state
const G = {
  mode: 'menu',
  prevMode: 'playing',
  awaitingLock: false,
  lockErrors: 0,
  run: new Run(SIZES, KEYS),
  fs: makeFlightState(...START.pos),
  pos: new THREE.Vector3(...START.pos),
  prev: new THREE.Vector3(...START.pos),
  camFollow: new THREE.Vector3(...START.pos),
  roll: 0,
  turn: 0,
  fovKick: 0,
  shake: 0,
  invuln: 0,
  pulseCd: 0,
  deniedCd: 0,
  spawnT: 0,
  shootT: 0,
  endT: 0,
  fireworkT: 0,
  aurora: 0,
  finale: 0,
  dawn: 0,
  time: 0,
  hints: {},
  flashes: [], // transient cloud lights
  showFps: false,
};

function newRun() {
  G.run = new Run(SIZES, KEYS);
  const first = roadControlPoints(layout)[0].pts[1];
  const yaw = yawToward(first[0] - START.pos[0], first[2] - START.pos[2]);
  G.fs = makeFlightState(START.pos[0], START.pos[1], START.pos[2], yaw, 0.02);
  G.pos.set(...START.pos);
  G.prev.copy(G.pos);
  G.camFollow.copy(G.pos);
  G.roll = G.turn = G.fovKick = G.shake = 0;
  G.invuln = G.pulseCd = G.deniedCd = 0;
  G.spawnT = 22;
  G.shootT = 32;
  G.endT = 0;
  G.aurora = 0;
  G.finale = 0;
  G.dawn = 0;
  G.hints = {};
  G.flashes = [];
  consts.reset();
  roads.reset();
  gloom.reset();
  bursts.clear();
  star.stop();
  lanterns.reset();
  comet.reset(G.pos);
  comet.setPalette([[1, 0.85, 0.5]]);
  comet.setVisible(true);
  hud.resetConsts();
  U.uPulse.value.set(0, -999, 0, 99);
  input.clear();
}

// ------------------------------------------------------------------ mode transitions
const overlays = { menu: $('menu'), pause: $('pause'), results: $('results') };
function showOverlay(name) {
  Object.entries(overlays).forEach(([k, el]) => el.classList.toggle('hidden', k !== name));
}

function setMode(m) {
  G.mode = m;
  const inGame = m === 'playing' || m === 'finale' || m === 'dawn';
  hud.show(inGame || m === 'paused');
  document.body.classList.toggle('ingame', inGame);
  if (inGame) {
    showOverlay(null);
    // a focused menu button would otherwise be "clicked" again by Space / Enter
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  }
}

/** Enter gameplay (from menu, pause or results), acquiring pointer lock when possible. */
function enterPlay(targetMode) {
  sound.init();
  sound.resume();
  G.prevMode = targetMode;
  $('lock-msg').textContent = '';
  if (!input.pointerLockSupported || input.lockFailed) {
    input.clear();
    setMode(targetMode);
    return;
  }
  G.awaitingLock = true;
  input.requestLock();
}

input.onLockChange = (locked) => {
  if (locked && G.awaitingLock) {
    G.awaitingLock = false;
    G.lockErrors = 0;
    input.clear();
    setMode(G.prevMode);
  } else if (!locked) {
    G.lastUnlock = performance.now();
    if (G.mode === 'playing' || G.mode === 'finale' || G.mode === 'dawn') pause();
  }
};
input.onLockError = () => {
  // Chrome rejects re-locking for about a second after the user pressed Esc — not a real failure.
  if (performance.now() - (G.lastUnlock || -1e9) < 1600) {
    $('lock-msg').textContent = '浏览器需要片刻才能再次锁定鼠标，请稍候再点一次。';
    return;
  }
  G.lockErrors++;
  if (G.lockErrors >= 2 && G.awaitingLock) {
    // e.g. sandboxed iframe: fall back to unlocked mouse look
    input.lockFailed = true;
    G.awaitingLock = false;
    setMode(G.prevMode);
    hud.hint('鼠标锁定不可用：已切换为无锁模式（鼠标移动即可转向，按 P 暂停）', 6);
  } else {
    $('lock-msg').textContent = '浏览器暂时拒绝锁定鼠标，请稍候再点一次。';
  }
};

function pause() {
  if (!(G.mode === 'playing' || G.mode === 'finale' || G.mode === 'dawn')) return;
  G.prevMode = G.mode;
  setMode('paused');
  showOverlay('pause');
  input.exitLock();
  sound.suspend();
}

function showResults() {
  const run = G.run;
  setMode('results');
  input.exitLock();
  let best = 0;
  try {
    best = Number(localStorage.getItem('yunlumi.best') || 0);
    if (run.score > best) {
      localStorage.setItem('yunlumi.best', String(run.score));
    }
  } catch (e) {
    /* ignore */
  }
  const isBest = run.score > best;
  $('res-title').textContent = run.won ? '云路尽明' : '天亮了';
  $('res-sub').textContent = run.won
    ? '五座星宿尽数苏醒，夜空为你绽放。'
    : `晨光漫过云海。你唤醒了 ${run.completedCount} / 5 座星宿。`;
  $('res-rank').textContent = run.rank();
  $('res-score').textContent = run.score.toLocaleString('en-US') + (isBest ? '  ★ 新纪录' : '');
  $('res-best').textContent = `最佳 ${Math.max(best, run.score).toLocaleString('en-US')}`;
  const st = run.stats;
  $('res-stats').innerHTML = [
    ['点亮星辰', `${run.litCount} / ${run.totalStars}`],
    ['收集光点', st.motes],
    ['最高连击', run.maxCombo],
    ['穿越风环', st.rings],
    ['驱散墨魇', st.gloom],
    ['追上流星', st.shooting],
    ['月灯', `${st.lanterns} / ${lanterns.spots.length}`],
    ['被夺之光', st.stolen],
    ['用时', `${Math.floor(run.elapsed)}s`],
    ...(run.won ? [['剩余时间奖励', run.timeBonus]] : []),
  ]
    .map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`)
    .join('');
  showOverlay('results');
  refreshBest();
}

function goMenu() {
  setMode('menu');
  showOverlay('menu');
  comet.setVisible(false);
  refreshBest();
}

function refreshBest() {
  let best = 0;
  try {
    best = Number(localStorage.getItem('yunlumi.best') || 0);
  } catch (e) {
    /* ignore */
  }
  $('menu-best').textContent = best > 0 ? `最佳纪录 ${best.toLocaleString('en-US')}` : '';
}

function startFinale() {
  G.mode = 'finale';
  G.endT = 0;
  G.fireworkT = 0;
  consts.startFinale(FINALE_CENTER);
  consts.creatures.forEach((cr, c) => {
    // the spirit that just awoke finishes forming first, then joins the circle
    if (cr.state === 'forming') cr.pendingPath = finalePath(c, FINALE_CENTER);
    else cr.follow(finalePath(c, FINALE_CENTER));
  });
  gloom.list.forEach((g) => gloom.kill(g));
  star.stop();
  hud.banner('云路尽明 · YUNLUMI', '五灵同游，昙华满天', '#ffe3a8', 7);
  sound.arpeggio(0, 15, 0.08, 0.08);
}

function startDawn() {
  G.mode = 'dawn';
  G.endT = 0;
  gloom.list.forEach((g) => gloom.kill(g));
  star.stop();
  hud.banner('天亮了', '晨光漫过云海……', '#ffc89a', 5);
  sound.dawn();
}

// ------------------------------------------------------------------ UI wiring
$('btn-start').addEventListener('click', () => {
  newRun();
  enterPlay('playing');
  hud.hint('移动鼠标转向 · W 前进 · Shift 疾飞 · 空格/C 升降', 7);
});
$('btn-resume').addEventListener('click', () => enterPlay(G.prevMode));
$('btn-restart').addEventListener('click', () => {
  newRun();
  enterPlay('playing');
});
$('btn-menu').addEventListener('click', goMenu);
$('btn-again').addEventListener('click', () => {
  newRun();
  enterPlay('playing');
});
$('btn-res-menu').addEventListener('click', goMenu);
canvas.addEventListener('click', () => {
  // click on the canvas while in fallback / pause-less state does nothing special
  if (G.mode === 'paused') enterPlay(G.prevMode);
});

const qSel = $('opt-quality');
qSel.value = settings.quality;
qSel.addEventListener('change', () => {
  settings.quality = qSel.value;
  saveSettings();
  applyQuality();
});
const sens = $('opt-sens');
sens.value = String(settings.sens);
sens.addEventListener('input', () => {
  settings.sens = Number(sens.value);
  saveSettings();
});
const inv = $('opt-invert');
inv.checked = !!settings.invertY;
inv.addEventListener('change', () => {
  settings.invertY = inv.checked;
  saveSettings();
});
const muteBtn = $('opt-mute');
function refreshMute() {
  muteBtn.textContent = sound.muted ? '声音：关' : '声音：开';
}
muteBtn.addEventListener('click', () => {
  sound.setMuted(!sound.muted);
  refreshMute();
});
refreshMute();
refreshBest();

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
});

function handleKeys() {
  for (const code of input.consumePressed()) {
    if (code === 'KeyM') {
      sound.setMuted(!sound.muted);
      refreshMute();
      hud.float(sound.muted ? '静音' : '声音开启', '#cfe');
    } else if (code === 'Backquote') {
      G.showFps = !G.showFps;
      hud.el.fps.style.display = G.showFps ? 'block' : 'none';
    } else if (code === 'KeyP' || (code === 'Escape' && !input.locked)) {
      if (G.mode === 'playing' || G.mode === 'finale' || G.mode === 'dawn') pause();
      else if (G.mode === 'paused' && code === 'KeyP') enterPlay(G.prevMode);
    } else if (code === 'KeyR' && (G.mode === 'paused' || G.mode === 'results')) {
      newRun();
      enterPlay('playing');
    } else if (code === 'Enter' && G.mode === 'menu') {
      $('btn-start').click();
    }
  }
}

// ------------------------------------------------------------------ gameplay helpers
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const fwdArr = [0, 0, 0];
const rightArr = [0, 0, 0];
const GOLD = [1, 0.85, 0.5];

function addFlash(pos, color, radius, life) {
  G.flashes.push({ x: pos.x, y: pos.y, z: pos.z, color, radius, life, max: life });
  if (G.flashes.length > 3) G.flashes.shift();
}

function doPulse() {
  const run = G.run;
  if (G.pulseCd > 0) return;
  if (!run.trySpendPulse()) {
    if (G.deniedCd <= 0) {
      sound.denied();
      hud.float(`绽光需要 ${run.pulseCost} 光`, '#ff9db5');
      G.deniedCd = 0.8;
    }
    return;
  }
  G.pulseCd = 0.9;
  const R = 30 * run.upgrades.pulseRadius;
  U.uPulse.value.set(G.pos.x, G.pos.y, G.pos.z, 0);
  bursts.emit(G.pos.x, G.pos.y, G.pos.z, { count: 260, color: [1, 0.9, 0.65], color2: [0.7, 0.9, 1], speed: R * 2.4, shell: true, life: 0.7, size: 1.6, drag: 2.2 });
  bursts.emit(G.pos.x, G.pos.y, G.pos.z, { count: 60, color: [1, 1, 1], speed: 10, life: 0.5, size: 0.9, drag: 3 });
  sound.pulse();
  G.fovKick += 6;
  addFlash(G.pos, [1, 0.85, 0.6], R * 1.5, 0.7);
  let kills = 0;
  for (const g of gloom.list) {
    if (!g.alive || g.state === 'dying') continue;
    const d = Math.hypot(g.x - G.pos.x, g.y - G.pos.y, g.z - G.pos.z);
    if (d < R + GLOOM.radius) {
      killGloom(g);
      kills++;
    }
  }
  if (kills > 1) hud.float(`驱散 ×${kills}`, '#ffd0ff', true);
}

function killGloom(g) {
  const run = G.run;
  const pts = run.killGloom();
  gloom.kill(g);
  roads.spawnFree(g.x, g.y, g.z, 6 + Math.min(40, g.stolen), 16);
  g.stolen = 0;
  bursts.emit(g.x, g.y, g.z, { count: 120, color: [0.8, 0.3, 1], color2: [1, 0.4, 0.6], speed: 30, life: 1.1, size: 1.8, drag: 2.5 });
  bursts.emit(g.x, g.y, g.z, { count: 40, color: [1, 0.95, 0.8], speed: 14, life: 1.2, size: 1.2, drag: 1.5 });
  sound.bell(10, 0.06);
  if (pts) hud.float(`+${pts} 驱散墨魇`, '#e9b8ff');
}

function igniteFx(N, completed) {
  const C = CONSTELLATIONS[N.c];
  const col = hexToRGB(C.color);
  const p = N.pos;
  bursts.stream(G.pos.x, G.pos.y, G.pos.z, p.x, p.y, p.z, { count: 50, color: GOLD, time: 0.35, size: 1.5 });
  bursts.emit(p.x, p.y, p.z, { count: 320, color: col, color2: [1, 1, 1], speed: 42, life: 1.6, size: 2.2, drag: 1.8 });
  bursts.emit(p.x, p.y, p.z, { count: 160, color: [1, 1, 1], color2: col, speed: 70, shell: true, life: 0.9, size: 1.4, drag: 2.5 });
  addFlash(p, col.map((x) => x * 0.8), 70, 1.6);
  sound.bell(N.n + N.c * 2, 0.13);
  G.fovKick += 7;
  G.shake = Math.max(G.shake, 0.4);
  if (completed) {
    const L = layout[N.c];
    const ctr = new THREE.Vector3(...L.center);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      bursts.emit(ctr.x + Math.cos(a) * 50, ctr.y + Math.sin(a) * 40, ctr.z, {
        count: 180,
        color: col,
        color2: [1, 1, 1],
        speed: 36,
        life: 2.2,
        size: 2.4,
        drag: 1.2,
        gravity: 6,
      });
    }
    addFlash(ctr, col, 200, 4);
    G.shake = Math.max(G.shake, 1);
    G.fovKick += 10;
  }
}

function gloomTarget(run) {
  return Math.min(13, 2 + Math.floor(run.elapsed / 32) + run.completedCount);
}

function spawnGloomFar(p) {
  for (let tries = 0; tries < 8; tries++) {
    const a = rng() * TAU;
    const d = 170 + rng() * 150;
    const x = p.x + Math.cos(a) * d;
    const z = p.z + Math.sin(a) * d;
    if (Math.hypot(x, z) > FLIGHT.boundR) continue;
    const y = clamp(p.y + (rng() - 0.5) * 120, 30, 260);
    return gloom.spawn(x, y, z);
  }
  return null;
}

// ------------------------------------------------------------------ simulation
function simulate(dt) {
  const run = G.run;
  const fs = G.fs;
  const control = G.mode === 'playing' || G.mode === 'finale' || G.mode === 'dawn';

  // --- look
  const m = input.consumeMouse();
  const sens = 0.0021 * settings.sens;
  fs.yaw -= m.dx * sens;
  fs.pitch -= m.dy * sens * (settings.invertY ? -1 : 1);
  fs.pitch = clamp(fs.pitch, -FLIGHT.pitchLimit, FLIGHT.pitchLimit);
  G.turn += (m.dx / Math.max(dt, 1e-3) - G.turn) * dampFactor(8, dt);

  // --- move
  const ax = control ? input.axis() : { f: 0, b: 0, l: 0, r: 0, u: 0, d: 0, boost: false };
  const trig = input.consumeTriggers();
  G.prev.copy(G.pos);
  const res = stepFlight(fs, { ...ax, dash: trig.includes('dash') }, dt, FLIGHT, run.upgrades);
  G.pos.set(fs.pos[0], fs.pos[1], fs.pos[2]);
  const speed = speedOf(fs);
  if (res.dashed) {
    sound.whoosh(true, 0.25, 0.4);
    bursts.emit(G.pos.x, G.pos.y, G.pos.z, { count: 90, color: [0.8, 0.95, 1], color2: GOLD, speed: 22, life: 0.6, size: 1.4, drag: 3 });
    G.fovKick += 12;
  }
  if (trig.includes('pulse')) doPulse();

  // --- time
  if (G.mode === 'playing') {
    const ev = run.tick(dt);
    if (ev === 'dawn') startDawn();
  } else run.tick(dt);
  G.pulseCd -= dt;
  G.deniedCd -= dt;
  G.invuln -= dt;

  // --- motes
  const magnetR = 11 * run.upgrades.magnet;
  let got = 0;
  let lastI = -1;
  roads.update(dt, G.pos, magnetR, (i) => {
    got++;
    lastI = i;
  });
  if (got > 0) {
    let pts = 0;
    for (let k = 0; k < got; k++) pts += run.collectMote();
    sound.chime(run.combo);
    const c = roads.moteColor(lastI);
    bursts.emit(G.pos.x, G.pos.y, G.pos.z, { count: Math.min(30, 5 * got), color: c, color2: [1, 1, 1], speed: 9, life: 0.5, size: 0.9, drag: 3 });
  }

  // --- wind rings
  const ring = roads.checkRings(G.prev, G.pos);
  if (ring) {
    const pts = run.passRing();
    const vdotn = fs.vel[0] * ring.n.x + fs.vel[1] * ring.n.y + fs.vel[2] * ring.n.z;
    const s = vdotn >= 0 ? 1 : -1;
    fs.vel[0] += ring.n.x * s * 32;
    fs.vel[1] += ring.n.y * s * 32;
    fs.vel[2] += ring.n.z * s * 32;
    fs.boost = Math.min(FLIGHT.boostMax * run.upgrades.boostMax, fs.boost + 1);
    sound.ring(run.combo);
    bursts.emit(ring.c.x, ring.c.y, ring.c.z, { count: 140, color: [0.6, 0.95, 1], color2: [1, 0.9, 0.6], speed: 26, shell: true, life: 0.8, size: 1.3, drag: 2, radius: 6 });
    G.fovKick += 9;
    if (pts) hud.float(`+${pts} 风环`, '#a8f0ff');
  }

  // --- stars
  const N = consts.hitNode(G.prev, G.pos, run.lit);
  if (N) {
    const r = run.tryIgnite(N.c, N.n);
    if (r.ok) {
      consts.ignite(N.c, N.n, run.lit[N.c]);
      igniteFx(N, r.completed);
      hud.float(`+${RULES.igniteScore} 点亮星辰`, CONSTELLATIONS[N.c].color);
      if (!G.hints.lit) G.hints.lit = true;
      if (r.completed) {
        const C = CONSTELLATIONS[N.c];
        consts.awaken(N.c, allyPath(N.c));
        hud.banner(`${C.name} 苏醒`, `${C.upgrade.label}：${C.upgrade.desc}　·　夜晚延长 ${RULES.bonusSecondsPerConstellation} 秒`, C.color, 5.5);
        sound.arpeggio(N.c * 2, 10, 0.09, 0.09);
        comet.setPalette(
          CONSTELLATIONS.map((cc, i) => (run.completed[i] ? hexToRGB(cc.color) : null))
            .filter(Boolean)
            .concat([GOLD]),
        );
        G.aurora = run.completedCount / 5;
        if (r.allDone) startFinale();
      }
    } else if (r.reason === 'light' && G.deniedCd <= 0) {
      sound.denied();
      hud.float(`还需 ${r.need} 光`, '#ff9db5');
      bursts.emit(N.pos.x, N.pos.y, N.pos.z, { count: 30, color: [1, 0.4, 0.55], speed: 12, life: 0.6, size: 1.2 });
      G.deniedCd = 1.2;
    }
  }

  // --- gloom
  if (G.mode === 'playing') {
    G.spawnT -= dt;
    if (G.spawnT <= 0) {
      G.spawnT = 4.5;
      if (gloom.aliveCount < gloomTarget(run)) spawnGloomFar(G.pos);
    }
  }
  gloom.update(dt, G.pos, 1 + run.completedCount * 0.06 + Math.min(0.25, run.elapsed / 900));
  let threat = 0;
  const dashing = fs.dashT > 0;
  const allies = consts.creatures.filter((c) => c.state === 'roam');
  for (const g of gloom.list) {
    if (!g.alive || g.state === 'dying') continue;
    const dd = Math.hypot(g.x - G.pos.x, g.y - G.pos.y, g.z - G.pos.z);
    if (g.state === 'chase') threat = Math.max(threat, 1 - dd / GLOOM.senseR);
    const d2 = segPointDist2(G.prev.x, G.prev.y, G.prev.z, G.pos.x, G.pos.y, G.pos.z, g.x, g.y, g.z);
    if (dashing && d2 < (GLOOM.radius + 3.5) ** 2) {
      killGloom(g);
      G.shake = Math.max(G.shake, 0.5);
      continue;
    }
    if (gloomCanHurt(g) && G.invuln <= 0 && d2 < GLOOM.radius ** 2 && G.mode === 'playing') {
      const amt = run.steal();
      g.stolen += amt;
      setGloomState(g, 'flee');
      tmpV.set(G.pos.x - g.x, G.pos.y - g.y, G.pos.z - g.z).normalize();
      fs.vel[0] = tmpV.x * 42;
      fs.vel[1] = tmpV.y * 42 + 8;
      fs.vel[2] = tmpV.z * 42;
      G.invuln = 1.4;
      G.shake = Math.max(G.shake, 1.2);
      hud.flash();
      sound.hit();
      if (amt > 0) {
        bursts.stream(G.pos.x, G.pos.y, G.pos.z, g.x, g.y, g.z, { count: Math.min(80, amt * 4), color: GOLD, time: 0.5, size: 1.3 });
        hud.float(`−${amt} 光被夺走`, '#ff7aa2', true);
      }
      if (!G.hints.gloomHit) {
        G.hints.gloomHit = true;
        hud.hint('驱散墨魇能夺回被偷的光：左键/E 绽光，或右键/Q 冲刺穿透它', 7);
      }
      continue;
    }
    // spirits protect you
    for (const a of allies) {
      const ap = a.position;
      if (Math.hypot(g.x - ap.x, g.y - ap.y, g.z - ap.z) < 16 * a.scale) {
        gloom.kill(g);
        roads.spawnFree(g.x, g.y, g.z, 4 + Math.min(30, g.stolen), 12);
        g.stolen = 0;
        bursts.emit(g.x, g.y, g.z, { count: 80, color: [0.8, 0.3, 1], color2: [1, 1, 1], speed: 24, life: 1, size: 1.6 });
        break;
      }
    }
    if (!G.hints.gloom && g.state === 'chase' && dd < 110) {
      G.hints.gloom = true;
      hud.hint('墨魇在追你！它会偷走你的光 —— 左键/E 绽光 · 右键/Q 冲刺穿透', 7);
    }
  }

  // --- shooting star
  if (G.mode === 'playing') {
    G.shootT -= dt;
    if (G.shootT <= 0 && !star.active) {
      star.spawn(G.pos);
      G.shootT = 36 + rng() * 18;
      hud.hint('流星划过！Shift 疾飞追上它', 4);
      sound.arpeggio(10, 4, 0.06, 0.05);
    }
  }
  if (star.update(dt) === 'missed') hud.float('流星远去了……', '#c9b8ff');
  if (star.check(G.prev, G.pos)) {
    const p = star.pos.clone();
    star.stop();
    const pts = run.catchShootingStar();
    bursts.emit(p.x, p.y, p.z, { count: 400, color: [1, 0.8, 0.95], color2: [0.7, 0.9, 1], speed: 50, life: 1.8, size: 2, drag: 1.6 });
    addFlash(p, [1, 0.7, 0.9], 90, 1.5);
    sound.arpeggio(5, 8, 0.05, 0.08);
    G.fovKick += 10;
    if (pts) hud.float(`+${RULES.shootingStarLight} 光 · 追上流星！`, '#ffc9f0', true);
  }

  // --- lanterns
  const li = lanterns.check(G.prev, G.pos);
  if (li >= 0) {
    run.findLantern();
    const p = lanterns.spots[li];
    for (let k = 0; k < 4; k++) {
      bursts.emit(p.x, p.y, p.z, { count: 60, color: [1, 0.7, 0.35], color2: [1, 0.95, 0.7], speed: 10 + k * 6, life: 3, size: 1.6, drag: 0.8, gravity: -6 });
    }
    addFlash(p, [1, 0.6, 0.3], 80, 2.5);
    sound.bell(12, 0.1);
    sound.bell(14, 0.06);
    hud.float(`发现月灯 ${lanterns.foundCount}/${lanterns.spots.length}  +${RULES.lanternLight} 光`, '#ffd59a', true);
  }
  lanterns.update(dt);

  // --- ally gifts
  for (const a of allies) {
    a.giftT = (a.giftT || 0) - dt;
    if (a.giftT <= 0) {
      a.giftT = 3.5;
      const ap = a.position;
      if (ap.distanceTo(G.pos) < 320) roads.spawnFree(ap.x, ap.y, ap.z, 4, 10);
    }
  }

  // --- finale fireworks / endings
  if (G.mode === 'finale') {
    G.endT += dt;
    G.finale = Math.min(1, G.finale + dt / 4);
    G.fireworkT -= dt;
    if (G.fireworkT <= 0) {
      G.fireworkT = 0.35;
      const c = CONSTELLATIONS[Math.floor(rng() * 5)];
      const col = hexToRGB(c.color);
      const a = rng() * TAU;
      const r = 120 + rng() * 200;
      bursts.emit(FINALE_CENTER.x + Math.cos(a) * r, FINALE_CENTER.y + (rng() - 0.3) * 150, FINALE_CENTER.z + Math.sin(a) * r, {
        count: 200,
        color: col,
        color2: [1, 1, 1],
        speed: 40,
        shell: true,
        life: 2.2,
        size: 2.6,
        drag: 1.1,
        gravity: 5,
      });
      if (rng() < 0.4) sound.bell(Math.floor(rng() * 10), 0.05);
    }
    if (G.endT > 17) showResults();
  } else if (G.mode === 'dawn') {
    G.endT += dt;
    G.dawn = Math.min(1, G.dawn + dt / 4.5);
    if (G.endT > 6.5) showResults();
  }

  // --- boundary hint
  const rr = Math.hypot(G.pos.x, G.pos.z);
  G.edge01 = smoothstep(FLIGHT.boundR - 30, FLIGHT.boundR + 60, rr);

  // --- tutorial
  if (G.mode === 'playing') {
    if (!G.hints.road && run.elapsed > 7) {
      G.hints.road = true;
      hud.hint('沿着发光的云路飞行，靠近光点自动吸收（连续吸收有连击）', 7);
    }
    if (!G.hints.carry && run.light >= RULES.igniteCost) {
      G.hints.carry = true;
      hud.hint(`带着 ${RULES.igniteCost} 光穿过沉睡的星辰，将它点亮（跟随屏幕上的指引）`, 7);
    }
  }

  // --- audio
  sound.update(clamp(speed / 90, 0, 1), clamp(threat, 0, 1));
  return { speed, ax };
}

// ------------------------------------------------------------------ camera
function updateCamera(dt, speed, ax) {
  const fs = G.fs;
  forwardFromAngles(fs.yaw, fs.pitch, fwdArr);
  rightFromYaw(fs.yaw, rightArr);
  G.camFollow.lerp(G.pos, dampFactor(11, dt));
  const latV = fs.vel[0] * rightArr[0] + fs.vel[2] * rightArr[2];
  const rollTarget = clamp(-latV * 0.008 - G.turn * 0.00022, -0.55, 0.55);
  G.roll += (rollTarget - G.roll) * dampFactor(5, dt);
  G.shake *= Math.exp(-4.5 * dt);
  G.fovKick *= Math.exp(-3.5 * dt);
  const sh = G.shake;
  camera.position.set(
    G.camFollow.x - fwdArr[0] * 9.5 + (rng() - 0.5) * sh,
    G.camFollow.y - fwdArr[1] * 9.5 + 2.6 + (rng() - 0.5) * sh,
    G.camFollow.z - fwdArr[2] * 9.5 + (rng() - 0.5) * sh,
  );
  camera.rotation.set(fs.pitch, fs.yaw, G.roll, 'YXZ');
  const fov = 68 + clamp(speed / 90, 0, 1) * 16 + Math.min(20, G.fovKick);
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  camera.updateMatrixWorld(); // HUD indicators project with this frame's camera
}

function attractCamera(t) {
  const a = t * 0.035 + 0.4;
  camera.position.set(Math.cos(a) * 190, 135 + Math.sin(t * 0.05) * 20, Math.sin(a) * 190);
  camera.lookAt(Math.cos(a + 1.2) * 330, 120, Math.sin(a + 1.2) * 330);
  if (camera.fov !== 70) {
    camera.fov = 70;
    camera.updateProjectionMatrix();
  }
}

function resultsCamera(t, dt) {
  const a = t * 0.12;
  const target = G.mode === 'results' && G.run.won ? FINALE_CENTER : G.pos;
  const r = target === FINALE_CENTER ? 420 : 45;
  tmpV2.set(target.x + Math.cos(a) * r, target.y + (target === FINALE_CENTER ? 40 : 12), target.z + Math.sin(a) * r);
  camera.position.lerp(tmpV2, dampFactor(1.5, dt));
  camera.lookAt(target);
}

// ------------------------------------------------------------------ shared visuals
function updateVisuals(dt, speed) {
  const run = G.run;
  U.uTime.value = G.time;
  U.uDawn.value = G.dawn;
  U.uCam.value.copy(camera.position);
  const showPlayer = G.mode !== 'menu';
  U.uPlayer.value.copy(showPlayer ? G.pos : tmpV.set(0, -9999, 0));
  U.uPulse.value.w += dt;
  U.uPR.value = renderer.getPixelRatio();
  U.uPixel.value = (window.innerHeight * renderer.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  const hurt = clamp(G.invuln / 1.4, 0, 1);
  comet.coreU.uHurt.value = hurt * (0.5 + 0.5 * Math.sin(G.time * 30));
  comet.coreU.uDash.value = clamp(G.fs.dashT / FLIGHT.dashTime, 0, 1);
  if (showPlayer) comet.update(G.pos, run.light, dt, G.time);
  dustU.uSpeed.value = clamp((speed - 20) / 60, 0, 1);
  sky.update(camera.position);
  sky.uniforms.uAurora.value += (G.aurora - sky.uniforms.uAurora.value) * dampFactor(1, dt);
  sky.uniforms.uFinale.value = G.finale;
  bursts.update(dt);
  consts.update(dt, G.time, G.pos, run.light, RULES.igniteCost);

  // dynamic cloud lights: spirits, shooting star, transient flashes
  let li = 0;
  const L = clouds.lights;
  const LC = clouds.lightCols;
  consts.creatures.forEach((cr, c) => {
    if (cr.state === 'hidden' || li >= MAX_LIGHTS) return;
    const col = hexToRGB(CONSTELLATIONS[c].color);
    const k = 0.35 * cr.u.uAlpha.value;
    L[li].set(cr.position.x, cr.position.y, cr.position.z, 45 * cr.scale);
    LC[li].set(col[0] * k, col[1] * k, col[2] * k);
    li++;
  });
  if (star.active && li < MAX_LIGHTS) {
    L[li].set(star.pos.x, star.pos.y, star.pos.z, 70);
    LC[li].set(0.6, 0.45, 0.6);
    li++;
  }
  for (let i = G.flashes.length - 1; i >= 0; i--) {
    const f = G.flashes[i];
    f.life -= dt;
    if (f.life <= 0) {
      G.flashes.splice(i, 1);
      continue;
    }
    if (li >= MAX_LIGHTS) continue;
    const k = f.life / f.max;
    L[li].set(f.x, f.y, f.z, f.radius);
    LC[li].set(f.color[0] * k, f.color[1] * k, f.color[2] * k);
    li++;
  }
  for (; li < MAX_LIGHTS; li++) {
    L[li].set(0, -99999, 0, 1);
    LC[li].set(0, 0, 0);
  }
}

// ------------------------------------------------------------------ HUD feed
const hudState = {};
const guideEl = $('guide');
const guideLabel = $('guide-label');
const shootEl = $('shoot-guide');
function updateHud(dt) {
  const run = G.run;
  const fs = G.fs;
  hudState.run = run;
  hudState.cost = RULES.igniteCost;
  hudState.boost01 = fs.boost / (FLIGHT.boostMax * run.upgrades.boostMax);
  hudState.boosting = fs.boosting;
  hudState.pulse01 = clamp(G.pulseCd / 0.9, 0, 1);
  hudState.dash01 = clamp(fs.dashCd / (FLIGHT.dashCooldown * run.upgrades.dashCooldown), 0, 1);
  hudState.nightMax = RULES.nightSeconds + RULES.bonusSecondsPerConstellation * run.completedCount;
  hudState.lanterns = lanterns.foundCount;
  hudState.lanternTotal = lanterns.spots.length;
  hudState.edge01 = G.edge01 || 0;
  // prompt for nearby dormant star
  hudState.prompt = '';
  hudState.promptBad = false;
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (G.mode === 'playing') {
    const target = consts.guideTarget(G.pos, run.lit);
    if (target) {
      const d = target.pos.distanceTo(G.pos);
      const C = CONSTELLATIONS[target.c];
      const need = run.light < RULES.igniteCost;
      if (d < 55) {
        hudState.prompt = need ? `光不足：还需 ${RULES.igniteCost - Math.floor(run.light)} 光` : `穿过星辰点亮它（−${RULES.igniteCost} 光）`;
        hudState.promptBad = need;
      }
      hud.indicator(guideEl, camera, target.pos, `${C.glyph} ${Math.round(d)}m${need ? ' · 先集光' : ''}`, w, h, guideLabel);
      guideEl.style.setProperty('--c', C.color);
    } else hud.indicator(guideEl, camera, null);
    hud.indicator(shootEl, camera, star.active ? star.pos : null, `流星 ${star.active ? Math.round(star.pos.distanceTo(G.pos)) : 0}m`, w, h, shootEl.querySelector('span'));
  } else {
    hud.indicator(guideEl, camera, null);
    hud.indicator(shootEl, camera, null);
  }
  hud.update(dt, hudState);
}

// ------------------------------------------------------------------ main loop
let last = performance.now();
let fpsAcc = 0;
let fpsFrames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000;
  last = now;
  const dt = Math.min(0.05, Math.max(0, raw || 0));
  G.time += dt;
  handleKeys();

  let speed = 0;
  const inGame = G.mode === 'playing' || G.mode === 'finale' || G.mode === 'dawn';
  if (inGame) {
    const r = simulate(dt);
    speed = r.speed;
    updateCamera(dt, speed, r.ax);
    updateHud(dt);
  } else if (G.mode === 'menu') {
    roads.update(dt, tmpV.set(0, -99999, 0), 0, () => {});
    attractCamera(G.time);
    sound.update(0, 0);
  } else if (G.mode === 'results') {
    roads.update(dt, tmpV.set(0, -99999, 0), 0, () => {});
    gloom.update(dt, G.pos, 1);
    if (G.mode === 'results' && G.run.won) G.finale = Math.min(1, G.finale + dt / 4);
    resultsCamera(G.time, dt);
  }
  // paused: world frozen, only time-based shimmer continues
  if (G.mode !== 'paused') updateVisuals(dt, speed);
  else U.uTime.value = G.time;
  camera.updateMatrixWorld();
  renderer.render(scene, camera);

  // adaptive resolution (only while flying, ignore hitches > 250ms)
  if (inGame && raw > 0 && raw < 0.25) {
    dyn.acc += raw;
    dyn.frames++;
    dyn.timer += raw;
    if (dyn.timer > 1.5) {
      const avg = dyn.acc / dyn.frames;
      if (avg > 1 / 45 && dyn.scale > 0.55) {
        dyn.scale = Math.max(0.55, dyn.scale - 0.1);
        resize();
      } else if (avg < 1 / 57 && dyn.scale < 1) {
        dyn.scale = Math.min(1, dyn.scale + 0.05);
        resize();
      }
      dyn.acc = dyn.frames = dyn.timer = 0;
    }
  }
  if (G.showFps) {
    fpsAcc += raw;
    fpsFrames++;
    if (fpsAcc > 0.5) {
      hud.el.fps.textContent = `${Math.round(fpsFrames / fpsAcc)} fps · ${renderer.getPixelRatio().toFixed(2)}x · ${bursts.active} fx`;
      fpsAcc = 0;
      fpsFrames = 0;
    }
  }
}

// Expose a tiny debug handle for manual QA in the console.
window.__yunlumi = { G, settings, consts, roads, gloom, renderer };
window.__yunlumiBooted = true;
$('error').classList.add('hidden'); // in case the slow-network watchdog fired before we booted
document.body.classList.add('ready');
comet.setVisible(false);
setMode('menu');
showOverlay('menu');
requestAnimationFrame(frame);
