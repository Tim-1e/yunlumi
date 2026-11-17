import * as THREE from 'three';
import { CONSTELLATIONS } from './core/data.js';
import { fmtTime } from './core/math.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.root = $('hud');
    this.el = {
      light: $('light'),
      boost: $('boost'),
      pulse: $('sk-pulse'),
      dash: $('sk-dash'),
      time: $('time'),
      nightFill: $('night-fill'),
      score: $('score'),
      consts: $('consts'),
      lanterns: $('lanterns'),
      combo: $('combo'),
      guide: $('guide'),
      guideLabel: $('guide-label'),
      shoot: $('shoot-guide'),
      prompt: $('prompt'),
      banner: $('banner'),
      hint: $('hint'),
      vignette: $('vignette'),
      floats: $('floats'),
      fps: $('fps'),
      edge: $('edge'),
    };
    this.constEls = CONSTELLATIONS.map((C) => {
      const d = document.createElement('div');
      d.className = 'const';
      d.style.setProperty('--c', C.color);
      d.innerHTML = `<span class="glyph">${C.glyph}</span><span class="dots"></span>`;
      d.title = `${C.name} · ${C.upgrade.label}：${C.upgrade.desc}`;
      this.el.consts.appendChild(d);
      return d;
    });
    this.cache = {};
    this.hintT = 0;
    this.bannerT = 0;
    this.v = new THREE.Vector3();
  }

  show(v) {
    this.root.classList.toggle('hidden', !v);
  }

  set(key, el, value, prop = 'textContent') {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    el[prop] = value;
  }

  hint(text, dur = 6) {
    this.el.hint.textContent = text;
    this.el.hint.classList.add('on');
    this.hintT = dur;
  }

  banner(title, sub, color = '#fff', dur = 4.5) {
    const b = this.el.banner;
    b.querySelector('h2').textContent = title;
    b.querySelector('p').textContent = sub;
    b.style.setProperty('--c', color);
    b.classList.remove('on');
    void b.offsetWidth; // restart animation
    b.classList.add('on');
    this.bannerT = dur;
  }

  float(text, color = '#ffe7a8', big = false) {
    const f = this.el.floats;
    if (f.childElementCount > 6) f.firstElementChild.remove();
    const d = document.createElement('div');
    d.className = big ? 'float big' : 'float';
    d.style.color = color;
    d.textContent = text;
    f.appendChild(d);
    setTimeout(() => d.remove(), 1400);
  }

  flash(color = 'rgba(255,40,110,0.45)') {
    const v = this.el.vignette;
    v.style.setProperty('--vc', color);
    v.classList.remove('on');
    void v.offsetWidth;
    v.classList.add('on');
  }

  resetConsts() {
    this.cache = {};
    this.constEls.forEach((e) => e.classList.remove('done'));
  }

  update(dt, s) {
    const { run } = s;
    this.set('light', this.el.light, String(Math.floor(run.light)));
    this.set('lightLow', this.el.light, run.light >= s.cost ? 'ok' : 'low', 'className');
    this.el.boost.style.transform = `scaleX(${Math.max(0, Math.min(1, s.boost01)).toFixed(3)})`;
    this.el.boost.parentElement.classList.toggle('active', s.boosting);
    this.el.pulse.style.setProperty('--cd', s.pulse01.toFixed(3));
    this.el.dash.style.setProperty('--cd', s.dash01.toFixed(3));
    this.set('pulseLow', this.el.pulse, run.light < run.pulseCost ? 'sk low' : 'sk', 'className');
    this.set('time', this.el.time, fmtTime(run.time));
    this.el.nightFill.style.transform = `scaleX(${Math.max(0, Math.min(1, run.time / s.nightMax)).toFixed(4)})`;
    this.set('timeWarn', this.el.time.parentElement, run.time < 30 && !run.over ? 'warn' : '', 'className');
    this.set('score', this.el.score, run.score.toLocaleString('en-US'));
    CONSTELLATIONS.forEach((C, c) => {
      const lit = run.lit[c];
      const n = lit.filter(Boolean).length;
      const key = `c${c}`;
      const val = `${n}/${lit.length}`;
      if (this.cache[key] !== val) {
        this.cache[key] = val;
        const dots = this.constEls[c].querySelector('.dots');
        dots.innerHTML = lit.map((l) => `<i class="${l ? 'on' : ''}"></i>`).join('');
        this.constEls[c].classList.toggle('done', run.completed[c]);
      }
    });
    this.set('lan', this.el.lanterns, `月灯 ${s.lanterns}/${s.lanternTotal}`);
    // combo
    if (run.combo >= 3) {
      this.set('combo', this.el.combo, `×${run.mult.toFixed(1)}  ·  ${run.combo} 连`);
      this.el.combo.style.opacity = String(Math.min(1, run.comboTimer / 0.6));
    } else this.el.combo.style.opacity = '0';
    // prompt
    this.set('prompt', this.el.prompt, s.prompt || '');
    this.set('promptCls', this.el.prompt, s.promptBad ? 'bad' : '', 'className');
    // edge warning
    this.el.edge.style.opacity = String(s.edge01.toFixed(2));
    // timers
    if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT <= 0) this.el.hint.classList.remove('on');
    }
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.el.banner.classList.remove('on');
    }
  }

  /** Place an off-screen/on-screen indicator for a world target. */
  indicator(el, camera, target, label, w, h, labelEl) {
    if (!target) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    const v = this.v.copy(target).applyMatrix4(camera.matrixWorldInverse);
    const inFront = v.z < 0;
    let sx = 0;
    let sy = 0;
    let onScreen = false;
    if (inFront) {
      const p = this.v.copy(target).project(camera);
      sx = p.x;
      sy = p.y;
      onScreen = Math.abs(sx) < 0.88 && Math.abs(sy) < 0.84;
    }
    let x;
    let y;
    let ang;
    if (onScreen) {
      x = (sx * 0.5 + 0.5) * w;
      y = (-sy * 0.5 + 0.5) * h;
      ang = Math.PI / 2;
      el.classList.add('onscreen');
    } else {
      const cam = this.v.copy(target).applyMatrix4(camera.matrixWorldInverse);
      ang = Math.atan2(cam.y, cam.x);
      const rx = w * 0.42;
      const ry = h * 0.4;
      x = w / 2 + Math.cos(ang) * rx;
      y = h / 2 - Math.sin(ang) * ry;
      el.classList.remove('onscreen');
    }
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    const arrow = el.querySelector('.arrow');
    if (arrow) arrow.style.transform = `translate(-50%,-50%) rotate(${(-ang + Math.PI / 2).toFixed(3)}rad)`;
    if (labelEl && labelEl.textContent !== label) labelEl.textContent = label;
  }
}
