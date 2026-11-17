/* Yunlumi · hero.js —— 由数千颗露光组成的 YUNLUMI 粒子字 */
(function () {
  'use strict';
  var YL = window.YL;
  var canvas = document.getElementById('hero-canvas');
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext('2d');
  var FONT = '"Avenir Next", "Futura", "Trebuchet MS", "Segoe UI", system-ui, sans-serif';
  var COLS = [[255, 217, 138], [127, 240, 220], [255, 158, 196], [207, 200, 255]];
  var W = 0, H = 0, parts = [], raf = 0, visible = true, last = 0;
  var pointer = { x: -9999, y: -9999, active: false, lastMove: 0 };
  var firefly = { x: -9999, y: -9999 };

  function colAt(u) {
    var seg = Math.max(0, Math.min(0.999, u)) * 3, i = Math.floor(seg), f = seg - i;
    var a = COLS[i], b = COLS[i + 1];
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * f) + ',' + Math.round(a[1] + (b[1] - a[1]) * f) + ',' + Math.round(a[2] + (b[2] - a[2]) * f) + ')';
  }

  function build() {
    var rect = canvas.getBoundingClientRect();
    var nw = Math.round(rect.width), nh = Math.round(rect.height);
    if (nw < 20 || nh < 20) return false;
    if (nw === W && nh === H && parts.length) return false;
    W = nw; H = nh;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var off = document.createElement('canvas');
    off.width = W; off.height = H;
    var o = off.getContext('2d');
    var text = 'YUNLUMI'.split('');
    var fs = Math.min(H * 0.82, W * 0.2);
    var widths, total, spacing;
    var measure = function () {
      o.font = '800 ' + fs + 'px ' + FONT;
      spacing = fs * 0.07;
      widths = text.map(function (ch) { return o.measureText(ch).width; });
      total = widths.reduce(function (a, b) { return a + b; }, 0) + spacing * (text.length - 1);
    };
    measure();
    if (total > W * 0.94) { fs *= (W * 0.94) / total; measure(); }
    o.fillStyle = '#fff';
    o.textBaseline = 'middle';
    var x = (W - total) / 2;
    text.forEach(function (ch, i) { o.fillText(ch, x, H * 0.54); x += widths[i] + spacing; });

    var data = o.getImageData(0, 0, W, H).data;
    var step = Math.max(3, Math.round(fs / 24));
    var pts = [];
    for (var y = 0; y < H; y += step) {
      for (var xx = 0; xx < W; xx += step) {
        if (data[(y * W + xx) * 4 + 3] > 140) pts.push(xx, y);
      }
    }
    var count = pts.length / 2, cap = 4200, stride = Math.max(1, Math.ceil(count / cap));
    var reduce = YL.reducedMotion();
    var prev = parts;
    parts = [];
    for (var k = 0; k < count; k += stride) {
      var hx = pts[k * 2], hy = pts[k * 2 + 1], r = Math.random();
      var from = prev.length ? prev[(k * 7) % prev.length] : null;
      parts.push({
        hx: hx, hy: hy,
        x: reduce ? hx : (from ? from.x : W / 2 + (Math.random() - 0.5) * W * 1.2),
        y: reduce ? hy : (from ? from.y : H + 20 + Math.random() * H),
        vx: 0, vy: 0,
        c: r < 0.06 ? '#ffffff' : colAt(hx / W + (Math.random() - 0.5) * 0.08),
        s: r < 0.08 ? 2.4 : 1.3 + Math.random() * 0.7,
        ph: Math.random() * 6.283, tw: r < 0.14
      });
    }
    return true;
  }

  function drawStatic() {
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      p.x = p.hx; p.y = p.hy; p.vx = p.vy = 0;
      ctx.globalAlpha = p.tw ? 0.7 : 0.92;
      ctx.fillStyle = p.c;
      ctx.fillRect(p.hx - p.s / 2, p.hy - p.s / 2, p.s, p.s);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function frame(now) {
    raf = 0;
    var dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    var k = dt * 60, damp = Math.pow(0.84, k), t = now / 1000;

    // 指针闲置时，一只萤火在字间游走，暗示「可以拨动」
    var idle = !pointer.active || now - pointer.lastMove > 2500;
    if (idle) {
      firefly.x = W * (0.5 + 0.46 * Math.sin(t * 0.37));
      firefly.y = H * (0.54 + 0.3 * Math.sin(t * 0.83 + 1.2));
    }
    var px = idle ? firefly.x : pointer.x, py = idle ? firefly.y : pointer.y;
    var R = idle ? Math.max(30, W * 0.03) : Math.max(60, W * 0.075), R2 = R * R, strength = idle ? 1.2 : 3.4;

    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var hx = p.hx + Math.sin(t * 1.1 + p.hy * 0.05) * 0.9;
      var hy = p.hy + Math.cos(t * 0.9 + p.hx * 0.03) * 0.9;
      p.vx += (hx - p.x) * 0.045 * k;
      p.vy += (hy - p.y) * 0.045 * k;
      var dx = p.x - px, dy = p.y - py, d2 = dx * dx + dy * dy;
      if (d2 < R2 && d2 > 0.01) {
        var d = Math.sqrt(d2), f = (1 - d / R) * strength * k;
        p.vx += dx / d * f; p.vy += dy / d * f;
      }
      p.vx *= damp; p.vy *= damp;
      p.x += p.vx * k; p.y += p.vy * k;
      ctx.globalAlpha = p.tw ? 0.5 + 0.5 * Math.sin(t * 3 + p.ph) : 0.9;
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    if (idle) {
      var g = ctx.createRadialGradient(px, py, 0, px, py, 16);
      g.addColorStop(0, 'rgba(255,240,200,0.9)');
      g.addColorStop(1, 'rgba(255,217,138,0)');
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = g;
      ctx.fillRect(px - 16, py - 16, 32, 32);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    schedule();
  }

  function schedule() {
    if (raf || !visible || document.hidden || YL.reducedMotion()) return;
    raf = requestAnimationFrame(frame);
  }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; }

  function refresh() {
    var rebuilt = build();
    if (YL.reducedMotion()) { stop(); drawStatic(); }
    else if (rebuilt || !raf) schedule();
  }

  function local(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  canvas.addEventListener('pointermove', function (e) {
    var p = local(e);
    pointer.x = p.x; pointer.y = p.y; pointer.active = true; pointer.lastMove = performance.now();
  });
  canvas.addEventListener('pointerleave', function () { pointer.active = false; });
  canvas.addEventListener('pointercancel', function () { pointer.active = false; });
  canvas.addEventListener('pointerdown', function (e) {
    if (YL.reducedMotion()) return;
    var p = local(e), reach = Math.max(W * 0.45, 200);
    pointer.x = p.x; pointer.y = p.y; pointer.active = true; pointer.lastMove = performance.now();
    for (var i = 0; i < parts.length; i++) {
      var q = parts[i], dx = q.x - p.x, dy = q.y - p.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      var f = 16 * Math.max(0, 1 - d / reach);
      q.vx += dx / d * f + (Math.random() - 0.5) * 3;
      q.vy += dy / d * f + (Math.random() - 0.5) * 3;
    }
    if (YL.audio) YL.audio.play('pop');
  });

  var resizeT = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(refresh, 120);
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else schedule(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) schedule(); else stop();
    }).observe(canvas);
  }
  YL.bus.on('motion', function () { refresh(); });

  // 字体可能稍后才就绪；就绪后若尺寸不变也强制重建一次
  function init() { W = 0; refresh(); }
  init();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { W = 0; refresh(); });
})();
