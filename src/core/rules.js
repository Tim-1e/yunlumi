// Pure game rules: light economy, combo, scoring, constellation progress, timer, upgrades.

export const RULES = {
  nightSeconds: 240,
  bonusSecondsPerConstellation: 30,
  igniteCost: 8,
  maxLight: 999,
  comboWindow: 1.7,
  stealFraction: 0.25,
  stealMin: 4,
  pulseCost: 4,
  moteScore: 10,
  ringScore: 60,
  igniteScore: 300,
  constellationScore: 2000,
  gloomScore: 180,
  shootingStarScore: 1200,
  shootingStarLight: 20,
  lanternScore: 600,
  lanternLight: 15,
  timeBonusPerSecond: 25,
};

export const UPGRADE_EFFECTS = {
  magnet: (u) => {
    u.magnet *= 1.6;
  },
  pulse: (u) => {
    u.pulseRadius *= 1.5;
    u.pulseCost *= 0.5;
  },
  lucky: (u) => {
    u.moteValue = 2;
  },
  wing: (u) => {
    u.boostMax *= 1.6;
    u.boostRegen *= 1.5;
  },
  bloom: (u) => {
    u.dashCooldown *= 0.5;
    u.comboWindow *= 1.4;
  },
};

export function baseUpgrades() {
  return {
    magnet: 1,
    pulseRadius: 1,
    pulseCost: 1,
    moteValue: 1,
    boostMax: 1,
    boostRegen: 1,
    dashCooldown: 1,
    comboWindow: 1,
  };
}

export class Run {
  /**
   * @param {number[]} sizes number of stars per constellation
   * @param {string[]} upgradeKeys upgrade key per constellation
   */
  constructor(sizes, upgradeKeys, rules = RULES) {
    this.rules = rules;
    this.time = rules.nightSeconds;
    this.elapsed = 0;
    this.light = 0;
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.maxCombo = 0;
    this.lit = sizes.map((n) => new Array(n).fill(false));
    this.completed = sizes.map(() => false);
    this.upgradeKeys = upgradeKeys;
    this.upgrades = baseUpgrades();
    this.over = false;
    this.won = false;
    this.timeBonus = 0;
    this.stats = { motes: 0, rings: 0, gloom: 0, stars: 0, shooting: 0, stolen: 0, lanterns: 0 };
  }

  get mult() {
    return Math.min(5, 1 + Math.floor(this.combo / 8) * 0.5);
  }

  get completedCount() {
    return this.completed.reduce((s, c) => s + (c ? 1 : 0), 0);
  }

  get litCount() {
    return this.lit.reduce((s, arr) => s + arr.filter(Boolean).length, 0);
  }

  get totalStars() {
    return this.lit.reduce((s, arr) => s + arr.length, 0);
  }

  get pulseCost() {
    return Math.max(1, Math.ceil(this.rules.pulseCost * this.upgrades.pulseCost));
  }

  bumpCombo(n = 1) {
    this.combo += n;
    this.comboTimer = this.rules.comboWindow * this.upgrades.comboWindow;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
  }

  addLight(n) {
    this.light = Math.min(this.rules.maxLight, this.light + n);
  }

  collectMote() {
    if (this.over) return 0;
    this.addLight(this.upgrades.moteValue);
    this.bumpCombo(1);
    const pts = Math.round(this.rules.moteScore * this.mult);
    this.score += pts;
    this.stats.motes++;
    return pts;
  }

  passRing() {
    if (this.over) return 0;
    this.bumpCombo(3);
    const pts = Math.round(this.rules.ringScore * this.mult);
    this.score += pts;
    this.stats.rings++;
    return pts;
  }

  /** Try to ignite star n of constellation c. */
  tryIgnite(c, n) {
    if (this.over) return { ok: false, reason: 'over' };
    if (this.lit[c][n]) return { ok: false, reason: 'lit' };
    const cost = this.rules.igniteCost;
    if (this.light < cost) return { ok: false, reason: 'light', need: cost - this.light };
    this.light -= cost;
    this.lit[c][n] = true;
    this.score += Math.round(this.rules.igniteScore * this.mult);
    this.bumpCombo(2);
    this.stats.stars++;
    let completed = false;
    let allDone = false;
    if (this.lit[c].every(Boolean)) {
      completed = true;
      this.completed[c] = true;
      this.time += this.rules.bonusSecondsPerConstellation;
      this.score += this.rules.constellationScore;
      const fx = UPGRADE_EFFECTS[this.upgradeKeys[c]];
      if (fx) fx(this.upgrades);
      if (this.completed.every(Boolean)) {
        allDone = true;
        this.won = true;
        this.over = true;
        this.timeBonus = Math.round(this.time * this.rules.timeBonusPerSecond);
        this.score += this.timeBonus;
      }
    }
    return { ok: true, completed, allDone };
  }

  /** A gloom touched the player: lose a chunk of light. Returns amount stolen. */
  steal() {
    if (this.over) return 0;
    const want = Math.max(this.rules.stealMin, Math.ceil(this.light * this.rules.stealFraction));
    const amt = Math.min(this.light, want);
    this.light -= amt;
    this.combo = 0;
    this.comboTimer = 0;
    this.stats.stolen += amt;
    return amt;
  }

  trySpendPulse() {
    if (this.over) return false;
    const c = this.pulseCost;
    if (this.light < c) return false;
    this.light -= c;
    return true;
  }

  killGloom() {
    if (this.over) return 0;
    this.bumpCombo(2);
    const pts = Math.round(this.rules.gloomScore * this.mult);
    this.score += pts;
    this.stats.gloom++;
    return pts;
  }

  catchShootingStar() {
    if (this.over) return 0;
    this.addLight(this.rules.shootingStarLight);
    this.bumpCombo(5);
    this.score += this.rules.shootingStarScore;
    this.stats.shooting++;
    return this.rules.shootingStarScore;
  }

  findLantern() {
    if (this.over) return 0;
    this.addLight(this.rules.lanternLight);
    this.score += this.rules.lanternScore;
    this.stats.lanterns++;
    return this.rules.lanternScore;
  }

  /** Advance time. Returns 'dawn' exactly once when night ends. */
  tick(dt) {
    if (this.over) return null;
    this.elapsed += dt;
    this.time -= dt;
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboTimer = 0;
        this.combo = 0;
      }
    }
    if (this.time <= 0) {
      this.time = 0;
      this.over = true;
      this.won = false;
      return 'dawn';
    }
    return null;
  }

  rank() {
    const s = this.score;
    if (this.won && s >= 42000) return 'S';
    if (this.won) return 'A';
    if (this.completedCount >= 3) return 'B';
    if (this.completedCount >= 1) return 'C';
    return 'D';
  }
}
