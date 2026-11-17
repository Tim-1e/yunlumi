/* Yunlumi · atlas.js —— 星图：保存并展示点亮过的星座（localStorage） */
(function () {
  'use strict';
  var YL = window.YL, core = YL.core;
  var KEY = 'yunlumi.atlas.v1', MAX = 60;
  var grid = document.getElementById('atlas-grid');
  var sum = document.getElementById('atlas-sum');
  var clearBtn = document.getElementById('atlas-clear');
  if (!grid) return;

  function valid(r) {
    return r && typeof r.name === 'string' && Array.isArray(r.stars) && Array.isArray(r.edges) &&
      r.stars.length > 0 && r.stars.length <= 20 &&
      r.stars.every(function (s) { return s && isFinite(s.x) && isFinite(s.y); }) &&
      r.edges.every(function (e) { return Array.isArray(e) && e.length === 2 && e[0] >= 0 && e[1] >= 0 && e[0] < r.stars.length && e[1] < r.stars.length; });
  }
  function load() {
    var a = YL.store.get(KEY, []);
    return Array.isArray(a) ? a.filter(valid) : [];
  }
  var list = load();

  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function render(newId) {
    grid.textContent = '';
    if (!list.length) {
      var li = document.createElement('li');
      li.className = 'atlas-empty';
      li.innerHTML = '<svg viewBox="0 0 64 64" aria-hidden="true"><use href="#deer-mark"/></svg>' +
        '<p>星图还空着。去<a href="#play">夜游</a>里点亮第一座星座吧。</p>';
      grid.appendChild(li);
      sum.textContent = '尚未收集星座';
      clearBtn.hidden = true;
      return;
    }
    clearBtn.hidden = false;
    var starsTotal = list.reduce(function (a, r) { return a + r.stars.length; }, 0);
    var farthest = list.reduce(function (a, r) { return Math.max(a, r.night || 1); }, 1);
    sum.innerHTML = '已收集 <b>' + list.length + '</b> 座星座 · 共 <b>' + starsTotal + '</b> 颗星 · 最远抵达第 <b>' + farthest + '</b> 夜';

    list.slice().reverse().forEach(function (rec) {
      var li = document.createElement('li');
      li.className = 'atlas-card' + (rec.id === newId && !YL.reducedMotion() ? ' is-new' : '');
      li.appendChild(YL.constellationSVG(rec, { twinkle: true }));
      var h = document.createElement('h3'); h.textContent = rec.name;
      var en = document.createElement('p'); en.className = 'en'; en.lang = 'en'; en.textContent = rec.en || '';
      var meta = document.createElement('p'); meta.className = 'meta';
      var skin = core.SKINS[rec.skin] ? core.SKINS[rec.skin].cn : '云白';
      meta.textContent = '第 ' + (rec.night || 1) + ' 夜 · ' + rec.stars.length + ' 颗星 · ' + skin + '小鹿 · ' + fmtDate(rec.date);
      li.appendChild(h); li.appendChild(en); li.appendChild(meta);
      grid.appendChild(li);
    });
  }

  clearBtn.addEventListener('click', function () {
    if (!window.confirm('确定要清空星图吗？已点亮的星座将无法恢复。')) return;
    list = [];
    YL.store.set(KEY, list);
    render();
    YL.toast('星图已清空，夜空重新等待被点亮。');
  });

  YL.atlas = {
    add: function (rec) {
      if (!valid(rec)) return;
      list.push(rec);
      while (list.length > MAX) list.shift();
      YL.store.set(KEY, list);
      render(rec.id);
    },
    count: function () { return list.length; }
  };

  YL.bus.on('motion', function () { render(); });
  render();
})();
