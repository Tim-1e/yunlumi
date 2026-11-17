/*
 * Yunlumi 自检脚本 —— 同时支持 Node 与浏览器。
 *   Node:    node tests/selftest.js            （退出码 0 = 全部通过）
 *   Browser: 打开 tests/selftest.html
 * 只测试纯逻辑层 js/core.js（不需要 DOM）。
 */
(function (root) {
  'use strict';
  var isNode = typeof module === 'object' && module && module.exports && typeof require === 'function';
  var core = isNode ? require('../js/core.js') : root.YL.core;
  var results = [];

  function test(name, fn) {
    var t0 = Date.now();
    try { fn(); results.push({ name: name, ok: true, ms: Date.now() - t0 }); }
    catch (e) { results.push({ name: name, ok: false, err: (e && e.message) || String(e), ms: Date.now() - t0 }); }
  }
  function assert(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
  function finite(v) { return typeof v === 'number' && isFinite(v); }

  /* ---------------- 基础 ---------------- */
  test('mulberry32 可复现且落在 [0,1)', function () {
    var a = core.mulberry32(42), b = core.mulberry32(42);
    for (var i = 0; i < 1000; i++) {
      var x = a(), y = b();
      assert(x === y, 'same seed should match');
      assert(x >= 0 && x < 1, 'range: ' + x);
    }
    assert(core.mulberry32(1)() !== core.mulberry32(2)(), 'different seeds differ');
  });

  test('hashString 稳定、无符号', function () {
    assert(core.hashString('yunlumi') === core.hashString('yunlumi'));
    assert(core.hashString('yun') !== core.hashString('lumi'));
    assert(core.hashString('x') >= 0);
  });

  /* ---------------- 星座 ---------------- */
  test('MST 连通且边数为 n-1', function () {
    var rng = core.mulberry32(7);
    for (var trial = 0; trial < 50; trial++) {
      var n = 2 + Math.floor(rng() * 9), pts = [];
      for (var i = 0; i < n; i++) pts.push({ x: rng(), y: rng() });
      var edges = core.mst(pts);
      assert(edges.length === n - 1, 'edge count');
      var parent = []; for (i = 0; i < n; i++) parent.push(i);
      var find = function (x) { while (parent[x] !== x) x = parent[x] = parent[parent[x]]; return x; };
      edges.forEach(function (e) { parent[find(e[0])] = find(e[1]); });
      var r0 = find(0);
      for (i = 1; i < n; i++) assert(find(i) === r0, 'connected');
    }
  });

  test('星座：数量、范围、点亮顺序连通', function () {
    for (var seed = 1; seed < 200; seed++) {
      var n = 5 + (seed % 5);
      var c = core.generateConstellation(seed * 2654435761 >>> 0, n);
      assert(c.stars.length === n, 'star count');
      assert(c.edges.length === n - 1, 'edges');
      c.stars.forEach(function (s) {
        assert(s.x >= 0.08 && s.x <= 0.92 && s.y >= 0.10 && s.y <= 0.74, 'bounds ' + JSON.stringify(s));
      });
      // 第 k 颗（k>0）必须与前面某颗星有边相连 —— 保证每次点亮都能画出连线
      for (var k = 1; k < n; k++) {
        var ok = c.edges.some(function (e) { return (e[0] === k && e[1] < k) || (e[1] === k && e[0] < k); });
        assert(ok, 'star ' + k + ' connects backwards (seed ' + seed + ')');
      }
    }
  });

  test('星座名称非空且可复现', function () {
    for (var s = 0; s < 100; s++) {
      var a = core.nameConstellation(s), b = core.nameConstellation(s);
      assert(a.cn && a.en && a.cn === b.cn && a.en === b.en);
      assert(/座$/.test(a.cn), 'ends with 座');
    }
  });

  /* ---------------- 韵 ---------------- */
  test('韵：按序完成 / 错色重置 / 错色恰为首色时保留 1 步', function () {
    var v = { seq: [0, 1, 2], idx: 0 };
    assert(core.advanceVerse(v, 0) === 'advance' && v.idx === 1);
    assert(core.advanceVerse(v, 1) === 'advance' && v.idx === 2);
    assert(core.advanceVerse(v, 2) === 'complete' && v.idx === 0);
    v = { seq: [0, 1, 2], idx: 1 };
    assert(core.advanceVerse(v, 2) === 'reset' && v.idx === 0);
    v = { seq: [0, 1, 2], idx: 2 };
    assert(core.advanceVerse(v, 0) === 'reset' && v.idx === 1);
    var rng = core.mulberry32(3);
    for (var i = 0; i < 200; i++) {
      var nv = core.newVerse(rng);
      assert(nv.seq.length === 3 && !(nv.seq[0] === nv.seq[1] && nv.seq[1] === nv.seq[2]), 'not monochrome');
    }
  });

  /* ---------------- 模拟 ---------------- */
  test('收集：连击、得分、光亮、充能', function () {
    var s = core.createGame({ seed: 11, w: 960, h: 600 });
    s.mists = []; s.mistAcc = -1e9; s.orbAcc = -1e9; // 关闭自动生成
    var d = s.deer;
    s.orbs.push({ id: 999, bx: d.x, x: d.x, y: d.y, vy: 0, amp: 0, ph: 0, hue: s.verse.seq[0], r: 9, age: 0 });
    s.glow = 50;
    var ev = core.step(s, 1 / 60, {});
    var c = ev.filter(function (e) { return e.type === 'collect'; });
    assert(c.length === 1, 'collected once');
    assert(s.combo === 1 && s.score === 10, 'combo1 score10, got ' + s.combo + '/' + s.score);
    assert(s.glow > 50, 'glow refilled');
    assert(s.charge === 1, 'charge');
    s.orbs.push({ id: 1000, bx: d.x, x: d.x, y: d.y, vy: 0, amp: 0, ph: 0, hue: 0, r: 9, age: 0 });
    core.step(s, 1 / 60, {});
    assert(s.combo === 2 && s.score === 30, 'combo2 score30, got ' + s.combo + '/' + s.score);
  });

  test('点亮全部星星 → 幕间 → 下一夜', function () {
    var s = core.createGame({ seed: 5, w: 800, h: 600 });
    s.mistAcc = -1e9; s.orbAcc = -1e9;
    var need = s.constellation.stars.length * core.CFG.lumiPerStar, got = [];
    for (var i = 0; i < need; i++) {
      var d = s.deer;
      s.orbs.push({ id: 5000 + i, bx: d.x, x: d.x, y: d.y, vy: 0, amp: 0, ph: 0, hue: 1, r: 9, age: 0 });
      got = got.concat(core.step(s, 1 / 60, {}));
      s.orbAcc = -1e9; s.mistAcc = -1e9;
    }
    var stars = got.filter(function (e) { return e.type === 'star'; });
    assert(stars.length === s.constellation.stars.length, 'star events ' + stars.length);
    assert(got.some(function (e) { return e.type === 'night-complete'; }), 'night complete');
    assert(s.phase === 'interlude' && s.completed.length === 1, 'interlude');
    var ns = [];
    for (i = 0; i < 400 && s.phase === 'interlude'; i++) ns = ns.concat(core.step(s, 1 / 60, {}));
    assert(s.phase === 'playing' && s.night === 2, 'night 2 started');
    assert(ns.some(function (e) { return e.type === 'night-start'; }), 'night-start event');
    assert(s.constellation.stars.length === core.starCount(2), 'more stars');
  });

  test('迷雾：受伤、无敌帧、跃可穿过', function () {
    var s = core.createGame({ seed: 9, w: 960, h: 600 });
    s.orbAcc = -1e9; s.mistAcc = -1e9;
    var d = s.deer, g0 = s.glow;
    s.mists.push({ id: 1, x: d.x + 5, y: d.y, by: d.y, vx: 0.0001, r: 30, ph: -Math.PI / 2, age: 0 });
    var ev = core.step(s, 1 / 60, {});
    assert(ev.some(function (e) { return e.type === 'hurt'; }), 'hurt');
    assert(s.glow < g0 - 10, 'glow reduced');
    assert(d.inv > 0, 'invulnerable');
    var ev2 = core.step(s, 1 / 60, {});
    assert(!ev2.some(function (e) { return e.type === 'hurt'; }), 'no double hurt');

    var s2 = core.createGame({ seed: 9, w: 960, h: 600 });
    s2.orbAcc = -1e9; s2.mistAcc = -1e9;
    var e3 = core.step(s2, 1 / 60, { mode: 'dir', dx: 1, dy: 0, dash: true });
    assert(e3.some(function (e) { return e.type === 'dash'; }), 'dash event');
    assert(s2.deer.dashT > 0 && s2.deer.dashCd > 0, 'dash timers');
    s2.mists.push({ id: 2, x: s2.deer.x, y: s2.deer.y, by: s2.deer.y, vx: 0.0001, r: 30, ph: -Math.PI / 2, age: 0 });
    var e4 = core.step(s2, 1 / 60, {});
    assert(!e4.some(function (e) { return e.type === 'hurt'; }), 'dash passes through mist');
    var e5 = core.step(s2, 1 / 60, { dash: true });
    assert(!e5.some(function (e) { return e.type === 'dash'; }), 'dash on cooldown');
  });

  test('光亮耗尽 → gameover，且之后 step 不再变化', function () {
    var s = core.createGame({ seed: 1, w: 960, h: 600 });
    s.orbAcc = -1e9; s.mistAcc = -1e9;
    var over = false;
    for (var i = 0; i < 60 * 120 && !over; i++) {
      var ev = core.step(s, 1 / 60, {});
      if (ev.some(function (e) { return e.type === 'gameover'; })) over = true;
    }
    assert(over && s.phase === 'over' && s.glow === 0, 'game over reached');
    var t = s.t;
    core.step(s, 1 / 60, {});
    assert(s.t === t, 'frozen after over');
  });

  test('resize 后小鹿仍在边界内', function () {
    var s = core.createGame({ seed: 2, w: 1200, h: 700 });
    s.deer.x = 1190; s.deer.y = 690;
    core.resizeGame(s, 360, 600);
    assert(s.deer.x <= 360 - s.deer.r && s.deer.x >= s.deer.r, 'x in bounds');
    assert(s.deer.y <= 600 - s.deer.r && s.deer.y >= s.deer.r, 'y in bounds');
    assert(s.u >= 0.6 && s.u <= 1.3, 'unit clamp');
  });

  test('自动驾驶长时模拟：不变量 + 至少点亮一座星座（平衡性冒烟测试）', function () {
    var VALID = { collect: 1, verse: 1, star: 1, 'night-complete': 1, 'night-start': 1, hurt: 1, dash: 1, gameover: 1 };
    var seeds = [1, 2, 3, 4, 5, 6], nightsDone = 0;
    seeds.forEach(function (seed) {
      var s = core.createGame({ seed: seed, w: 960, h: 600 });
      for (var i = 0; i < 60 * 300 && s.phase !== 'over'; i++) {
        var ev = core.step(s, 1 / 60, core.autopilot(s));
        ev.forEach(function (e) { assert(VALID[e.type], 'unknown event ' + e.type); });
        var d = s.deer;
        assert(finite(d.x) && finite(d.y) && finite(d.vx) && finite(d.vy), 'finite deer');
        assert(d.x >= d.r - 1e-6 && d.x <= s.w - d.r + 1e-6 && d.y >= d.r - 1e-6 && d.y <= s.h - d.r + 1e-6, 'deer in bounds');
        assert(s.glow >= 0 && s.glow <= core.CFG.maxGlow, 'glow range ' + s.glow);
        assert(s.lit <= s.constellation.stars.length, 'lit <= stars');
        assert(s.charge < core.CFG.lumiPerStar, 'charge < per star');
        assert(s.mists.length <= core.mistCap(s.night), 'mist cap');
        assert(s.combo >= 0 && s.combo <= core.CFG.comboMax, 'combo range');
      }
      nightsDone += s.completed.length;
    });
    assert(nightsDone >= seeds.length, 'autopilot should average >=1 night per run, got ' + nightsDone);
  });

  test('相同种子 + 相同输入 → 完全相同的结果（确定性）', function () {
    function run() {
      var s = core.createGame({ seed: 77, w: 900, h: 560 });
      for (var i = 0; i < 60 * 40; i++) core.step(s, 1 / 60, core.autopilot(s));
      return [s.score, s.night, s.lit, s.totalLumi, s.hurts, Math.round(s.deer.x * 1000)].join(',');
    }
    assert(run() === run());
  });

  /* ---------------- 字轮 ---------------- */
  test('字轮：180 种组合全部唯一、文本完整', function () {
    var seen = {}, n = 0;
    for (var i = 0; i < core.LOOM.yun.length; i++)
      for (var j = 0; j < core.LOOM.lu.length; j++)
        for (var k = 0; k < core.LOOM.mi.length; k++) {
          var l = core.loomLine(i, j, k);
          assert(l.chars.length === 3 && l.cn.length > 8 && l.en.length > 10, 'text');
          assert(!seen[l.chars], 'dup ' + l.chars);
          seen[l.chars] = 1; n++;
        }
    assert(n === core.LOOM_TOTAL && n === 180, 'total ' + n);
    assert(core.loomLine(-1, -1, -1).chars === core.loomLine(4, 5, 5).chars, 'negative wrap');
  });

  test('字轮秘密组合均可达且指向存在的鹿色', function () {
    var found = {};
    for (var i = 0; i < 5; i++) for (var j = 0; j < 6; j++) for (var k = 0; k < 6; k++) {
      var l = core.loomLine(i, j, k);
      if (l.secret) found[l.chars] = l.secret.skin;
    }
    Object.keys(core.SECRETS).forEach(function (key) {
      assert(found[key], 'reachable ' + key);
      assert(core.SKINS[found[key]], 'skin exists ' + found[key]);
    });
    core.SKIN_ORDER.forEach(function (id) { assert(core.SKINS[id], 'skin ' + id); });
  });

  /* ---------------- 输出 ---------------- */
  var fails = results.filter(function (r) { return !r.ok; });
  var lines = results.map(function (r) {
    return (r.ok ? '✔ ' : '✘ ') + r.name + ' (' + r.ms + 'ms)' + (r.ok ? '' : '\n    → ' + r.err);
  });
  lines.push('');
  lines.push(fails.length ? (fails.length + ' / ' + results.length + ' 项失败') : ('全部通过：' + results.length + ' 项'));

  if (isNode) {
    console.log(lines.join('\n'));
    process.exitCode = fails.length ? 1 : 0;
  } else {
    root.YL_SELFTEST = { results: results, failed: fails.length };
    var out = root.document && root.document.getElementById('out');
    if (out) {
      out.textContent = lines.join('\n');
      out.className = fails.length ? 'fail' : 'pass';
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
