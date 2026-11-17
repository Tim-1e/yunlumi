/* Yunlumi · shared.js —— 存储、事件总线、提示、动效偏好 */
(function () {
  'use strict';
  var YL = window.YL = window.YL || {};

  /* ---------- localStorage（隐私模式下静默失败） ---------- */
  var mem = {};
  YL.store = {
    get: function (key, fallback) {
      try {
        var raw = window.localStorage.getItem(key);
        if (raw == null) return key in mem ? mem[key] : fallback;
        return JSON.parse(raw);
      } catch (e) {
        return key in mem ? mem[key] : fallback;
      }
    },
    set: function (key, val) {
      mem[key] = val;
      try { window.localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ }
    }
  };

  /* ---------- 事件总线 ---------- */
  var handlers = {};
  YL.bus = {
    on: function (name, fn) { (handlers[name] = handlers[name] || []).push(fn); },
    emit: function (name, data) { (handlers[name] || []).slice().forEach(function (fn) { fn(data); }); }
  };

  /* ---------- 设置 ---------- */
  var SKEY = 'yunlumi.settings.v1';
  var settings = YL.store.get(SKEY, {}) || {};
  YL.settings = {
    get: function (k, d) { return k in settings ? settings[k] : d; },
    set: function (k, v) { settings[k] = v; YL.store.set(SKEY, settings); }
  };

  /* ---------- 动效偏好 ---------- */
  YL.reducedMotion = function () {
    return document.documentElement.getAttribute('data-motion') === 'reduce';
  };
  YL.setMotion = function (mode) {
    document.documentElement.setAttribute('data-motion', mode);
    YL.settings.set('motion', mode);
    YL.bus.emit('motion', mode === 'reduce');
  };
  // 系统偏好变化时（且用户没有手动指定过）跟随
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    var onChange = function () {
      if (YL.settings.get('motion', null)) return;
      document.documentElement.setAttribute('data-motion', mq.matches ? 'reduce' : 'full');
      YL.bus.emit('motion', mq.matches);
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  /* ---------- Toast ---------- */
  var toastTimer = 0;
  YL.toast = function (msg, ms) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, ms || 3200);
  };

  /* ---------- 解锁的鹿色 ---------- */
  var SKIN_KEY = 'yunlumi.skins.v1';
  YL.skins = {
    unlocked: function () {
      var list = YL.store.get(SKIN_KEY, ['cloud']);
      if (!Array.isArray(list)) list = ['cloud'];
      if (list.indexOf('cloud') < 0) list.unshift('cloud');
      return list;
    },
    unlock: function (id) {
      var list = YL.skins.unlocked();
      if (list.indexOf(id) >= 0) return false;
      list.push(id);
      YL.store.set(SKIN_KEY, list);
      YL.bus.emit('skins', list);
      return true;
    }
  };

  /* ---------- 小工具 ---------- */
  YL.isCoarse = function () {
    return !!(window.matchMedia && window.matchMedia('(hover: none), (pointer: coarse)').matches);
  };
  YL.svgNS = 'http://www.w3.org/2000/svg';

  /** 把星座渲染成 SVG（星图卡片与结算页共用） */
  YL.constellationSVG = function (rec, opts) {
    opts = opts || {};
    var W = 100, H = 70, NS = YL.svgNS;
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', (rec.name || '星座') + ' 的星图');
    var px = function (s) { return [4 + s.x * 92, 3 + ((s.y - 0.10) / 0.64) * 64]; };
    // 背景小星
    var rng = window.YL.core.mulberry32((rec.seed || 1) >>> 0);
    for (var i = 0; i < 26; i++) {
      var d = document.createElementNS(NS, 'circle');
      d.setAttribute('cx', (rng() * W).toFixed(1));
      d.setAttribute('cy', (rng() * H).toFixed(1));
      d.setAttribute('r', (0.2 + rng() * 0.4).toFixed(2));
      d.setAttribute('fill', '#cfc8ff');
      d.setAttribute('opacity', (0.2 + rng() * 0.4).toFixed(2));
      svg.appendChild(d);
    }
    (rec.edges || []).forEach(function (e) {
      var a = rec.stars[e[0]], b = rec.stars[e[1]];
      if (!a || !b) return;
      var pa = px(a), pb = px(b);
      var l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', pa[0].toFixed(2)); l.setAttribute('y1', pa[1].toFixed(2));
      l.setAttribute('x2', pb[0].toFixed(2)); l.setAttribute('y2', pb[1].toFixed(2));
      l.setAttribute('stroke', 'rgba(255,217,138,0.75)');
      l.setAttribute('stroke-width', '0.6');
      l.setAttribute('stroke-linecap', 'round');
      svg.appendChild(l);
    });
    var cols = ['#ffd98a', '#7ff0dc', '#ff9ec4', '#ffffff'];
    rec.stars.forEach(function (s, idx) {
      var p = px(s);
      var g = document.createElementNS(NS, 'circle');
      g.setAttribute('cx', p[0].toFixed(2)); g.setAttribute('cy', p[1].toFixed(2));
      g.setAttribute('r', '3.2'); g.setAttribute('fill', cols[idx % 4]); g.setAttribute('opacity', '0.18');
      svg.appendChild(g);
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', p[0].toFixed(2)); c.setAttribute('cy', p[1].toFixed(2));
      c.setAttribute('r', idx === 0 ? '1.6' : '1.2'); c.setAttribute('fill', '#fff');
      if (opts.twinkle && !YL.reducedMotion()) {
        c.setAttribute('class', 'tw');
        c.style.animationDelay = (idx * 0.37).toFixed(2) + 's';
      }
      svg.appendChild(c);
    });
    return svg;
  };
})();
