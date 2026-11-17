/* Yunlumi · game.js —— 夜游：渲染、输入、HUD 与界面流程（模拟逻辑见 core.js） */
(function () {
  'use strict';
  var YL = window.YL, core = YL.core;
  var $ = function (id) { return document.getElementById(id); };
  var stage = $('stage'), canvas = $('game-canvas');
  if (!stage || !canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');

  var HUE_HEX = ['#ffd98a', '#7ff0dc', '#ff9ec4'];
  var HUE_RGB = ['255,217,138', '127,240,220', '255,158,196'];
  var CN_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  var DISPLAY = '"Avenir Next", "Futura", "Trebuchet MS", system-ui, sans-serif';
  var SERIF = '"Noto Serif SC", "Source Han Serif SC", "Songti SC", "STSong", serif';
  var BEST_KEY = 'yunlumi.best.v1';

  // DOM
  var hud = {
    night: $('hud-night'), cname: $('hud-const'), glow: $('hud-glow'), glowbar: null,
    score: $('hud-score'), combo: $('hud-combo'), verse: stage.querySelector('.verse'),
    dots: stage.querySelectorAll('.vdot')
  };
  hud.glowbar = hud.glow.parentNode;
  var ovStart = $('ov-start'), ovPause = $('ov-pause'), ovOver = $('ov-over');
  var bannerEl = $('banner'), leapBtn = $('btn-leap'), leapRing = stage.querySelector('.leap-ring');
  var picker = $('skin-picker');

  // 状态
  var W = 0, H = 0, dpr = 1;
  var mode = 'idle';            // idle | playing | paused | over
  var game = null, demo = null;
  var skin = YL.settings.get('skin', 'cloud');
  var parts = [], texts = [], ghosts = [];
  var litTimes = [];
  var shake = 0, flash = 0, flashRGB = '255,255,255';
  var clock = 0, raf = 0, last = 0, visible = true, ratio = 1;
  var input = { mode: null, tx: 0, ty: 0, dx: 0, dy: 0, dash: false };
  var keys = {}, touch = null, lastTap = { t: 0, x: 0, y: 0 }, lastKind = 'pointer';
  var sky = { stars: [], clouds: [], grad: null, vignette: null };
  var sprites = { orb: [], mist: null, cloud: [] };
  var overTimer = 0, bannerTimer = 0;
  var hudCache = {};

  function reduced() { return YL.reducedMotion(); }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function nightName(n) {
    if (n <= 10) return '第' + CN_NUM[n] + '夜';
    if (n < 20) return '第十' + CN_NUM[n - 10] + '夜';
    return '第' + n + '夜';
  }

  /* ================================================================== *
   * 精灵（离屏绘制一次，反复使用）
   * ================================================================== */
  function makeCanvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  function makeOrbSprite(rgb, hex) {
    var S = 64, c = makeCanvas(S * 2, S * 2), o = c.getContext('2d');
    o.scale(2, 2);
    var cx = S / 2, cy = S / 2;
    var g = o.createRadialGradient(cx, cy, 0, cx, cy, S / 2);
    g.addColorStop(0, 'rgba(' + rgb + ',0.55)');
    g.addColorStop(0.35, 'rgba(' + rgb + ',0.16)');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    o.fillStyle = g;
    o.fillRect(0, 0, S, S);
    var r = 7.5;
    o.save();
    o.translate(cx, cy + 3);
    o.beginPath();
    o.moveTo(0, -r * 1.75);
    o.bezierCurveTo(r * 0.55, -r * 0.95, r, -r * 0.35, r, r * 0.1);
    o.arc(0, r * 0.1, r, 0, Math.PI, false);
    o.bezierCurveTo(-r, -r * 0.35, -r * 0.55, -r * 0.95, 0, -r * 1.75);
    o.closePath();
    var dg = o.createRadialGradient(-r * 0.3, -r * 0.1, 0, 0, 0, r * 1.5);
    dg.addColorStop(0, '#ffffff');
    dg.addColorStop(0.45, hex);
    dg.addColorStop(1, 'rgba(' + rgb + ',0.85)');
    o.fillStyle = dg;
    o.shadowColor = hex;
    o.shadowBlur = 10;
    o.fill();
    o.shadowBlur = 0;
    o.fillStyle = 'rgba(255,255,255,0.85)';
    o.beginPath();
    o.ellipse(-r * 0.35, -r * 0.2, r * 0.2, r * 0.36, -0.5, 0, Math.PI * 2);
    o.fill();
    o.restore();
    return c;
  }

  function makeMistSprite() {
    var S = 128, c = makeCanvas(S, S), o = c.getContext('2d');
    var g = o.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(14,8,36,0.95)');
    g.addColorStop(0.45, 'rgba(32,18,70,0.85)');
    g.addColorStop(0.75, 'rgba(76,44,140,0.32)');
    g.addColorStop(1, 'rgba(96,56,170,0)');
    o.fillStyle = g;
    o.fillRect(0, 0, S, S);
    return c;
  }

  function makeCloudSprite(rgb) {
    var c = makeCanvas(320, 130), o = c.getContext('2d');
    [[70, 82, 46], [118, 62, 56], [178, 56, 50], [232, 76, 42], [150, 90, 48], [100, 92, 40], [262, 94, 30]].forEach(function (p) {
      var g = o.createRadialGradient(p[0], p[1], 0, p[0], p[1], p[2]);
      g.addColorStop(0, 'rgba(' + rgb + ',0.9)');
      g.addColorStop(0.6, 'rgba(' + rgb + ',0.45)');
      g.addColorStop(1, 'rgba(' + rgb + ',0)');
      o.fillStyle = g;
      o.beginPath();
      o.arc(p[0], p[1], p[2], 0, Math.PI * 2);
      o.fill();
    });
    return c;
  }

  sprites.orb = HUE_RGB.map(function (rgb, i) { return makeOrbSprite(rgb, HUE_HEX[i]); });
  sprites.mist = makeMistSprite();
  sprites.cloud = ['207,200,255', '255,190,215', '170,240,230'].map(makeCloudSprite);

  /* ================================================================== *
   * 尺寸与天空
   * ================================================================== */
  function buildSky() {
    var rng = core.mulberry32(20261117);
    sky.stars = [];
    var n = Math.round(W * H / 5200);
    for (var i = 0; i < n; i++) {
      var tint = rng() < 0.15 ? HUE_RGB[Math.floor(rng() * 3)] : '236,233,255';
      sky.stars.push({ x: rng() * W, y: rng() * H * 0.86, r: rng() < 0.1 ? 1.3 : 0.5 + rng() * 0.6, ph: rng() * 6.283, sp: 0.5 + rng() * 1.6, c: 'rgb(' + tint + ')' });
    }
    sky.clouds = [];
    for (i = 0; i < 6; i++) {
      var sc = 0.6 + rng() * 0.9;
      sky.clouds.push({ x: rng() * (W + 400) - 200, y: H * (0.08 + rng() * 0.55), s: sc, sp: 4 + rng() * 9, a: 0.05 + rng() * 0.07, k: i % 3 });
    }
    sky.grad = ctx.createLinearGradient(0, 0, 0, H);
    sky.grad.addColorStop(0, '#060920');
    sky.grad.addColorStop(0.55, '#131a50');
    sky.grad.addColorStop(1, '#2b2168');
    var R = Math.max(W, H);
    sky.vignette = ctx.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.45, R * 0.8);
    sky.vignette.addColorStop(0, 'rgba(4,5,20,0)');
    sky.vignette.addColorStop(1, 'rgba(4,5,20,0.55)');
  }

  function resize() {
    var r = stage.getBoundingClientRect();
    var nw = Math.max(1, Math.round(r.width)), nh = Math.max(1, Math.round(r.height));
    var nd = Math.min(2, window.devicePixelRatio || 1);
    if (nw === W && nh === H && nd === dpr) return;
    W = nw; H = nh; dpr = nd;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildSky();
    if (game) core.resizeGame(game, W, H);
    if (demo) core.resizeGame(demo, W, H);
    if (touch) touch = null;
    drawOnce();
  }

  function starPos(s) { return { x: W * 0.06 + s.x * W * 0.88, y: H * 0.06 + s.y * H * 0.9 }; }

  /* ================================================================== *
   * 粒子与飘字
   * ================================================================== */
  function burst(x, y, rgb, n, speed, life, size) {
    if (reduced()) n = Math.ceil(n * 0.3);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = speed * (0.35 + Math.random() * 0.65);
      parts.push({ k: 'spark', x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: life * (0.6 + Math.random() * 0.4), max: life, size: size * (0.6 + Math.random() * 0.6), rgb: rgb });
    }
    if (parts.length > 700) parts.splice(0, parts.length - 700);
  }
  function ring(x, y, rgb, maxR, life, width) {
    parts.push({ k: 'ring', x: x, y: y, r: maxR, life: life, max: life, w: width || 2, rgb: rgb });
  }
  function beam(x0, y0, x1, y1, rgb) {
    var n = reduced() ? 3 : 10;
    for (var i = 0; i < n; i++) {
      var life = 0.55 + i * 0.045;
      parts.push({
        k: 'mote', x0: x0, y0: y0, x1: x1, y1: y1,
        cx: (x0 + x1) / 2 + (Math.random() - 0.5) * 160, cy: Math.min(y0, y1) - 40 - Math.random() * 80,
        life: life, max: life, rgb: rgb, x: x0, y: y0
      });
    }
  }
  function floatText(x, y, text, color, size) {
    texts.push({ x: x, y: y, text: text, color: color, size: size || 15, life: 1.1, max: 1.1 });
    if (texts.length > 40) texts.shift();
  }

  function updateParticles(dt) {
    var i, p;
    for (i = parts.length - 1; i >= 0; i--) {
      p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      if (p.k === 'spark') {
        var dr = Math.pow(0.12, dt);
        p.vx *= dr; p.vy = p.vy * dr + 24 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
      } else if (p.k === 'mote') {
        var u = 1 - p.life / p.max, e = u * u * (3 - 2 * u), v = 1 - e;
        p.x = v * v * p.x0 + 2 * v * e * p.cx + e * e * p.x1;
        p.y = v * v * p.y0 + 2 * v * e * p.cy + e * e * p.y1;
      }
    }
    for (i = texts.length - 1; i >= 0; i--) {
      texts[i].life -= dt;
      texts[i].y -= 28 * dt;
      if (texts[i].life <= 0) texts.splice(i, 1);
    }
    for (i = ghosts.length - 1; i >= 0; i--) {
      ghosts[i].life -= dt;
      if (ghosts[i].life <= 0) ghosts.splice(i, 1);
    }
  }

  function drawParticles() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], a = p.life / p.max;
      if (p.k === 'spark') {
        ctx.globalAlpha = a;
        ctx.fillStyle = 'rgb(' + p.rgb + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * a), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.k === 'ring') {
        var u = 1 - a, rr = p.r * (1 - Math.pow(1 - u, 3));
        ctx.globalAlpha = a * 0.9;
        ctx.strokeStyle = 'rgb(' + p.rgb + ')';
        ctx.lineWidth = p.w * (0.5 + a);
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.1, rr), 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.k === 'mote') {
        ctx.globalAlpha = Math.min(1, a * 2);
        ctx.fillStyle = 'rgb(' + p.rgb + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (i = 0; i < texts.length; i++) {
      var t = texts[i], ta = Math.min(1, t.life / t.max * 1.6);
      ctx.globalAlpha = ta;
      ctx.font = '600 ' + t.size + 'px ' + (/[一-鿿]/.test(t.text) ? SERIF : DISPLAY);
      ctx.fillStyle = 'rgba(9,13,41,0.6)';
      ctx.fillText(t.text, t.x + 1, t.y + 1.5);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }

  /* ================================================================== *
   * 绘制：天空 / 星座 / 云海 / 露光 / 迷雾 / 小鹿
   * ================================================================== */
  function drawSky(dt) {
    var rm = reduced(), i;
    ctx.fillStyle = sky.grad;
    ctx.fillRect(-20, -20, W + 40, H + 40);

    for (i = 0; i < sky.stars.length; i++) {
      var s = sky.stars[i];
      ctx.globalAlpha = rm ? 0.7 : 0.4 + 0.45 * (0.5 + 0.5 * Math.sin(clock * s.sp + s.ph));
      ctx.fillStyle = s.c;
      ctx.fillRect(s.x, s.y, s.r * 2, s.r * 2);
    }
    ctx.globalAlpha = 1;

    // 月亮（新月）
    var mr = Math.min(W, H) * 0.045, mx = W * 0.86, my = H * 0.15;
    ctx.fillStyle = '#fff3d8';
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = sky.grad;
    ctx.beginPath(); ctx.arc(mx - mr * 0.42, my - mr * 0.18, mr * 0.92, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var halo = ctx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 4.5);
    halo.addColorStop(0, 'rgba(255,236,200,0.14)');
    halo.addColorStop(1, 'rgba(255,236,200,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(mx - mr * 5, my - mr * 5, mr * 10, mr * 10);
    ctx.restore();

    // 远云
    for (i = 0; i < sky.clouds.length; i++) {
      var c = sky.clouds[i], cw = 320 * c.s, ch = 130 * c.s;
      if (!rm) {
        c.x += c.sp * dt;
        if (c.x > W + 40) c.x = -cw - 40;
      }
      ctx.globalAlpha = c.a;
      ctx.drawImage(sprites.cloud[c.k], c.x, c.y, cw, ch);
    }
    ctx.globalAlpha = 1;
  }

  function drawConstellation(g) {
    var c = g.constellation;
    if (!c) return;
    var lit = g.lit, inter = g.phase === 'interlude', rm = reduced();
    var pos = c.stars.map(starPos), i;
    ctx.save();
    ctx.lineCap = 'round';

    // 未点亮的连线：虚线轮廓
    ctx.setLineDash([2, 7]);
    ctx.strokeStyle = 'rgba(207,200,255,0.16)';
    ctx.lineWidth = 1;
    c.edges.forEach(function (e) {
      if (e[1] < lit) return;
      ctx.beginPath(); ctx.moveTo(pos[e[0]].x, pos[e[0]].y); ctx.lineTo(pos[e[1]].x, pos[e[1]].y); ctx.stroke();
    });
    ctx.setLineDash([]);

    // 已点亮的连线：画出的光
    ctx.globalCompositeOperation = 'lighter';
    c.edges.forEach(function (e) {
      if (e[1] >= lit) return;
      var t0 = litTimes[e[1]], prog = t0 == null || rm ? 1 : clamp((clock - t0) / 0.7, 0, 1);
      var a = pos[e[0]], b = pos[e[1]];
      var ex = a.x + (b.x - a.x) * prog, ey = a.y + (b.y - a.y) * prog;
      ctx.strokeStyle = 'rgba(255,217,138,' + (inter ? 0.28 : 0.14) + ')';
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,240,205,' + (inter ? 1 : 0.8) + ')';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(ex, ey); ctx.stroke();
    });

    for (i = 0; i < pos.length; i++) {
      var p = pos[i];
      if (i < lit) {
        var pulse = rm ? 1 : 1 + 0.15 * Math.sin(clock * 2.4 + i);
        var gr = (inter ? 30 : 20) * pulse;
        var gg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, gr);
        gg.addColorStop(0, 'rgba(255,244,214,0.85)');
        gg.addColorStop(0.3, 'rgba(255,217,138,0.3)');
        gg.addColorStop(1, 'rgba(255,217,138,0)');
        ctx.fillStyle = gg;
        ctx.fillRect(p.x - gr, p.y - gr, gr * 2, gr * 2);
        ctx.strokeStyle = 'rgba(255,250,235,0.55)';
        ctx.lineWidth = 1;
        var fl = 9 * pulse;
        ctx.beginPath();
        ctx.moveTo(p.x - fl, p.y); ctx.lineTo(p.x + fl, p.y);
        ctx.moveTo(p.x, p.y - fl); ctx.lineTo(p.x, p.y + fl);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.4, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(236,233,255,' + (i === lit ? 0.75 : 0.32) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, i === lit ? 2 : 1.4, 0, Math.PI * 2); ctx.fill();
      }
    }

    // 下一颗星：充能环
    if (!inter && lit < pos.length) {
      var q = pos[lit], frac = g.charge / core.CFG.lumiPerStar;
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(207,200,255,0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(q.x, q.y, 11, 0, Math.PI * 2); ctx.stroke();
      if (frac > 0) {
        ctx.strokeStyle = '#ffd98a';
        ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.arc(q.x, q.y, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.stroke();
      }
      if (!rm) {
        var pr = 14 + ((clock * 14) % 12);
        ctx.strokeStyle = 'rgba(255,217,138,' + (0.35 * (1 - (pr - 14) / 12)) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(q.x, q.y, pr, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawCloudSea() {
    var t = reduced() ? 0 : clock;
    var fills = ['rgba(110,96,196,0.16)', 'rgba(160,146,230,0.13)', 'rgba(214,206,255,0.12)'];
    for (var L = 0; L < 3; L++) {
      var R = 54 + L * 14, step = R * 1.2, base = H - 22 + L * 26;
      var travel = t * (5 + L * 6), shift = travel % step, offset = Math.floor(travel / step);
      ctx.beginPath();
      for (var x = -step + shift, k = 0; x < W + step; x += step, k++) {
        // 用「世界序号」决定起伏，平移回绕时不会跳变
        var cy = base + Math.sin((k - offset) * 1.7 + L * 1.3) * 9;
        ctx.moveTo(x + R, cy);
        ctx.arc(x, cy, R, 0, Math.PI * 2);
      }
      ctx.fillStyle = fills[L];
      ctx.fill();
    }
  }

  function drawOrbs(g) {
    var rm = reduced();
    for (var i = 0; i < g.orbs.length; i++) {
      var o = g.orbs[i];
      var s = 64 * (o.r / 9) * (rm ? 1 : 1 + 0.07 * Math.sin(clock * 4 + o.ph));
      ctx.globalAlpha = Math.min(1, o.age * 3 + 0.2);
      ctx.drawImage(sprites.orb[o.hue], o.x - s / 2, o.y - s / 2 - 3, s, s);
    }
    ctx.globalAlpha = 1;
  }

  function drawMists(g) {
    var rm = reduced(), d = g.deer, spr = sprites.mist;
    for (var i = 0; i < g.mists.length; i++) {
      var m = g.mists[i], R = m.r, w = rm ? 0 : clock, dir = m.vx > 0 ? -1 : 1, k, s;
      ctx.globalAlpha = Math.min(1, m.age * 2 + 0.2);
      for (k = 3; k >= 1; k--) {
        s = R * (1.7 - k * 0.3);
        ctx.globalAlpha = Math.min(1, m.age * 2 + 0.2) * (0.55 / k);
        ctx.drawImage(spr, m.x + dir * R * 0.65 * k - s / 2, m.y + Math.sin(w * 2 + k + m.ph) * 4 - s / 2, s, s);
      }
      ctx.globalAlpha = Math.min(1, m.age * 2 + 0.2);
      for (k = 0; k < 4; k++) {
        var ang = k * Math.PI / 2 + w * 0.8 + m.ph;
        s = R * 2.1;
        ctx.drawImage(spr, m.x + Math.cos(ang) * R * 0.26 - s / 2, m.y + Math.sin(ang) * R * 0.2 - s / 2, s, s);
      }
      // 微光轮廓
      ctx.strokeStyle = 'rgba(176,130,255,0.22)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(m.x, m.y, R * 0.92, 0, Math.PI * 2); ctx.stroke();
      // 眼睛：看向小鹿，偶尔眨眼
      var lx = clamp((d.x - m.x) / 240, -1, 1) * R * 0.09;
      var ly = clamp((d.y - m.y) / 240, -1, 1) * R * 0.07;
      var blink = !rm && Math.sin(clock * 1.7 + m.ph * 3) > 0.97 ? 0.15 : 1;
      ctx.fillStyle = 'rgba(236,226,255,0.92)';
      for (k = -1; k <= 1; k += 2) {
        ctx.beginPath();
        ctx.ellipse(m.x + k * R * 0.22 + lx, m.y - R * 0.08 + ly, R * 0.1, R * 0.14 * blink, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /** 云做的小鹿（面朝右的局部坐标，面朝左时水平翻转） */
  function drawDeer(x, y, sc, face, sk, o) {
    var rm = o.reduced;
    ctx.save();
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    ctx.translate(x, y + (rm ? 0 : Math.sin(o.t * 3.2) * 1.4 * (1 - Math.min(1, o.speed / 200))));

    // 光晕（随光亮强弱变化）
    var gf = clamp(o.glow / 100, 0, 1);
    var low = gf < 0.25 && !rm ? 0.6 + 0.4 * Math.sin(o.t * 10) : 1;
    var ar = (34 + gf * 40) * sc;
    var ag = ctx.createRadialGradient(0, -6 * sc, 0, 0, -6 * sc, ar);
    ag.addColorStop(0, 'rgba(' + sk.aura + ',' + (0.12 + 0.3 * gf) * low + ')');
    ag.addColorStop(1, 'rgba(' + sk.aura + ',0)');
    ctx.fillStyle = ag;
    ctx.fillRect(-ar, -ar - 6 * sc, ar * 2, ar * 2);

    ctx.scale(sc * face, sc);
    ctx.rotate(clamp((o.vy || 0) * 0.0007, -0.35, 0.35));

    // 腿
    var run = Math.min(1, o.speed / 280), ph = o.t * 14;
    ctx.lineCap = 'round';
    ctx.strokeStyle = sk.shade;
    ctx.lineWidth = 2.6;
    [[-10, 6, 0], [-4, 7, Math.PI], [6, 7, Math.PI * 0.5], [12, 6, Math.PI * 1.5]].forEach(function (l) {
      var a = rm ? 0.1 * run : Math.sin(ph + l[2]) * 0.7 * run + Math.sin(o.t * 2 + l[2]) * 0.08;
      var x2 = l[0] + Math.sin(a) * 14, y2 = l[1] + Math.cos(a) * 14;
      ctx.beginPath(); ctx.moveTo(l[0], l[1]); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.fillStyle = sk.antler;
      ctx.beginPath(); ctx.arc(x2, y2, 1.6, 0, Math.PI * 2); ctx.fill();
    });

    // 云朵身体
    var bg = ctx.createLinearGradient(0, -16, 0, 16);
    bg.addColorStop(0, sk.body[0]);
    bg.addColorStop(1, sk.body[1]);
    ctx.fillStyle = bg;
    ctx.beginPath();
    [[-8, 0, 10], [2, -3, 11], [11, 0, 9], [-2, 5, 9], [8, 6, 7], [-13, -2, 6], [-19, -4, 4.5]].forEach(function (c) {
      ctx.moveTo(c[0] + c[2], c[1]);
      ctx.arc(c[0], c[1], c[2], 0, Math.PI * 2);
    });
    // 脖子与头
    ctx.moveTo(6, -4); ctx.lineTo(15, -21); ctx.lineTo(23, -16); ctx.lineTo(14, -1); ctx.closePath();
    ctx.moveTo(27, -19);
    ctx.ellipse(20, -19, 7, 6, 0, 0, Math.PI * 2);
    ctx.moveTo(31, -16.5);
    ctx.ellipse(26.5, -16.5, 4.5, 3.5, 0.2, 0, Math.PI * 2);
    ctx.fill();

    // 耳朵
    ctx.fillStyle = sk.body[1];
    ctx.beginPath(); ctx.ellipse(14, -23, 4.6, 2.2, -0.6, 0, Math.PI * 2); ctx.fill();
    // 身体高光
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.ellipse(-1, -8, 9, 3, -0.1, 0, Math.PI * 2); ctx.fill();
    // 腮红
    ctx.fillStyle = 'rgba(255,158,196,0.45)';
    ctx.beginPath(); ctx.arc(22, -15.5, 2.2, 0, Math.PI * 2); ctx.fill();
    // 眼睛
    var blink = !rm && (o.t % 4.2) < 0.12;
    ctx.fillStyle = '#2a2350';
    ctx.strokeStyle = '#2a2350';
    if (blink) {
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(20.3, -20.2); ctx.lineTo(23.7, -20.2); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(22, -20.5, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(22.5, -21.1, 0.55, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = sk.shade;
    ctx.beginPath(); ctx.arc(30.4, -17, 1.1, 0, Math.PI * 2); ctx.fill();

    // 鹿角：发光的枝
    ctx.strokeStyle = sk.antler;
    ctx.lineWidth = 2;
    ctx.shadowColor = sk.antler;
    ctx.shadowBlur = rm ? 4 : 8 + 3 * Math.sin(o.t * 3);
    ctx.beginPath();
    ctx.moveTo(16, -24); ctx.quadraticCurveTo(13, -31, 11, -38);
    ctx.moveTo(13.6, -30); ctx.lineTo(7.5, -33.5);
    ctx.moveTo(12, -35); ctx.lineTo(15.5, -41);
    ctx.moveTo(20.5, -24.5); ctx.quadraticCurveTo(22, -31, 25, -37);
    ctx.moveTo(22, -30); ctx.lineTo(28, -32);
    ctx.moveTo(23.6, -34); ctx.lineTo(21.8, -41);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    [[11, -38], [7.5, -33.5], [15.5, -41], [25, -37], [28, -32], [21.8, -41]].forEach(function (p) {
      ctx.beginPath(); ctx.arc(p[0], p[1], 1.2, 0, Math.PI * 2); ctx.fill();
    });
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function drawDeerFor(g) {
    var d = g.deer, sk = core.SKINS[skin] || core.SKINS.cloud, rm = reduced();
    var speed = Math.hypot(d.vx, d.vy), sc = clamp(g.u, 0.85, 1.15);
    for (var i = 0; i < ghosts.length; i++) {
      var gh = ghosts[i];
      drawDeer(gh.x, gh.y, sc, gh.face, sk, { t: clock, speed: 400, vy: 0, glow: 0, reduced: true, alpha: gh.life / 0.3 * 0.35 });
    }
    var alpha = 1;
    if (d.inv > 0) alpha = rm ? 0.55 : (Math.floor(clock * 12) % 2 ? 0.35 : 0.9);
    drawDeer(d.x, d.y, sc, d.face, sk, { t: clock, speed: speed, vy: d.vy, glow: g.glow, reduced: rm, alpha: alpha });
  }

  function draw(dt) {
    if (!W) return;
    var g = mode === 'idle' ? demo : game, rm = reduced();
    ctx.save();
    if (shake > 0 && !rm) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    shake = Math.max(0, shake - dt * 40);
    drawSky(dt);
    if (g) drawConstellation(g);
    drawCloudSea();
    if (g) { drawOrbs(g); drawMists(g); drawDeerFor(g); }
    drawParticles();
    ctx.restore();
    if (flash > 0) {
      if (!rm) {
        ctx.fillStyle = 'rgba(' + flashRGB + ',' + flash + ')';
        ctx.fillRect(0, 0, W, H);
      }
      flash = Math.max(0, flash - dt * 1.4);
    }
    ctx.fillStyle = sky.vignette;
    ctx.fillRect(0, 0, W, H);
  }

  function drawOnce() { if (W) draw(0); }

  /* ================================================================== *
   * 事件 → 视听反馈
   * ================================================================== */
  function handleEvents(evs, g, isDemo) {
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i], d = g.deer;
      switch (e.type) {
        case 'collect':
          burst(e.x, e.y, HUE_RGB[e.hue], 12, 140, 0.6, 2.4);
          ring(e.x, e.y, HUE_RGB[e.hue], 26, 0.4, 1.5);
          floatText(e.x, e.y - 14, '+' + e.points, HUE_HEX[e.hue], e.combo > 1 ? 16 : 14);
          if (!isDemo) YL.audio.play('collect', e);
          break;
        case 'verse':
          ring(e.x, e.y, '255,217,138', core.CFG.flareRadius, 0.9, 3);
          ring(e.x, e.y, '127,240,220', core.CFG.flareRadius * 0.7, 0.7, 2);
          burst(e.x, e.y, HUE_RGB[0], 14, 260, 0.9, 2.6);
          burst(e.x, e.y, HUE_RGB[1], 14, 260, 0.9, 2.6);
          burst(e.x, e.y, HUE_RGB[2], 14, 260, 0.9, 2.6);
          e.cleared.forEach(function (m) { burst(m.x, m.y, '150,110,230', 16, 120, 0.8, 3); });
          floatText(e.x, e.y - 40, '韵 +' + e.bonus, '#ffe9bd', 20);
          if (!isDemo) {
            flash = 0.22; flashRGB = '255,236,200';
            YL.audio.play('verse');
            if (!reduced() && hud.verse) { hud.verse.classList.remove('done'); void hud.verse.offsetWidth; hud.verse.classList.add('done'); }
          }
          break;
        case 'star':
          litTimes[e.index] = clock;
          var sp = starPos(e.star);
          beam(d.x, d.y - 10, sp.x, sp.y, '255,230,180');
          setTimeout(function (p) { return function () { ring(p.x, p.y, '255,236,200', 40, 0.8, 2); burst(p.x, p.y, '255,236,200', 10, 90, 0.8, 2); }; }(sp), reduced() ? 0 : 520);
          if (!isDemo) YL.audio.play('star', e);
          break;
        case 'night-complete':
          e.orbs.forEach(function (o) { burst(o.x, o.y, HUE_RGB[o.hue], 5, 80, 0.6, 2); });
          e.mists.forEach(function (m) { burst(m.x, m.y, '150,110,230', 10, 90, 0.7, 3); });
          if (!isDemo) {
            flash = 0.3; flashRGB = '255,240,210';
            YL.audio.play('night');
            showBanner('Constellation lit · 已点亮', e.record.name, (e.record.en || '') + ' · +' + e.bonus + ' · 已收进星图');
            if (YL.atlas) {
              YL.atlas.add({
                id: Date.now().toString(36) + '-' + e.record.night,
                name: e.record.name, en: e.record.en, stars: e.record.stars, edges: e.record.edges,
                night: e.record.night, seed: e.record.seed, score: e.record.score,
                skin: skin, date: new Date().toISOString()
              });
            }
          }
          break;
        case 'night-start':
          litTimes = [];
          if (!isDemo) showBanner(nightName(e.night), e.name, e.en + ' · 光亮 +' + core.CFG.nightGlow);
          break;
        case 'hurt':
          burst(e.x, e.y, '150,110,230', 18, 160, 0.7, 3);
          if (!isDemo) {
            shake = 12;
            floatText(e.x, e.y - 30, '迷 −光', '#cdb8ff', 16);
            YL.audio.play('hurt');
          }
          break;
        case 'dash':
          ring(e.x, e.y, '236,233,255', 34, 0.35, 2);
          if (!isDemo) YL.audio.play('dash');
          break;
        case 'gameover':
          burst(d.x, d.y, '207,200,255', 30, 120, 1.4, 2.4);
          if (!isDemo) endGame();
          break;
      }
    }
  }

  /* ================================================================== *
   * HUD
   * ================================================================== */
  function setText(el, key, val) { if (hudCache[key] !== val) { hudCache[key] = val; el.textContent = val; } }

  function updateHUD() {
    var g = game;
    if (!g) return;
    setText(hud.night, 'n', nightName(g.night));
    setText(hud.cname, 'c', g.constellation.name + ' ' + g.lit + '/' + g.constellation.stars.length);
    var gv = Math.round(g.glow * 2) / 2;
    if (hudCache.g !== gv) {
      hudCache.g = gv;
      hud.glow.style.transform = 'scaleX(' + (g.glow / 100).toFixed(3) + ')';
      hud.glowbar.classList.toggle('low', g.glow < 25);
    }
    setText(hud.score, 's', g.score.toLocaleString('zh-CN'));
    setText(hud.combo, 'cb', g.combo > 1 ? '连击 ×' + g.combo : '');
    var vk = g.verse.seq.join('') + ':' + g.verse.idx;
    if (hudCache.v !== vk) {
      hudCache.v = vk;
      for (var i = 0; i < hud.dots.length; i++) {
        var dot = hud.dots[i];
        dot.style.setProperty('--c', HUE_HEX[g.verse.seq[i]]);
        dot.classList.toggle('on', i < g.verse.idx);
        dot.classList.toggle('next', i === g.verse.idx);
      }
    }
    var cd = Math.round(g.deer.dashCd / core.CFG.dashCooldown * 50) / 50;
    if (hudCache.cd !== cd) {
      hudCache.cd = cd;
      leapRing.style.strokeDashoffset = String(182.2 * cd);
      leapBtn.classList.toggle('cooling', cd > 0);
    }
  }

  function showBanner(kicker, title, sub) {
    bannerEl.textContent = '';
    [['b-kicker', kicker], ['b-title', title], ['b-sub', sub]].forEach(function (p) {
      var div = document.createElement('div');
      div.className = p[0];
      div.textContent = p[1];
      bannerEl.appendChild(div);
    });
    bannerEl.classList.remove('show');
    void bannerEl.offsetWidth;
    bannerEl.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(function () { bannerEl.classList.remove('show'); }, 2700);
  }

  /* ================================================================== *
   * 主循环
   * ================================================================== */
  function newDemo() {
    var d = core.createGame({ w: W || 960, h: H || 600 });
    if (reduced()) { d.lit = 2; d.charge = 3; }
    return d;
  }

  function buildInput() {
    var kx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0), ky = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
    if (kx || ky) { input.mode = 'dir'; input.dx = kx; input.dy = ky; lastKind = 'key'; }
    else if (lastKind === 'key') { input.mode = 'dir'; input.dx = 0; input.dy = 0; }
  }

  function frame(now) {
    raf = 0;
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    clock += dt;
    if (mode === 'playing' && game) {
      buildInput();
      var ev = core.step(game, dt, input);
      input.dash = false;
      if (game.deer.dashT > 0 && !reduced()) ghosts.push({ x: game.deer.x, y: game.deer.y, face: game.deer.face, life: 0.3 });
      maybeTrail(game, dt);
      handleEvents(ev, game, false);
    } else if (mode === 'idle' && demo && !reduced()) {
      var ev2 = core.step(demo, dt, core.autopilot(demo));
      maybeTrail(demo, dt);
      handleEvents(ev2, demo, true);
      if (demo.phase === 'over') demo = newDemo();
    }
    updateParticles(dt);
    draw(dt);
    updateHUD();
    schedule();
  }

  function maybeTrail(g, dt) {
    if (reduced()) return;
    var d = g.deer, sp = Math.hypot(d.vx, d.vy);
    if (sp > 80 && Math.random() < dt * 40) {
      var sk = core.SKINS[skin] || core.SKINS.cloud;
      parts.push({ k: 'spark', x: d.x - d.face * 18 + (Math.random() - 0.5) * 8, y: d.y - 2 + (Math.random() - 0.5) * 8, vx: -d.vx * 0.05, vy: 10, life: 0.7, max: 0.7, size: 1.8, rgb: sk.aura });
    }
  }

  function wantsLoop() {
    if (!visible || document.hidden) return false;
    if (mode === 'playing') return true;
    if (mode === 'paused') return false;
    return !reduced();
  }
  function schedule() {
    if (raf) return;
    if (wantsLoop()) raf = requestAnimationFrame(frame);
    else { last = 0; }
  }
  function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; }

  /* ================================================================== *
   * 流程：开始 / 暂停 / 结束
   * ================================================================== */
  function setMode(m) {
    mode = m;
    stage.classList.toggle('is-playing', m === 'playing');
    stage.classList.toggle('is-paused', m === 'paused');
    stage.classList.toggle('is-over', m === 'over');
    stage.classList.toggle('is-idle', m === 'idle');
    ovStart.hidden = m !== 'idle';
    ovPause.hidden = m !== 'paused';
    if (m !== 'over') { clearTimeout(overTimer); ovOver.hidden = true; }
  }

  function startGame() {
    YL.audio.unlock();
    YL.audio.play('start');
    resize();
    game = core.createGame({ w: W, h: H });
    parts = []; texts = []; ghosts = []; litTimes = []; hudCache = {};
    keys = {}; touch = null;
    input = { mode: null, tx: game.deer.x, ty: game.deer.y, dx: 0, dy: 0, dash: false };
    lastKind = 'pointer';
    setMode('playing');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    try { stage.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    var r = stage.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) {
      stage.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
    }
    showBanner(nightName(1), game.constellation.name, game.constellation.en + ' · 收集露光，点亮它');
    updateHUD();
    stopLoop();
    schedule();
  }

  function pause() {
    if (mode !== 'playing') return;
    setMode('paused');
    keys = {}; touch = null;
    stopLoop();
    drawOnce();
    var b = $('btn-resume');
    if (b) try { b.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  function resume() {
    if (mode !== 'paused') return;
    setMode('playing');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    last = 0;
    schedule();
  }
  function quit() {
    setMode('idle');
    game = null;
    demo = newDemo();
    parts = []; texts = []; ghosts = []; litTimes = [];
    stopLoop();
    drawOnce();
    schedule();
  }

  function endGame() {
    setMode('over');
    var g = game;
    var best = YL.store.get(BEST_KEY, 0) || 0, isBest = g.score > best;
    if (isBest) YL.store.set(BEST_KEY, g.score);
    $('over-title').textContent = g.completed.length
      ? '今夜点亮了 ' + g.completed.length + ' 座星座' + (isBest && best > 0 ? ' · 新纪录' : '')
      : '光，暂时熄了' + (isBest && best > 0 ? ' · 新纪录' : '');
    var stats = [
      ['抵达', nightName(g.night)], ['得分', g.score.toLocaleString('zh-CN')], ['最高分', Math.max(best, g.score).toLocaleString('zh-CN')],
      ['露光', String(g.totalLumi)], ['押韵', g.verses + ' 次'], ['最佳连击', '×' + g.bestCombo]
    ];
    var dl = $('over-stats');
    dl.textContent = '';
    stats.forEach(function (s, i) {
      var div = document.createElement('div');
      if (i === 2) div.className = 'best';
      var dt = document.createElement('dt'); dt.textContent = s[0];
      var dd = document.createElement('dd'); dd.textContent = s[1];
      div.appendChild(dt); div.appendChild(dd);
      dl.appendChild(div);
    });
    var box = $('over-consts');
    box.textContent = '';
    if (g.completed.length) {
      g.completed.slice(-4).forEach(function (rec) {
        var fig = document.createElement('figure');
        fig.appendChild(YL.constellationSVG(rec));
        var cap = document.createElement('figcaption'); cap.textContent = rec.name;
        fig.appendChild(cap);
        box.appendChild(fig);
      });
    } else {
      var p = document.createElement('p');
      p.className = 'over-empty';
      p.textContent = '这一夜还没点亮星座。提示：先追三色「韵」，光爆能补光、清雾。';
      box.appendChild(p);
    }
    YL.audio.play('over');
    clearTimeout(overTimer);
    overTimer = setTimeout(function () {
      if (mode !== 'over') return;
      ovOver.hidden = false;
      var b = $('btn-again');
      if (b) try { b.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }, reduced() ? 200 : 1100);
  }

  /* ================================================================== *
   * 输入
   * ================================================================== */
  function local(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  canvas.addEventListener('pointermove', function (e) {
    if (mode !== 'playing' || !game) return;
    var p = local(e);
    if (e.pointerType === 'mouse') {
      input.mode = 'target'; input.tx = p.x; input.ty = p.y; lastKind = 'pointer';
    } else if (touch && e.pointerId === touch.id) {
      e.preventDefault();
      var tx = touch.ax + (p.x - touch.sx) * 1.35, ty = touch.ay + (p.y - touch.sy) * 1.35;
      var cx = clamp(tx, 0, W), cy = clamp(ty, 0, H);
      // 拖出边界时重设锚点，避免回拖出现「死区」
      if (cx !== tx) touch.sx = p.x - (cx - touch.ax) / 1.35;
      if (cy !== ty) touch.sy = p.y - (cy - touch.ay) / 1.35;
      input.mode = 'target'; input.tx = cx; input.ty = cy; lastKind = 'pointer';
    }
  });

  canvas.addEventListener('pointerdown', function (e) {
    if (mode !== 'playing' || !game) return;
    var p = local(e);
    if (e.pointerType === 'mouse') {
      if (e.button === 0) { input.dash = true; input.mode = 'target'; input.tx = p.x; input.ty = p.y; lastKind = 'pointer'; }
      return;
    }
    e.preventDefault();
    var now = performance.now();
    if (now - lastTap.t < 300 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 60) input.dash = true;
    lastTap = { t: now, x: p.x, y: p.y };
    touch = { id: e.pointerId, sx: p.x, sy: p.y, ax: game.deer.x, ay: game.deer.y };
    input.mode = 'target'; input.tx = game.deer.x; input.ty = game.deer.y; lastKind = 'pointer';
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });

  function endTouch(e) { if (touch && e.pointerId === touch.id) touch = null; }
  canvas.addEventListener('pointerup', endTouch);
  canvas.addEventListener('pointercancel', endTouch);
  canvas.addEventListener('contextmenu', function (e) { if (mode === 'playing') e.preventDefault(); });

  leapBtn.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    if (mode === 'playing') input.dash = true;
  });
  leapBtn.addEventListener('click', function (e) {
    if (e.detail === 0 && mode === 'playing') input.dash = true; // 键盘触发
  });

  var KEYMAP = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    a: 'left', d: 'right', w: 'up', s: 'down', A: 'left', D: 'right', W: 'up', S: 'down'
  };
  window.addEventListener('keydown', function (e) {
    if (mode !== 'playing' && mode !== 'paused') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key;
    if (k === 'Escape' || k === 'p' || k === 'P') {
      e.preventDefault();
      if (mode === 'playing') pause(); else resume();
      return;
    }
    if (mode !== 'playing') return;
    if (KEYMAP[k]) { keys[KEYMAP[k]] = true; e.preventDefault(); }
    else if (k === ' ' || k === 'Shift' || k === 'j' || k === 'J') {
      if (!e.repeat) input.dash = true;
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', function (e) { if (KEYMAP[e.key]) keys[KEYMAP[e.key]] = false; });
  window.addEventListener('blur', function () { keys = {}; pause(); });

  /* ================================================================== *
   * 按钮与鹿色
   * ================================================================== */
  $('btn-start').addEventListener('click', startGame);
  $('btn-again').addEventListener('click', startGame);
  $('btn-restart').addEventListener('click', startGame);
  $('btn-resume').addEventListener('click', resume);
  $('btn-quit').addEventListener('click', quit);
  $('btn-pause').addEventListener('click', function () { if (mode === 'playing') pause(); });

  var fullBtn = $('btn-full');
  var canFS = !!(stage.requestFullscreen || stage.webkitRequestFullscreen);
  if (!canFS) fullBtn.hidden = true;
  fullBtn.addEventListener('click', function () {
    var fe = document.fullscreenElement || document.webkitFullscreenElement;
    try {
      if (fe) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else (stage.requestFullscreen || stage.webkitRequestFullscreen).call(stage);
    } catch (err) { /* ignore */ }
  });
  document.addEventListener('fullscreenchange', function () { setTimeout(resize, 50); });
  document.addEventListener('webkitfullscreenchange', function () { setTimeout(resize, 50); });

  function renderSkins() {
    var unlocked = YL.skins.unlocked();
    if (unlocked.indexOf(skin) < 0) skin = 'cloud';
    picker.textContent = '';
    core.SKIN_ORDER.forEach(function (id) {
      var sk = core.SKINS[id], open = unlocked.indexOf(id) >= 0;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'skin';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(id === skin));
      b.style.setProperty('--a', sk.antler);
      b.style.setProperty('--b', 'linear-gradient(' + sk.body[0] + ',' + sk.body[1] + ')');
      var dot = document.createElement('i');
      var label = document.createElement('span');
      label.textContent = open ? sk.cn : '未解锁';
      b.appendChild(dot); b.appendChild(label);
      if (!open) {
        b.setAttribute('aria-disabled', 'true');
        b.title = '在「字轮」中找到对应的读法即可解锁';
      }
      b.addEventListener('click', function () {
        if (!open) { YL.toast('这只鹿色还藏在「字轮」里——试试谜面提示的组合。'); return; }
        skin = id;
        YL.settings.set('skin', id);
        renderSkins();
        drawOnce();
      });
      picker.appendChild(b);
    });
  }
  YL.bus.on('skins', renderSkins);
  YL.bus.on('motion', function () {
    if (demo && reduced()) { demo.lit = Math.max(demo.lit, 2); }
    stopLoop();
    drawOnce();
    schedule();
  });

  /* ================================================================== *
   * 可见性：离开视野 / 切走标签页时自动暂停
   * ================================================================== */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { pause(); stopLoop(); }
    else schedule();
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      var en = entries[entries.length - 1];
      ratio = en.intersectionRatio;
      visible = en.isIntersecting;
      if (mode === 'playing' && ratio < 0.35) pause();
      if (visible) schedule(); else stopLoop();
    }, { threshold: [0, 0.35, 0.6] }).observe(stage);
  }
  if ('ResizeObserver' in window) {
    new ResizeObserver(function () { resize(); }).observe(stage);
  } else {
    window.addEventListener('resize', resize);
  }

  // 初始化
  stage.setAttribute('tabindex', '-1');
  resize();
  demo = newDemo();
  renderSkins();
  setMode('idle');
  drawOnce();
  schedule();

  // 暴露少量接口，便于调试
  YL.game = {
    start: startGame, pause: pause, resume: resume,
    state: function () { return game; },
    mode: function () { return mode; },
    drawDeer: drawDeer
  };
})();
