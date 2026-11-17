/* Yunlumi · main.js —— 顶栏开关、章节导航高亮 */
(function () {
  'use strict';
  var YL = window.YL;

  /* 声音开关 */
  var snd = document.getElementById('tog-sound');
  function syncSound() {
    var on = YL.audio.isEnabled();
    snd.setAttribute('aria-pressed', String(on));
    snd.title = on ? '声音：开（点击关闭）' : '声音：关（点击开启）';
  }
  snd.addEventListener('click', function () {
    YL.audio.setEnabled(!YL.audio.isEnabled());
    syncSound();
    if (YL.audio.isEnabled()) YL.audio.play('settle', { step: 9 });
  });
  syncSound();

  /* 减少动效开关 */
  var mot = document.getElementById('tog-motion');
  function syncMotion() {
    var r = YL.reducedMotion();
    mot.setAttribute('aria-pressed', String(r));
    mot.title = r ? '已减少动态效果（点击恢复）' : '减少动态效果';
  }
  mot.addEventListener('click', function () {
    YL.setMotion(YL.reducedMotion() ? 'full' : 'reduce');
    syncMotion();
    YL.toast(YL.reducedMotion() ? '已减少动态效果：粒子静止、无震屏闪光。' : '动态效果已恢复。', 2200);
  });
  YL.bus.on('motion', syncMotion);
  syncMotion();

  /* 导航高亮 */
  var links = Array.prototype.slice.call(document.querySelectorAll('.nav a'));
  if ('IntersectionObserver' in window) {
    var current = null;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) current = en.target.id;
      });
      links.forEach(function (a) { a.classList.toggle('is-active', a.getAttribute('href') === '#' + current); });
    }, { rootMargin: '-45% 0px -50% 0px' });
    ['loom', 'play', 'atlas'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) io.observe(el);
    });
  }
})();
