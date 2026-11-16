// Rolling-ball physics for the pen: circles under gravity, an open-topped box,
// sequential impulses with friction (so balls roll and spin rather than
// slide), then a positional pass that pushes overlaps apart. No dependencies.
//
// Coordinates are world units, y down. The pen's inside runs x 0..w, and its
// floor is at y = floor. The walls go up forever, so nothing escapes over them.
(function () {
  const RM = (window.RM = window.RM || {});

  const GRAVITY = 1500;
  const SUBSTEPS = 4;
  const ITERATIONS = 8;
  const FRICTION = 0.45;
  const WALL_FRICTION = 0.3;
  const BOUNCE = 0.12;
  const MAX_SPEED = 2400;
  /** Bodies this close count as touching, so resting contacts hold. */
  const SKIN = 1;

  class World {
    constructor(w, floor) {
      this.w = w;
      this.floor = floor;
      this.bodies = [];
      this.nextId = 1;
      /** Pairs of same-breed bodies that touched this step, for the game to merge. */
      this.touching = [];
    }

    add(tier, x, y, r, opts) {
      // A ball resting exactly on top of another is balanced like a marble on
      // a marble: real physics topples it at the slightest nudge, but ours is
      // exact, so bubbles dropped at the same x stacked into a tower. A random
      // nudge far below a pixel gives the instability something to grow from.
      x += (Math.random() - 0.5) * 0.6;
      const b = {
        id: this.nextId++, tier, x, y, vx: 0, vy: 0, a: 0, w: 0,
        r: opts && opts.r0 != null ? opts.r0 : r, rTarget: r,
        age: 0, gone: false,
      };
      this.setMass(b);
      if (opts) Object.assign(b, opts.extra || {});
      this.bodies.push(b);
      return b;
    }

    setMass(b) {
      const m = b.rTarget * b.rTarget;
      b.im = 1 / m;
      b.iI = 2 / (m * b.rTarget * b.rTarget);
    }

    remove(b) {
      b.gone = true;
      this.bodies = this.bodies.filter((o) => o !== b);
    }

    step(dt) {
      this.touching.length = 0;
      const h = dt / SUBSTEPS;
      for (let s = 0; s < SUBSTEPS; s++) this.substep(h);
    }

    substep(h) {
      const bs = this.bodies;
      const n = bs.length;
      // Grow freshly merged rabbits toward full size.
      for (const b of bs) {
        if (b.r < b.rTarget) b.r = Math.min(b.rTarget, b.r + (b.rTarget - b.r) * Math.min(1, h * 14) + 6 * h);
        b.vy += GRAVITY * h;
        b.age += h;
      }

      // Contacts.
      const contacts = [];
      for (let i = 0; i < n; i++) {
        const a = bs[i];
        if (a.x - a.r < SKIN) contacts.push({ a, b: null, nx: -1, ny: 0, jn: 0, jt: 0, bias: bounce(-a.vx) });
        if (a.x + a.r > this.w - SKIN) contacts.push({ a, b: null, nx: 1, ny: 0, jn: 0, jt: 0, bias: bounce(a.vx) });
        if (a.y + a.r > this.floor - SKIN) contacts.push({ a, b: null, nx: 0, ny: 1, jn: 0, jt: 0, bias: bounce(a.vy) });
        for (let j = i + 1; j < n; j++) {
          const b = bs[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const rr = a.r + b.r + SKIN;
          const d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr) continue;
          const d = Math.sqrt(d2) || 0.0001;
          const nx = dx / d, ny = dy / d;
          if (a.tier === b.tier) this.touching.push([a, b]);
          const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          contacts.push({ a, b, nx, ny, jn: 0, jt: 0, bias: bounce(-vn) });
        }
      }

      // Velocities.
      for (let it = 0; it < ITERATIONS; it++) {
        for (const c of contacts) solve(c);
      }

      // Integrate, with a little air drag and rolling resistance so piles settle.
      const drag = 1 - 0.15 * h;
      const spin = 1 - 1.2 * h;
      for (const b of bs) {
        b.vx *= drag; b.vy *= drag; b.w *= spin;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > MAX_SPEED) { b.vx *= MAX_SPEED / sp; b.vy *= MAX_SPEED / sp; }
        b.x += b.vx * h;
        b.y += b.vy * h;
        b.a += b.w * h;
      }

      // Positions: push overlaps apart without touching velocities.
      for (let it = 0; it < 3; it++) {
        for (let i = 0; i < n; i++) {
          const a = bs[i];
          for (let j = i + 1; j < n; j++) {
            const b = bs[j];
            const dx = b.x - a.x, dy = b.y - a.y;
            const rr = a.r + b.r;
            const d2 = dx * dx + dy * dy;
            if (d2 >= rr * rr) continue;
            const d = Math.sqrt(d2) || 0.0001;
            const pen = rr - d - 0.25;
            if (pen <= 0) continue;
            const k = (pen * 0.45) / (a.im + b.im);
            const nx = dx / d, ny = dy / d;
            a.x -= nx * k * a.im; a.y -= ny * k * a.im;
            b.x += nx * k * b.im; b.y += ny * k * b.im;
          }
          if (a.x - a.r < 0) a.x = a.r;
          if (a.x + a.r > this.w) a.x = this.w - a.r;
          if (a.y + a.r > this.floor) a.y = this.floor - a.r;
        }
      }
    }
  }

  function bounce(vn) {
    // vn: closing speed (positive = approaching). Only real impacts bounce.
    return vn > 180 ? vn * BOUNCE : 0;
  }

  // One contact, sequential impulses with accumulated clamping. The normal
  // points from a toward b (or toward the wall). For a disc, I = m r^2 / 2, so
  // the tangential effective mass is 3/m per body.
  function solve(c) {
    const a = c.a, b = c.b;
    const nx = c.nx, ny = c.ny;
    const tx = -ny, ty = nx;
    const ia = a.im, ib = b ? b.im : 0;
    const ra = a.r, rb = b ? b.r : 0;
    const bvx = b ? b.vx : 0, bvy = b ? b.vy : 0, bw = b ? b.w : 0;

    // Normal. vn is b's velocity relative to a along n: negative is closing.
    // The target is to separate at c.bias (a small bounce on hard impacts).
    const vn = (bvx - a.vx) * nx + (bvy - a.vy) * ny;
    const jn = Math.max(c.jn + (c.bias - vn) / (ia + ib), 0);
    const dn = jn - c.jn;
    c.jn = jn;
    a.vx -= nx * dn * ia; a.vy -= ny * dn * ia;
    if (b) { b.vx += nx * dn * ib; b.vy += ny * dn * ib; }

    // Friction, against the contact points' relative sliding.
    const mu = b ? FRICTION : WALL_FRICTION;
    const vt = ((b ? b.vx : 0) - a.vx) * tx + ((b ? b.vy : 0) - a.vy) * ty - bw * rb - a.w * ra;
    const kt = 3 * ia + 3 * ib;
    let jt = c.jt - vt / kt;
    const lim = mu * c.jn;
    jt = Math.max(-lim, Math.min(lim, jt));
    const dt = jt - c.jt;
    c.jt = jt;
    a.vx -= tx * dt * ia; a.vy -= ty * dt * ia;
    a.w -= ra * dt * a.iI;
    if (b) {
      b.vx += tx * dt * ib; b.vy += ty * dt * ib;
      b.w -= rb * dt * b.iI;
    }
  }

  RM.World = World;
})();
