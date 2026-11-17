/* Yunlumi · loom.js —— 字轮：yun · lu · mi 三只字轮拼出 180 种读法 */
(function () {
  'use strict';
  var YL = window.YL, core = YL.core;
  var root = document.getElementById('loom-ui');
  if (!root) return;

  var KEYS = ['yun', 'lu', 'mi'];
  var DKEY = 'yunlumi.loom.v1';
  var idx = { yun: 0, lu: 0, mi: 0 };
  var reels = {};
  var seen = YL.store.get(DKEY, ['云鹿觅']);
  if (!Array.isArray(seen)) seen = ['云鹿觅'];

  var $ = function (id) { return document.getElementById(id); };
  var card = $('loom-card'), charsEl = $('loom-chars'), cnEl = $('loom-cn'), enEl = $('loom-en');
  var secretEl = $('loom-secret'), countEl = $('loom-count'), skinsEl = $('loom-skins');
  var weaveBtn = $('loom-weave'), homeBtn = $('loom-home');
  var weaving = false;

  function mod(n, m) { return ((n % m) + m) % m; }

  KEYS.forEach(function (k) {
    var el = root.querySelector('.reel[data-reel="' + k + '"]');
    var strip = el.querySelector('.reel-strip');
    core.LOOM[k].forEach(function (item) {
      var s = document.createElement('span');
      s.textContent = item.c;
      s.setAttribute('aria-hidden', 'true');
      strip.appendChild(s);
    });
    var r = reels[k] = {
      el: el, strip: strip, win: el.querySelector('.reel-window'),
      py: el.querySelector('.reel-py'), gloss: el.querySelector('.reel-gloss')
    };
    Array.prototype.forEach.call(el.querySelectorAll('.reel-arrow'), function (btn) {
      btn.addEventListener('click', function () { turn(k, parseInt(btn.getAttribute('data-dir'), 10)); });
    });
    r.win.addEventListener('click', function () { turn(k, 1); });
    r.win.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); turn(k, 1); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); turn(k, -1); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); turn(k, 1); }
    });
  });

  function render(k) {
    var r = reels[k], n = core.LOOM[k].length, i = idx[k], item = core.LOOM[k][i];
    r.strip.style.transform = 'translateY(' + (-i * 100 / n) + '%)';
    r.py.textContent = item.py;
    r.gloss.textContent = item.g;
    r.win.setAttribute('aria-valuenow', String(i));
    r.win.setAttribute('aria-valuetext', item.c + '（' + item.py + '，' + item.g + '）');
  }

  function flash() {
    if (YL.reducedMotion()) return;
    card.classList.remove('flash');
    void card.offsetWidth; // 重启动画
    card.classList.add('flash');
  }

  function compose(fromUser) {
    var line = core.loomLine(idx.yun, idx.lu, idx.mi);
    charsEl.textContent = line.chars;
    cnEl.textContent = line.cn;
    enEl.textContent = line.en;
    if (seen.indexOf(line.chars) < 0) {
      seen.push(line.chars);
      YL.store.set(DKEY, seen);
    }
    countEl.textContent = String(seen.length);
    if (line.secret) {
      secretEl.hidden = false;
      secretEl.textContent = '✦ ' + line.secret.cn;
      if (fromUser) {
        flash();
        if (YL.audio) YL.audio.play('chime');
        if (line.secret.skin !== 'cloud' && YL.skins.unlock(line.secret.skin)) {
          var sk = core.SKINS[line.secret.skin];
          YL.toast('✦ 解锁鹿色「' + sk.cn + '」—— 去夜游开始界面换上它');
        }
      }
    } else {
      secretEl.hidden = true;
    }
    skinsEl.textContent = String(Math.max(0, YL.skins.unlocked().length - 1));
  }

  function turn(k, d) {
    if (weaving) return;
    idx[k] = mod(idx[k] + d, core.LOOM[k].length);
    render(k);
    if (YL.audio) YL.audio.play('tick');
    compose(true);
  }

  function weave() {
    if (weaving) return;
    var target = {};
    KEYS.forEach(function (k) { target[k] = Math.floor(Math.random() * core.LOOM[k].length); });
    if (target.yun === idx.yun && target.lu === idx.lu && target.mi === idx.mi) {
      target.mi = mod(target.mi + 1, core.LOOM.mi.length);
    }
    if (YL.reducedMotion()) {
      KEYS.forEach(function (k) { idx[k] = target[k]; render(k); });
      if (YL.audio) YL.audio.play('settle', { step: 7 });
      compose(true);
      return;
    }
    weaving = true;
    weaveBtn.disabled = true;
    var pending = KEYS.length;
    KEYS.forEach(function (k, ki) {
      var n = core.LOOM[k].length, steps = 7 + ki * 4, count = 0, r = reels[k];
      r.strip.classList.add('spinning');
      var timer = setInterval(function () {
        count++;
        if (count < steps) {
          idx[k] = (idx[k] + 1) % n;
          render(k);
          if (YL.audio && count % 2 === 0) YL.audio.play('tick');
          return;
        }
        clearInterval(timer);
        r.strip.classList.remove('spinning');
        idx[k] = target[k];
        render(k);
        if (YL.audio) YL.audio.play('settle', { step: 5 + ki * 2 });
        if (--pending === 0) {
          weaving = false;
          weaveBtn.disabled = false;
          compose(true);
        }
      }, 70);
    });
  }

  weaveBtn.addEventListener('click', weave);
  homeBtn.addEventListener('click', function () {
    if (weaving) return;
    KEYS.forEach(function (k) { idx[k] = 0; render(k); });
    compose(true);
  });
  YL.bus.on('skins', function () { skinsEl.textContent = String(Math.max(0, YL.skins.unlocked().length - 1)); });

  KEYS.forEach(render);
  compose(false);
})();
