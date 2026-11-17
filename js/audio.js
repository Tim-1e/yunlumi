/* Yunlumi · audio.js —— WebAudio 实时合成的五声音阶音效（无音频文件） */
(function () {
  'use strict';
  var YL = window.YL;
  var ctx = null, master = null, noiseBuf = null;
  var enabled = YL.settings.get('sound', true) !== false;
  var PENTA = [0, 2, 4, 7, 9];
  var BASE = 293.66; // D4

  function freq(step) {
    var oct = Math.floor(step / 5), deg = ((step % 5) + 5) % 5;
    return BASE * Math.pow(2, oct + PENTA[deg] / 12);
  }

  function ensure() {
    if (!enabled) return null;
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
      master = ctx.createGain();
      master.gain.value = 0.42;
      // 轻微回声，营造夜空的空旷感
      var delay = ctx.createDelay(1.0), fb = ctx.createGain(), wet = ctx.createGain(), lp = ctx.createBiquadFilter();
      delay.delayTime.value = 0.27; fb.gain.value = 0.3; wet.gain.value = 0.22;
      lp.type = 'lowpass'; lp.frequency.value = 2600;
      master.connect(ctx.destination);
      master.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(wet); wet.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      var data = noiseBuf.getChannelData(0);
      for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    return ctx;
  }

  function tone(f, t0, dur, type, vol, slideTo) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noise(t0, dur, vol, fromF, toF) {
    var src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf;
    bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(fromF, t0);
    bp.frequency.exponentialRampToValueAtTime(toF, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  var lastCollect = 0;
  function play(name, o) {
    if (!enabled) return;
    if (!ensure()) return;
    o = o || {};
    var t = ctx.currentTime + 0.005, i;
    switch (name) {
      case 'collect':
        if (t - lastCollect < 0.03) return;
        lastCollect = t;
        var st = 5 + (o.hue || 0) * 2 + Math.min(5, (o.combo || 1) - 1);
        tone(freq(st), t, 0.4, 'sine', 0.2);
        tone(freq(st) * 2, t, 0.18, 'triangle', 0.04);
        break;
      case 'verse':
        [5, 7, 9, 10, 12].forEach(function (s, k) { tone(freq(s), t + k * 0.065, 0.7, 'triangle', 0.11); });
        noise(t, 0.6, 0.05, 3000, 9000);
        break;
      case 'star':
        tone(freq(12 + (o.index || 0) % 5), t, 1.4, 'sine', 0.16);
        tone(freq(12 + (o.index || 0) % 5) * 2.76, t, 0.5, 'sine', 0.035);
        break;
      case 'hurt':
        tone(150, t, 0.35, 'sawtooth', 0.07, 60);
        noise(t, 0.3, 0.08, 900, 200);
        break;
      case 'dash':
        noise(t, 0.28, 0.09, 600, 4200);
        break;
      case 'night':
        [0, 2, 4, 5, 7, 9, 10].forEach(function (s, k) { tone(freq(s + 5), t + k * 0.11, 1.6, 'sine', 0.1); });
        break;
      case 'start':
        [5, 9, 12].forEach(function (s, k) { tone(freq(s), t + k * 0.09, 0.9, 'sine', 0.1); });
        break;
      case 'over':
        [9, 7, 5, 2, 0].forEach(function (s, k) { tone(freq(s), t + k * 0.18, 1.2, 'triangle', 0.08); });
        break;
      case 'tick':
        tone(1400 + Math.random() * 300, t, 0.04, 'square', 0.015);
        break;
      case 'settle':
        tone(freq(o.step || 5), t, 0.5, 'sine', 0.08);
        break;
      case 'chime':
        for (i = 0; i < 4; i++) tone(freq(10 + i * 2), t + i * 0.08, 1.1, 'sine', 0.1);
        break;
      case 'pop':
        tone(500 + Math.random() * 200, t, 0.18, 'sine', 0.06, 1100);
        break;
    }
  }

  YL.audio = {
    play: play,
    unlock: function () { ensure(); },
    isEnabled: function () { return enabled; },
    setEnabled: function (b) {
      enabled = !!b;
      YL.settings.set('sound', enabled);
      if (enabled) ensure();
      else if (ctx && ctx.state === 'running' && ctx.suspend) ctx.suspend();
    }
  };
})();
