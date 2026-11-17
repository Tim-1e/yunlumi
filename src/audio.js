// Procedural WebAudio: dreamy pad, speed wind, pentatonic collection melody, bells, whooshes.
// No audio files — everything is synthesised at runtime.

const RATIOS = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];
const BASE = 293.66; // D4

function pent(k) {
  const o = Math.floor(k / 5);
  return BASE * RATIOS[((k % 5) + 5) % 5] * Math.pow(2, o);
}

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try {
      this.muted = localStorage.getItem('yunlumi.muted') === '1';
    } catch (e) {
      /* storage unavailable */
    }
    this.lastChime = 0;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.85;
    this.master.connect(comp);

    // reverb
    const len = Math.floor(ctx.sampleRate * 2.8);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    this.verb = ctx.createConvolver();
    this.verb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.42;
    this.verb.connect(wet);
    wet.connect(this.master);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 1;
    this.sfx.connect(this.master);
    this.sfx.connect(this.verb);

    // noise buffer
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noise = nb;

    // ambient pad (Dmaj9-ish) with slow filter breathing
    const pad = ctx.createGain();
    pad.gain.value = 0.045;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    lp.Q.value = 0.7;
    lp.connect(pad);
    pad.connect(this.master);
    pad.connect(this.verb);
    [146.83, 220, 277.18, 329.63, 369.99].forEach((f, i) => {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = i < 2 ? 'sine' : 'triangle';
        o.frequency.value = f;
        o.detune.value = det + i * 1.5;
        const g = ctx.createGain();
        g.gain.value = i < 2 ? 0.5 : 0.22;
        o.connect(g);
        g.connect(lp);
        o.start();
      }
    });
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 380;
    lfo.connect(lfoG);
    lfoG.connect(lp.frequency);
    lfo.start();
    this.pad = pad;

    // wind (speed feedback)
    const wn = ctx.createBufferSource();
    wn.buffer = nb;
    wn.loop = true;
    this.windF = ctx.createBiquadFilter();
    this.windF.type = 'bandpass';
    this.windF.frequency.value = 400;
    this.windF.Q.value = 0.8;
    this.windG = ctx.createGain();
    this.windG.gain.value = 0;
    wn.connect(this.windF);
    this.windF.connect(this.windG);
    this.windG.connect(this.master);
    wn.start();

    // gloom drone (proximity threat)
    this.droneG = ctx.createGain();
    this.droneG.gain.value = 0;
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 260;
    dlp.connect(this.droneG);
    this.droneG.connect(this.master);
    [55, 58.3, 82.4].forEach((f) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(dlp);
      o.start();
    });
  }

  get ready() {
    return !!this.ctx;
  }

  setMuted(m) {
    this.muted = m;
    try {
      localStorage.setItem('yunlumi.muted', m ? '1' : '0');
    } catch (e) {
      /* ignore */
    }
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.05);
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  /** speed01: 0..1, threat01: 0..1 (nearest gloom), finale: 0..1 */
  update(speed01, threat01) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.windG.gain.setTargetAtTime(0.02 + speed01 * speed01 * 0.16, t, 0.15);
    this.windF.frequency.setTargetAtTime(300 + speed01 * 1300, t, 0.2);
    this.droneG.gain.setTargetAtTime(threat01 * 0.07, t, 0.3);
  }

  _tone(freq, t, { type = 'sine', attack = 0.005, decay = 0.6, peak = 0.1, dest = this.sfx, detune = 0 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + attack + decay + 0.05);
    return o;
  }

  /** Collection chime; pitch climbs the pentatonic scale with the combo. */
  chime(combo) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (t - this.lastChime < 0.045) return;
    this.lastChime = t;
    const k = combo % 15;
    const f = pent(k);
    this._tone(f, t, { peak: 0.05, decay: 0.35 });
    this._tone(f * 2, t, { peak: 0.018, decay: 0.2, type: 'triangle' });
  }

  bell(k = 0, vol = 0.12) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const f = pent(k);
    // simple FM bell
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const mg = ctx.createGain();
    car.frequency.value = f;
    mod.frequency.value = f * 3.5;
    mg.gain.setValueAtTime(f * 2, t);
    mg.gain.exponentialRampToValueAtTime(1, t + 1.8);
    mod.connect(mg);
    mg.connect(car.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    car.connect(g);
    g.connect(this.sfx);
    car.start(t);
    mod.start(t);
    car.stop(t + 2.7);
    mod.stop(t + 2.7);
    this._tone(f * 0.5, t, { peak: vol * 0.5, decay: 1.5 });
  }

  /** Rising arpeggio for constellation completion / finale. */
  arpeggio(root = 0, n = 8, step = 0.09, vol = 0.09) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < n; i++) {
      const f = pent(root + i);
      this._tone(f, t + i * step, { peak: vol, decay: 1.2 });
      this._tone(f * 1.5, t + i * step, { peak: vol * 0.3, decay: 0.8, type: 'triangle' });
    }
  }

  whoosh(up = true, vol = 0.2, dur = 0.5) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(up ? 300 : 2400, t);
    f.frequency.exponentialRampToValueAtTime(up ? 2600 : 250, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.sfx);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  hit() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.45);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.55);
    this.whoosh(false, 0.15, 0.4);
    this._tone(233.08, t, { type: 'sawtooth', peak: 0.04, decay: 0.4, detune: -30 });
  }

  denied() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._tone(220, t, { type: 'triangle', peak: 0.06, decay: 0.18 });
    this._tone(207.65, t + 0.1, { type: 'triangle', peak: 0.05, decay: 0.25 });
  }

  pulse() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.whoosh(true, 0.22, 0.6);
    this._tone(pent(0) / 2, t, { peak: 0.12, decay: 0.9 });
    this._tone(pent(4), t, { peak: 0.05, decay: 0.7, type: 'triangle' });
  }

  ring(combo) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.whoosh(true, 0.16, 0.35);
    const k = 5 + (combo % 10);
    this._tone(pent(k), t, { peak: 0.06, decay: 0.4 });
    this._tone(pent(k + 2), t + 0.07, { peak: 0.06, decay: 0.5 });
    this._tone(pent(k + 4), t + 0.14, { peak: 0.06, decay: 0.7 });
  }

  dawn() {
    if (!this.ctx) return;
    this.arpeggio(-5, 6, 0.25, 0.06);
  }
}
