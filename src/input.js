// Keyboard + mouse input with pointer-lock support and a graceful fallback.

const BLOCK_DEFAULT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

export class Input {
  constructor(target) {
    this.target = target;
    this.keys = new Set();
    this.mdx = 0;
    this.mdy = 0;
    this.triggers = []; // 'pulse' | 'dash'
    this.pressed = []; // raw key codes pressed this frame (for UI)
    this.locked = false;
    this.lockFailed = false;
    this.mouseHeld = [false, false, false];

    window.addEventListener('keydown', (e) => {
      if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.push(e.code);
      this.keys.add(e.code);
      if (!e.repeat) {
        if (e.code === 'KeyE' || e.code === 'KeyF') this.triggers.push('pulse');
        if (e.code === 'KeyQ') this.triggers.push('dash');
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseHeld = [false, false, false];
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked && !this.lockFailed) return;
      let dx = e.movementX || 0;
      let dy = e.movementY || 0;
      // Some browsers emit huge spikes right after locking; clamp them.
      dx = Math.max(-250, Math.min(250, dx));
      dy = Math.max(-250, Math.min(250, dy));
      this.mdx += dx;
      this.mdy += dy;
    });
    target.addEventListener('mousedown', (e) => {
      if (!this.locked && !this.lockFailed) return;
      this.mouseHeld[e.button] = true;
      if (e.button === 0) this.triggers.push('pulse');
      if (e.button === 2) this.triggers.push('dash');
    });
    window.addEventListener('mouseup', (e) => {
      this.mouseHeld[e.button] = false;
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.target;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {
      if (this.onLockError) this.onLockError();
    });
  }

  get pointerLockSupported() {
    return 'pointerLockElement' in document && typeof this.target.requestPointerLock === 'function';
  }

  requestLock() {
    if (!this.pointerLockSupported) {
      this.lockFailed = true;
      return;
    }
    try {
      const p = this.target.requestPointerLock();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          // Chrome refuses re-lock for ~1s after Esc; the pause overlay simply asks for another click.
          // (pointerlockerror is also dispatched, which calls onLockError.)
        });
      }
    } catch (e) {
      this.lockFailed = true;
      if (this.onLockError) this.onLockError();
    }
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  axis() {
    const k = this.keys;
    return {
      f: k.has('KeyW') || k.has('ArrowUp') ? 1 : 0,
      b: k.has('KeyS') || k.has('ArrowDown') ? 1 : 0,
      l: k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0,
      r: k.has('KeyD') || k.has('ArrowRight') ? 1 : 0,
      u: k.has('Space') ? 1 : 0,
      d: k.has('KeyC') || k.has('KeyZ') ? 1 : 0,
      boost: k.has('ShiftLeft') || k.has('ShiftRight'),
    };
  }

  consumeMouse() {
    const r = { dx: this.mdx, dy: this.mdy };
    this.mdx = 0;
    this.mdy = 0;
    return r;
  }

  consumeTriggers() {
    const t = this.triggers;
    this.triggers = [];
    return t;
  }

  consumePressed() {
    const p = this.pressed;
    this.pressed = [];
    return p;
  }

  clear() {
    this.mdx = this.mdy = 0;
    this.triggers = [];
    this.pressed = [];
  }
}
