/*
 * Yunlumi · core.js
 * 纯逻辑层：随机数、星座生成、夜游模拟、字轮文本。不依赖 DOM。
 * 浏览器中挂到 window.YL.core；Node 中通过 module.exports 导出（供 tests/selftest.js 使用）。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) {
    module.exports = api;
  } else {
    root.YL = root.YL || {};
    root.YL.core = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ *
   * 基础工具
   * ------------------------------------------------------------------ */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashString(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function dist(p, q) { return Math.hypot(p.x - q.x, p.y - q.y); }
  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
  function mod(n, m) { return ((n % m) + m) % m; }

  /* ------------------------------------------------------------------ *
   * 星座：最小生成树 + 深度优先点亮顺序
   * ------------------------------------------------------------------ */
  function mst(pts) {
    var n = pts.length;
    if (n < 2) return [];
    var inTree = [], best = [], parent = [], edges = [], i;
    for (i = 0; i < n; i++) { inTree.push(false); best.push(Infinity); parent.push(-1); }
    best[0] = 0;
    for (var k = 0; k < n; k++) {
      var u = -1;
      for (i = 0; i < n; i++) {
        if (!inTree[i] && (u === -1 || best[i] < best[u])) u = i;
      }
      inTree[u] = true;
      if (parent[u] !== -1) edges.push([parent[u], u]);
      for (var v = 0; v < n; v++) {
        if (!inTree[v]) {
          var d = dist(pts[u], pts[v]);
          if (d < best[v]) { best[v] = d; parent[v] = u; }
        }
      }
    }
    return edges;
  }

  /** 深度优先前序：保证每颗新点亮的星都与已点亮的某颗相连 */
  function dfsOrder(n, edges, start) {
    var adj = [], i;
    for (i = 0; i < n; i++) adj.push([]);
    edges.forEach(function (e) { adj[e[0]].push(e[1]); adj[e[1]].push(e[0]); });
    var seen = [], order = [], stack = [start];
    for (i = 0; i < n; i++) seen.push(false);
    while (stack.length) {
      var u = stack.pop();
      if (seen[u]) continue;
      seen[u] = true;
      order.push(u);
      // 逆序压栈，使编号小的邻居先被访问（结果稳定）
      var nb = adj[u].slice().sort(function (a, b) { return b - a; });
      for (var j = 0; j < nb.length; j++) if (!seen[nb[j]]) stack.push(nb[j]);
    }
    for (i = 0; i < n; i++) if (!seen[i]) order.push(i); // 理论上不会发生
    return order;
  }

  /**
   * 生成一个星座：stars 为点亮顺序排列的归一化坐标，edges 为索引对。
   * 坐标范围 x∈[0.08,0.92]，y∈[0.10,0.74]（偏上方，作为天幕背景）。
   */
  function generateConstellation(seed, count) {
    var rng = mulberry32(seed);
    var pts = [], minD = count > 7 ? 0.15 : 0.18, tries = 0, i;
    while (pts.length < count && tries < 3000) {
      tries++;
      var p = { x: 0.08 + rng() * 0.84, y: 0.10 + rng() * 0.64 };
      var ok = true;
      for (i = 0; i < pts.length; i++) {
        if (dist(p, pts[i]) < minD) { ok = false; break; }
      }
      if (ok) pts.push(p);
    }
    while (pts.length < count) pts.push({ x: 0.08 + rng() * 0.84, y: 0.10 + rng() * 0.64 });

    var raw = mst(pts);
    var start = 0;
    for (i = 1; i < pts.length; i++) if (pts[i].x < pts[start].x) start = i;
    var order = dfsOrder(pts.length, raw, start);
    var remap = [];
    order.forEach(function (oldIdx, newIdx) { remap[oldIdx] = newIdx; });
    var stars = order.map(function (o) {
      return { x: Math.round(pts[o].x * 1000) / 1000, y: Math.round(pts[o].y * 1000) / 1000 };
    });
    var edges = raw.map(function (e) {
      var a = remap[e[0]], b = remap[e[1]];
      return a < b ? [a, b] : [b, a];
    });
    return { stars: stars, edges: edges };
  }

  var NAME_PARTS = [
    ['鹿角', 'Antler'], ['云阶', 'Cloud Stair'], ['露珠', 'Dewdrop'], ['迷径', 'Lost Path'],
    ['灯芯', 'Wick'], ['纸鸢', 'Paper Kite'], ['月舟', 'Moon Boat'], ['茶烟', 'Tea Smoke'],
    ['竹铃', 'Bamboo Bell'], ['鲸歌', 'Whale Song'], ['雪羽', 'Snow Feather'], ['萤灯', 'Firefly Lamp'],
    ['琴弦', 'Lute String'], ['风铃', 'Wind Chime'], ['旧信', 'Old Letter'], ['陶笛', 'Ocarina'],
    ['鱼骨', 'Fishbone'], ['松果', 'Pinecone'], ['书签', 'Bookmark'], ['蒲公英', 'Dandelion'],
    ['小船', 'Little Boat'], ['梨花', 'Pear Blossom'], ['钥匙', 'Old Key'], ['毛线', 'Yarn']
  ];
  var NAME_MODS = [['远', 'Far'], ['小', 'Little'], ['晚', 'Late'], ['静', 'Still'], ['双', 'Twin'], ['微', 'Faint']];

  function nameConstellation(seed) {
    var rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
    var p = NAME_PARTS[Math.floor(rng() * NAME_PARTS.length)];
    var useMod = rng() < 0.45;
    var m = NAME_MODS[Math.floor(rng() * NAME_MODS.length)];
    return useMod
      ? { cn: m[0] + '·' + p[0] + '座', en: m[1] + ' ' + p[1] }
      : { cn: p[0] + '座', en: 'The ' + p[1] };
  }

  /* ------------------------------------------------------------------ *
   * 夜游模拟
   * ------------------------------------------------------------------ */
  var CFG = {
    deerR: 16, orbR: 9, collectPad: 6, mistHitScale: 0.74,
    startGlow: 100, maxGlow: 100, orbGlow: 6, verseGlow: 16, hurtGlow: 18, nightGlow: 45,
    decay: 2.2, decayPerNight: 0.42,
    orbRate: 1.3, orbRatePerNight: 0.08, helpfulHue: 0.38,
    mistRate: 0.22, mistRatePerNight: 0.12,
    lumiPerStar: 5, comboWindow: 1.8, comboMax: 5,
    dashSpeed: 980, dashTime: 0.26, dashCooldown: 2.2,
    invuln: 1.2, knockTime: 0.2,
    maxSpeed: 720, keySpeed: 420, followK: 9, accel: 12,
    flareRadius: 230, interlude: 3.4, maxDt: 0.05
  };
  var HUES = 3;

  function unitFor(w, h) { return clamp(Math.min(w, h) / 600, 0.6, 1.3); }
  function starCount(night) { return Math.min(4 + night, 9); }
  function orbRate(night) { return CFG.orbRate + CFG.orbRatePerNight * (night - 1); }
  function mistRate(night) { return CFG.mistRate + CFG.mistRatePerNight * (night - 1); }
  function mistCap(night) { return Math.min(3 + 2 * night, 14); }
  function decayRate(night) { return CFG.decay + CFG.decayPerNight * (night - 1); }

  function newVerse(rng) {
    var seq;
    do {
      seq = [Math.floor(rng() * HUES), Math.floor(rng() * HUES), Math.floor(rng() * HUES)];
    } while (seq[0] === seq[1] && seq[1] === seq[2]);
    return { seq: seq, idx: 0 };
  }

  /** 推进「韵」：返回 'advance' | 'complete' | 'reset' */
  function advanceVerse(v, hue) {
    if (hue === v.seq[v.idx]) {
      v.idx++;
      if (v.idx >= v.seq.length) { v.idx = 0; return 'complete'; }
      return 'advance';
    }
    v.idx = (hue === v.seq[0]) ? 1 : 0;
    return 'reset';
  }

  function createGame(opts) {
    opts = opts || {};
    var seed = (opts.seed == null ? (Date.now() ^ Math.floor(Math.random() * 1e9)) : opts.seed) >>> 0;
    var w = opts.w > 0 ? opts.w : 960, h = opts.h > 0 ? opts.h : 600;
    var rng = mulberry32(seed);
    var s = {
      seed: seed, rng: rng, w: w, h: h, u: unitFor(w, h), t: 0, night: 0,
      phase: 'playing', interT: 0,
      deer: { x: w * 0.5, y: h * 0.72, vx: 0, vy: 0, r: CFG.deerR, face: 1, dashT: 0, dashCd: 0, inv: 0, knockT: 0 },
      orbs: [], mists: [],
      glow: CFG.startGlow, score: 0, combo: 0, lastCollectT: -99, bestCombo: 0,
      verse: newVerse(rng), verses: 0,
      constellation: null, lit: 0, charge: 0,
      totalLumi: 0, hurts: 0, completed: [],
      nextId: 1, orbAcc: 0.6, mistAcc: 0
    };
    startNight(s, null);
    return s;
  }

  function startNight(s, ev) {
    s.night++;
    var cs = (hashString('night:' + s.night) ^ s.seed) >>> 0;
    var c = generateConstellation(cs, starCount(s.night));
    var nm = nameConstellation(cs);
    c.name = nm.cn; c.en = nm.en; c.seed = cs;
    s.constellation = c;
    s.lit = 0; s.charge = 0;
    if (s.night > 1) s.glow = Math.min(CFG.maxGlow, s.glow + CFG.nightGlow);
    s.phase = 'playing';
    if (ev) ev.push({ type: 'night-start', night: s.night, name: c.name, en: c.en });
  }

  function completeNight(s, ev) {
    var c = s.constellation, bonus = 250 * s.night;
    s.score += bonus;
    var rec = { name: c.name, en: c.en, stars: c.stars, edges: c.edges, night: s.night, seed: c.seed, score: s.score };
    s.completed.push(rec);
    ev.push({ type: 'night-complete', record: rec, bonus: bonus, orbs: s.orbs.slice(), mists: s.mists.slice() });
    s.orbs = []; s.mists = [];
    s.orbAcc = 0.5; s.mistAcc = 0;
    s.phase = 'interlude';
    s.interT = CFG.interlude;
  }

  function spawnOrb(s) {
    var r = s.rng;
    var hue = r() < CFG.helpfulHue ? s.verse.seq[s.verse.idx] : Math.floor(r() * HUES);
    var x = 30 + r() * Math.max(10, s.w - 60);
    s.orbs.push({
      id: s.nextId++, bx: x, x: x, y: -16,
      vy: s.h * (0.075 + r() * 0.065 + s.night * 0.006),
      amp: 8 + r() * 22, ph: r() * 6.2832, hue: hue, r: CFG.orbR, age: 0
    });
  }

  function spawnMist(s) {
    var r = s.rng, left = r() < 0.5;
    var rad = (20 + r() * 16) * clamp(s.u, 0.75, 1.1);
    var y = s.h * (0.18 + r() * 0.74);
    var sp = s.w * (0.045 + r() * 0.045 + s.night * 0.007);
    s.mists.push({
      id: s.nextId++, x: left ? -rad : s.w + rad, y: y, by: y,
      vx: left ? sp : -sp, r: rad, ph: r() * 6.2832, age: 0
    });
  }

  function moveDeer(s, dt, input, ev) {
    var d = s.deer, u = s.u, L;
    d.dashCd = Math.max(0, d.dashCd - dt);
    d.inv = Math.max(0, d.inv - dt);

    if (input.dash && d.dashCd <= 0) {
      var dx = 0, dy = 0;
      if (input.mode === 'target') { dx = input.tx - d.x; dy = input.ty - d.y; if (Math.hypot(dx, dy) < 8) { dx = 0; dy = 0; } }
      else if (input.mode === 'dir') { dx = input.dx || 0; dy = input.dy || 0; }
      if (Math.hypot(dx, dy) < 1e-3) {
        // 没有方向输入：沿当前速度方向；几乎静止时沿面朝方向
        if (Math.hypot(d.vx, d.vy) > 20) { dx = d.vx; dy = d.vy; } else { dx = d.face; dy = 0; }
      }
      L = Math.hypot(dx, dy) || 1;
      d.vx = dx / L * CFG.dashSpeed * u;
      d.vy = dy / L * CFG.dashSpeed * u;
      d.dashT = CFG.dashTime;
      d.dashCd = CFG.dashCooldown;
      d.knockT = 0;
      ev.push({ type: 'dash', x: d.x, y: d.y });
    }

    if (d.dashT > 0) {
      d.dashT = Math.max(0, d.dashT - dt);
    } else if (d.knockT > 0) {
      d.knockT = Math.max(0, d.knockT - dt);
      var damp = Math.exp(-6 * dt);
      d.vx *= damp; d.vy *= damp;
    } else {
      var tvx = 0, tvy = 0;
      if (input.mode === 'target' && isFinite(input.tx) && isFinite(input.ty)) {
        tvx = (input.tx - d.x) * CFG.followK;
        tvy = (input.ty - d.y) * CFG.followK;
        var sp = Math.hypot(tvx, tvy), max = CFG.maxSpeed * u;
        if (sp > max) { tvx *= max / sp; tvy *= max / sp; }
      } else if (input.mode === 'dir') {
        var ix = input.dx || 0, iy = input.dy || 0;
        L = Math.hypot(ix, iy);
        if (L > 1e-6) {
          var mag = Math.min(1, L);
          tvx = ix / L * mag * CFG.keySpeed * u;
          tvy = iy / L * mag * CFG.keySpeed * u;
        }
      }
      var k = 1 - Math.exp(-CFG.accel * dt);
      d.vx += (tvx - d.vx) * k;
      d.vy += (tvy - d.vy) * k;
    }

    d.x += d.vx * dt;
    d.y += d.vy * dt;
    if (d.x < d.r) { d.x = d.r; if (d.vx < 0) d.vx = 0; }
    if (d.x > s.w - d.r) { d.x = s.w - d.r; if (d.vx > 0) d.vx = 0; }
    if (d.y < d.r) { d.y = d.r; if (d.vy < 0) d.vy = 0; }
    if (d.y > s.h - d.r) { d.y = s.h - d.r; if (d.vy > 0) d.vy = 0; }
    if (Math.abs(d.vx) > 20) d.face = d.vx > 0 ? 1 : -1;
  }

  function collect(s, o, ev) {
    var combo = (s.t - s.lastCollectT <= CFG.comboWindow) ? Math.min(s.combo + 1, CFG.comboMax) : 1;
    s.combo = combo;
    s.lastCollectT = s.t;
    if (combo > s.bestCombo) s.bestCombo = combo;
    var pts = 10 * combo;
    s.score += pts;
    s.totalLumi++;
    s.glow = Math.min(CFG.maxGlow, s.glow + CFG.orbGlow);
    ev.push({ type: 'collect', x: o.x, y: o.y, hue: o.hue, combo: combo, points: pts });

    var res = advanceVerse(s.verse, o.hue);
    if (res === 'complete') {
      s.verses++;
      var bonus = 100 * s.night, d = s.deer, cleared = [];
      s.score += bonus;
      s.glow = Math.min(CFG.maxGlow, s.glow + CFG.verseGlow);
      for (var i = s.mists.length - 1; i >= 0; i--) {
        var m = s.mists[i];
        if (dist2(m.x, m.y, d.x, d.y) < CFG.flareRadius * CFG.flareRadius) {
          cleared.push(m);
          s.mists.splice(i, 1);
        }
      }
      var done = s.verse.seq.slice();
      s.verse = newVerse(s.rng);
      ev.push({ type: 'verse', x: d.x, y: d.y, bonus: bonus, cleared: cleared, seq: done });
    }

    s.charge++;
    if (s.charge >= CFG.lumiPerStar) {
      s.charge = 0;
      s.lit++;
      ev.push({ type: 'star', index: s.lit - 1, star: s.constellation.stars[s.lit - 1] });
      if (s.lit >= s.constellation.stars.length) completeNight(s, ev);
    }
  }

  function hurt(s, m, ev) {
    var d = s.deer;
    s.glow -= CFG.hurtGlow;
    s.hurts++;
    s.combo = 0;
    s.verse.idx = 0;
    d.inv = CFG.invuln;
    var dx = d.x - m.x, dy = d.y - m.y, L = Math.hypot(dx, dy) || 1;
    d.vx = dx / L * 520 * s.u;
    d.vy = dy / L * 520 * s.u;
    d.knockT = CFG.knockTime;
    ev.push({ type: 'hurt', x: d.x, y: d.y });
  }

  /**
   * 推进模拟。input: { mode:'target', tx, ty } | { mode:'dir', dx, dy } | {}，可带 dash:true。
   * 返回本步事件数组。
   */
  function step(s, dt, input) {
    var ev = [];
    if (!(dt > 0) || s.phase === 'over') return ev;
    dt = Math.min(dt, CFG.maxDt);
    input = input || {};
    s.t += dt;

    moveDeer(s, dt, input, ev);

    if (s.phase === 'interlude') {
      s.interT -= dt;
      if (s.interT <= 0) startNight(s, ev);
      return ev;
    }

    if (s.combo > 0 && s.t - s.lastCollectT > CFG.comboWindow) s.combo = 0;

    s.orbAcc += dt * orbRate(s.night);
    while (s.orbAcc >= 1) { s.orbAcc -= 1; spawnOrb(s); }
    s.mistAcc += dt * mistRate(s.night);
    while (s.mistAcc >= 1) { s.mistAcc -= 1; if (s.mists.length < mistCap(s.night)) spawnMist(s); }

    var d = s.deer, i;
    for (i = s.orbs.length - 1; i >= 0; i--) {
      var o = s.orbs[i];
      o.age += dt;
      o.y += o.vy * dt;
      o.x = o.bx + Math.sin(s.t * 1.3 + o.ph) * o.amp;
      if (o.y > s.h + 24) { s.orbs.splice(i, 1); continue; }
      var rr = d.r + o.r + CFG.collectPad;
      if (dist2(o.x, o.y, d.x, d.y) < rr * rr) {
        s.orbs.splice(i, 1);
        collect(s, o, ev);
        if (s.phase !== 'playing') return ev; // 本夜完成，进入幕间
      }
    }

    for (i = s.mists.length - 1; i >= 0; i--) {
      var m = s.mists[i];
      m.age += dt;
      m.x += m.vx * dt;
      m.y = m.by + Math.sin(s.t * 0.9 + m.ph) * 18;
      if ((m.vx > 0 && m.x > s.w + m.r + 20) || (m.vx < 0 && m.x < -m.r - 20)) { s.mists.splice(i, 1); continue; }
      if (d.inv <= 0 && d.dashT <= 0) {
        var hr = (d.r + m.r) * CFG.mistHitScale;
        if (dist2(m.x, m.y, d.x, d.y) < hr * hr) hurt(s, m, ev);
      }
    }

    s.glow -= decayRate(s.night) * dt;
    if (s.glow <= 0) {
      s.glow = 0;
      s.phase = 'over';
      ev.push({ type: 'gameover', score: s.score, night: s.night, completed: s.completed.length });
    }
    return ev;
  }

  function resizeGame(s, w, h) {
    if (!(w > 0 && h > 0)) return;
    var fx = w / s.w, fy = h / s.h;
    s.deer.x *= fx; s.deer.y *= fy;
    s.orbs.forEach(function (o) { o.bx *= fx; o.x *= fx; o.y *= fy; o.vy *= fy; });
    s.mists.forEach(function (m) { m.x *= fx; m.y *= fy; m.by *= fy; m.vx *= fx; });
    s.w = w; s.h = h; s.u = unitFor(w, h);
    s.deer.x = clamp(s.deer.x, s.deer.r, w - s.deer.r);
    s.deer.y = clamp(s.deer.y, s.deer.r, h - s.deer.r);
  }

  /** 演示/自检用自动驾驶：追最近的露光（偏好下一个韵色），躲开迷雾 */
  function autopilot(s) {
    var d = s.deer, best = null, bestCost = Infinity, need = s.verse.seq[s.verse.idx], i;
    for (i = 0; i < s.orbs.length; i++) {
      var o = s.orbs[i];
      if (o.y < 0) continue;
      var c = Math.hypot(o.x - d.x, o.y - d.y) * (o.hue === need ? 0.7 : 1);
      if (c < bestCost) { bestCost = c; best = o; }
    }
    var tx = best ? best.x : s.w * 0.5, ty = best ? best.y + 10 : s.h * 0.68;
    var ax = tx - d.x, ay = ty - d.y, L = Math.hypot(ax, ay);
    if (L < 4) { ax = 0; ay = 0; } else { ax /= L; ay /= L; }
    var dash = false;
    for (i = 0; i < s.mists.length; i++) {
      var m = s.mists[i];
      var dx = d.x - m.x, dy = d.y - m.y, dd = Math.hypot(dx, dy) || 1;
      var R = m.r + d.r + 70;
      if (dd < R) {
        var f = (R - dd) / R * 2.2;
        ax += dx / dd * f; ay += dy / dd * f;
      }
      if (dd < m.r + d.r + 14 && d.dashCd <= 0 && d.inv <= 0) dash = true;
    }
    return { mode: 'dir', dx: ax, dy: ay, dash: dash };
  }

  /* ------------------------------------------------------------------ *
   * 字轮：yun · lu · mi 三个音节的汉字与短句
   * ------------------------------------------------------------------ */
  var LOOM = {
    yun: [
      { c: '云', py: 'yún', g: 'cloud', cn: '在云海之上', en: 'Above a sea of clouds' },
      { c: '韵', py: 'yùn', g: 'rhyme', cn: '在一段余韵里', en: 'Within a lingering rhyme' },
      { c: '晕', py: 'yùn', g: 'halo', cn: '在月晕的边缘', en: 'At the rim of a moon halo' },
      { c: '芸', py: 'yún', g: 'rue', cn: '在芸草的香气中', en: 'In the scent of rue' },
      { c: '运', py: 'yùn', g: 'turning', cn: '在缓缓转动的天穹下', en: 'Beneath the slowly turning sky' }
    ],
    lu: [
      { c: '鹿', py: 'lù', g: 'deer', cn: '一头小鹿', en: 'a small deer' },
      { c: '露', py: 'lù', g: 'dew', cn: '一滴夜露', en: 'a drop of night dew' },
      { c: '路', py: 'lù', g: 'road', cn: '一条小路', en: 'a narrow path' },
      { c: '鹭', py: 'lù', g: 'egret', cn: '一只白鹭', en: 'a white egret' },
      { c: '芦', py: 'lú', g: 'reed', cn: '一丛芦苇', en: 'a clump of reeds' },
      { c: '庐', py: 'lú', g: 'hut', cn: '一间草庐', en: 'a thatched hut' }
    ],
    mi: [
      { c: '觅', py: 'mì', g: 'seek', cn: '正在寻觅失落的光', en: 'is searching for lost light' },
      { c: '迷', py: 'mí', g: 'astray', cn: '悄悄迷了路', en: 'has quietly lost its way' },
      { c: '谜', py: 'mí', g: 'riddle', cn: '藏着一个没人猜中的谜', en: 'keeps a riddle no one has solved' },
      { c: '蜜', py: 'mì', g: 'honey', cn: '酿着一点月光做的蜜', en: 'is brewing honey out of moonlight' },
      { c: '秘', py: 'mì', g: 'secret', cn: '守着一个小小的秘密', en: 'guards a tiny secret' },
      { c: '弥', py: 'mí', g: 'brim', cn: '让微光弥漫整个夜晚', en: 'lets a faint glow fill the night' }
    ]
  };
  var LOOM_TOTAL = LOOM.yun.length * LOOM.lu.length * LOOM.mi.length;

  var SKINS = {
    cloud: { id: 'cloud', cn: '云白', en: 'Cloud', body: ['#ffffff', '#cfc8ff'], shade: '#8f86d6', antler: '#ffd98a', aura: '255,217,138' },
    egret: { id: 'egret', cn: '鹭白', en: 'Egret', body: ['#ffffff', '#d4f4f6'], shade: '#7fb9c4', antler: '#7ff0dc', aura: '127,240,220' },
    honey: { id: 'honey', cn: '蜜金', en: 'Honey', body: ['#fff3d6', '#ffc46e'], shade: '#c98a3e', antler: '#ff9ec4', aura: '255,190,120' },
    maze: { id: 'maze', cn: '迷紫', en: 'Maze', body: ['#efe6ff', '#a48cff'], shade: '#6650c4', antler: '#dff6ff', aura: '190,170,255' }
  };
  var SKIN_ORDER = ['cloud', 'egret', 'honey', 'maze'];

  var SECRETS = {
    '云鹿觅': { skin: 'cloud', cn: '这就是它的本名：云做的小鹿，正在寻觅。', en: 'Its true name.' },
    '晕鹭弥': { skin: 'egret', cn: '月晕下的白鹭——解锁鹿色「鹭白」。', en: 'Unlocked: Egret.' },
    '芸露蜜': { skin: 'honey', cn: '芸香里的夜露酿成了蜜——解锁鹿色「蜜金」。', en: 'Unlocked: Honey.' },
    '韵路迷': { skin: 'maze', cn: '一条押着韵的迷路——解锁鹿色「迷紫」。', en: 'Unlocked: Maze.' }
  };

  function loomLine(i, j, k) {
    var a = LOOM.yun[mod(i, LOOM.yun.length)];
    var b = LOOM.lu[mod(j, LOOM.lu.length)];
    var c = LOOM.mi[mod(k, LOOM.mi.length)];
    var chars = a.c + b.c + c.c;
    return {
      chars: chars,
      pinyin: a.py + ' ' + b.py + ' ' + c.py,
      cn: a.cn + '，' + b.cn + c.cn + '。',
      en: a.en + ', ' + b.en + ' ' + c.en + '.',
      secret: SECRETS[chars] || null
    };
  }

  return {
    CFG: CFG, HUES: HUES,
    mulberry32: mulberry32, hashString: hashString, clamp: clamp,
    mst: mst, dfsOrder: dfsOrder, generateConstellation: generateConstellation, nameConstellation: nameConstellation,
    starCount: starCount, decayRate: decayRate, orbRate: orbRate, mistRate: mistRate, mistCap: mistCap, unitFor: unitFor,
    newVerse: newVerse, advanceVerse: advanceVerse,
    createGame: createGame, step: step, resizeGame: resizeGame, autopilot: autopilot,
    LOOM: LOOM, LOOM_TOTAL: LOOM_TOTAL, loomLine: loomLine, SECRETS: SECRETS, SKINS: SKINS, SKIN_ORDER: SKIN_ORDER
  };
});
