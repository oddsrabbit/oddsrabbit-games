// The three backdrops, chosen on 2026-11-16 from the mocks in
// dev/style-mocks/scenes.html and switchable in the menu: a glass jar, a bath
// and a night sky. Each scene draws two still layers, cached by game.js and
// redrawn only on resize or a scene change:
//   back(x, v):  the background (screen space) and the inside of the box
//   front(x, v): the box's walls and floor, drawn over the bubbles
// The box's inside always matches the physics: walls at x 0 and W, floor at FLOOR.
// `v` carries the layout: { w, h, s, ox, oy, d, W, RIM, FLOOR, WALL, x0, x1 }.
(function () {
  const RM = (window.RM = window.RM || {});

  const screen = (x, v) => x.setTransform(v.d, 0, 0, v.d, 0, 0);
  const world = (x, v) => x.setTransform(v.d * v.s, 0, 0, v.d * v.s, v.d * v.ox, v.d * v.oy);
  function rr(x, X, Y, w, h, r) { x.beginPath(); x.roundRect(X, Y, w, h, r); }

  const SCENES = {
    jar: {
      name: 'Glass jar',
      field: '#EDE3F6',
      rim: 'rgba(120, 100, 160, 0.4)',
      guide: 'rgba(120, 100, 160, 0.28)',
      label: '#6E6385', // the NEXT label over the preview
      back(x, v) {
        const { W, RIM, FLOOR } = v;
        screen(x, v);
        const g = x.createLinearGradient(0, 0, 0, v.h);
        g.addColorStop(0, '#FBE3EE'); g.addColorStop(0.55, '#E9E1F8'); g.addColorStop(1, '#D9E7FB');
        x.fillStyle = g; x.fillRect(0, 0, v.w, v.h);
        for (const [bx, by, br, a] of [[0.12, 0.08, 40, 0.35], [0.85, 0.15, 55, 0.3], [0.5, 0.04, 26, 0.4], [0.92, 0.55, 34, 0.25], [0.05, 0.6, 46, 0.25]]) {
          x.fillStyle = `rgba(255,255,255,${a})`;
          x.beginPath(); x.arc(bx * v.w, by * v.h, br, 0, Math.PI * 2); x.fill();
        }
        world(x, v);
        x.fillStyle = '#E8D3C0'; x.fillRect(v.x0 - 400, FLOOR + 10, W + 800, 200); // the table
        x.fillStyle = 'rgba(255,255,255,0.32)';
        rr(x, -10, RIM - 18, W + 20, FLOOR - RIM + 30, [6, 6, 26, 26]); x.fill();
      },
      front(x, v) {
        const { W, RIM, FLOOR } = v, px = 1 / v.s;
        world(x, v);
        x.strokeStyle = 'rgba(255,255,255,0.95)'; x.lineWidth = 6 * px;
        rr(x, -7, RIM - 15, W + 14, FLOOR - RIM + 24, [4, 4, 24, 24]); x.stroke();
        x.strokeStyle = 'rgba(140,150,200,0.45)'; x.lineWidth = 2 * px;
        rr(x, -11, RIM - 19, W + 22, FLOOR - RIM + 32, [6, 6, 28, 28]); x.stroke();
        // reflections down the walls
        x.fillStyle = 'rgba(255,255,255,0.55)';
        rr(x, 6, RIM + 20, 7, FLOOR - RIM - 80, 4); x.fill();
        rr(x, 18, RIM + 40, 3, FLOOR - RIM - 180, 2); x.fill();
        rr(x, W - 14, RIM + 60, 5, FLOOR - RIM - 160, 3); x.fill();
        // the thick glass bottom and the jar's lip at the rim
        x.fillStyle = 'rgba(255,255,255,0.45)'; rr(x, -6, FLOOR, W + 12, 10, [0, 0, 20, 20]); x.fill();
        x.fillStyle = 'rgba(255,255,255,0.9)'; x.strokeStyle = 'rgba(140,150,200,0.6)'; x.lineWidth = 2 * px;
        rr(x, -16, RIM - 26, W + 32, 14, 7); x.fill(); x.stroke();
      },
    },

    bath: {
      name: 'Bath time',
      field: '#DDF1EE',
      rim: 'rgba(70, 130, 150, 0.4)',
      guide: 'rgba(70, 130, 150, 0.28)',
      label: '#3E6E7C',
      back(x, v) {
        const { W, RIM, FLOOR } = v, px = 1 / v.s;
        screen(x, v);
        x.fillStyle = '#DDF1EE'; x.fillRect(0, 0, v.w, v.h);
        x.strokeStyle = '#FFFFFF'; x.lineWidth = 2;
        const T = 34;
        for (let X = -2; X < v.w; X += T) { x.beginPath(); x.moveTo(X, 0); x.lineTo(X, v.h); x.stroke(); }
        for (let Y = 0; Y < v.h; Y += T) { x.beginPath(); x.moveTo(0, Y); x.lineTo(v.w, Y); x.stroke(); }
        world(x, v);
        x.fillStyle = '#F4FBFC'; x.fillRect(0, RIM - 4, W, FLOOR - RIM + 4);
        const top = RIM + 120;
        const wg = x.createLinearGradient(0, top, 0, FLOOR);
        wg.addColorStop(0, 'rgba(140,210,235,0)'); wg.addColorStop(0.08, 'rgba(140,210,235,0.35)'); wg.addColorStop(1, 'rgba(110,190,225,0.45)');
        x.fillStyle = wg; x.fillRect(0, top, W, FLOOR - top);
        x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineWidth = 3 * px;
        x.beginPath(); for (let X = 0; X <= W; X += 4) x.lineTo(X, top + 9 + Math.sin(X / 18) * 3); x.stroke();
      },
      front(x, v) {
        const { W, RIM, FLOOR, WALL } = v, px = 1 / v.s;
        world(x, v);
        const enamel = (X, Y, w, h, r) => {
          const eg = x.createLinearGradient(X, 0, X + w, 0); eg.addColorStop(0, '#FFFFFF'); eg.addColorStop(1, '#E3ECEF');
          x.fillStyle = eg; rr(x, X, Y, w, h, r); x.fill();
          x.strokeStyle = '#9FB8C0'; x.lineWidth = 3 * px; x.stroke();
        };
        enamel(-WALL, RIM - 6, WALL, FLOOR - RIM + 6 + WALL, [0, 0, 0, 14]);
        enamel(W, RIM - 6, WALL, FLOOR - RIM + 6 + WALL, [0, 0, 14, 0]);
        enamel(-WALL, FLOOR, W + 2 * WALL, WALL, [0, 0, 14, 14]);
        enamel(-WALL - 8, RIM - 18, WALL + 14, 16, 8);
        enamel(W - 6, RIM - 18, WALL + 14, 16, 8);
        x.fillStyle = '#C9D6DA'; x.strokeStyle = '#9FB8C0';
        for (const fx of [10, W - 40]) { rr(x, fx, FLOOR + WALL, 30, 10, [0, 0, 8, 8]); x.fill(); x.stroke(); }
        // a rubber rabbit on the right rim
        x.save(); x.translate(W - 6, RIM - 34); x.scale(-1.5, 1.5);
        x.fillStyle = '#F7A8C0'; x.strokeStyle = '#B5577A'; x.lineWidth = 2 * px;
        x.beginPath(); x.ellipse(0, 0, 12, 10, 0, 0, Math.PI * 2); x.fill(); x.stroke();
        x.beginPath(); x.ellipse(6, -10, 8, 7, 0, 0, Math.PI * 2); x.fill(); x.stroke();
        for (const ex of [3, 9]) { x.beginPath(); x.ellipse(ex, -22, 2.6, 7, ex === 3 ? -0.2 : 0.2, 0, Math.PI * 2); x.fill(); x.stroke(); }
        x.fillStyle = '#3B2922'; x.beginPath(); x.arc(9, -11, 1.4, 0, Math.PI * 2); x.fill();
        x.restore();
      },
    },

    night: {
      name: 'Night sky',
      field: '#1C2148',
      rim: 'rgba(255, 220, 240, 0.55)',
      guide: 'rgba(255, 255, 255, 0.28)',
      label: 'rgba(255, 230, 245, 0.85)',
      dark: true,
      back(x, v) {
        const { W, RIM, FLOOR } = v;
        screen(x, v);
        const g = x.createLinearGradient(0, 0, 0, v.h);
        g.addColorStop(0, '#141A3A'); g.addColorStop(1, '#2C2758');
        x.fillStyle = g; x.fillRect(0, 0, v.w, v.h);
        let seed = 5;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        const n = Math.round((v.w * v.h) / 3600);
        for (let i = 0; i < n; i++) {
          x.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.6})`;
          x.beginPath(); x.arc(rnd() * v.w, rnd() * v.h, rnd() < 0.15 ? 1.6 : 0.8, 0, Math.PI * 2); x.fill();
        }
        // Up in the sky, clear of the HUD pills and of where bubbles are dropped.
        const mx = v.w * 0.8, my = Math.max(150, v.oy * 0.55);
        x.fillStyle = '#FFF4C8'; x.beginPath(); x.arc(mx, my, 18, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#161C3E'; x.beginPath(); x.arc(mx + 8, my - 6, 16, 0, Math.PI * 2); x.fill();
        world(x, v);
        x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(0, RIM, W, FLOOR - RIM);
      },
      front(x, v) {
        const { W, RIM, FLOOR } = v, px = 1 / v.s;
        world(x, v);
        x.save();
        x.shadowColor = 'rgba(120,220,255,0.9)'; x.shadowBlur = 12 * v.d;
        x.strokeStyle = '#9FE8FF'; x.lineWidth = 4 * px; x.lineJoin = 'round';
        x.beginPath(); x.moveTo(-3, RIM - 12); x.lineTo(-3, FLOOR + 3); x.lineTo(W + 3, FLOOR + 3); x.lineTo(W + 3, RIM - 12); x.stroke();
        x.restore();
      },
    },
  };

  RM.SCENES = SCENES;
  RM.SCENE_ORDER = ['jar', 'bath', 'night'];
})();
