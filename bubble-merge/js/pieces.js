// The eleven pieces, smallest to largest: soap bubbles, one colour per size
// around the colour wheel from red to pink, so the order is easy to learn.
// Each bubble is exactly its physics circle. Chosen on 2026-11-16 from the
// style mocks (dev/style-mocks/bubbles.html, "soap").
(function () {
  const RM = (window.RM = window.RM || {});

  // r: radius in world units (the pen is 400 wide).
  const PIECES = [
    { name: 'Red', hex: 'F25555', r: 17 },
    { name: 'Orange', hex: 'FF9838', r: 23 },
    { name: 'Yellow', hex: 'FFD23F', r: 30 },
    { name: 'Lime', hex: 'A6DD4A', r: 36 },
    { name: 'Green', hex: '45C46E', r: 44 },
    { name: 'Teal', hex: '2EC4B6', r: 53 },
    { name: 'Sky', hex: '4FB6F2', r: 62 },
    { name: 'Blue', hex: '4A78EE', r: 72 },
    { name: 'Indigo', hex: '6A5CE0', r: 84 },
    { name: 'Purple', hex: 'A45EE0', r: 98 },
    { name: 'Pink', hex: 'F06AB8', r: 116 },
  ];
  for (const p of PIECES) {
    const n = parseInt(p.hex, 16);
    p.rgb = [n >> 16, (n >> 8) & 255, n & 255];
    p.css = '#' + p.hex;
  }

  // Points for making each size: triangular numbers. Two of the biggest
  // meeting pop for GIANT_BONUS.
  const POINTS = PIECES.map((_, i) => ((i + 1) * (i + 2)) / 2);
  const GIANT_BONUS = 100;

  const DARK = [30, 24, 40];
  const mix = (c, t, w) => c.map((v, i) => Math.round(v + (t[i] - v) * w));
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  /**
   * A soap bubble of radius R centred on the origin: nearly clear, the colour
   * gathering at the edge, a rainbow sheen on the rim, two window reflections
   * at the top left and light caught on the inside of the bottom right.
   * The light is fixed to the screen, so bubbles are drawn upright.
   */
  function drawPiece(x, tier, R) {
    const c = PIECES[tier].rgb;
    x.save();
    x.beginPath();
    x.arc(0, 0, R, 0, Math.PI * 2);
    x.fillStyle = rgba(c, 0.14);
    x.fill();
    const edge = x.createRadialGradient(0, 0, R * 0.62, 0, 0, R);
    edge.addColorStop(0, rgba(c, 0));
    edge.addColorStop(0.8, rgba(c, 0.45));
    edge.addColorStop(1, rgba(c, 0.85));
    x.fillStyle = edge;
    x.fill();
    if (x.createConicGradient) {
      const cg = x.createConicGradient(0.6, 0, 0);
      ['rgba(255,120,200,0.35)', 'rgba(255,230,120,0.3)', 'rgba(120,240,200,0.3)', 'rgba(120,170,255,0.35)', 'rgba(255,120,200,0.35)']
        .forEach((s, i, a) => cg.addColorStop(i / (a.length - 1), s));
      x.beginPath();
      x.arc(0, 0, R * 0.94, 0, Math.PI * 2);
      x.strokeStyle = cg;
      x.lineWidth = R * 0.1;
      x.stroke();
    }
    // Two window reflections.
    x.save();
    x.translate(-0.4 * R, -0.42 * R);
    x.rotate(-0.7);
    x.fillStyle = 'rgba(255,255,255,0.85)';
    x.beginPath(); x.roundRect(-0.16 * R, -0.07 * R, 0.32 * R, 0.14 * R, 0.05 * R); x.fill();
    x.beginPath(); x.roundRect(-0.1 * R, 0.11 * R, 0.2 * R, 0.08 * R, 0.03 * R); x.fill();
    x.restore();
    // Light caught on the far inside edge.
    x.beginPath();
    x.arc(0, 0, R * 0.82, 0.15, 1.35);
    x.strokeStyle = 'rgba(255,255,255,0.5)';
    x.lineWidth = R * 0.07;
    x.lineCap = 'round';
    x.stroke();
    // The rim.
    x.beginPath();
    x.arc(0, 0, R - 1, 0, Math.PI * 2);
    x.strokeStyle = rgba(mix(c, DARK, 0.2), 0.7);
    x.lineWidth = Math.max(1.2, R * 0.022);
    x.stroke();
    x.restore();
  }

  // Sprites are drawn once per (piece, pixel radius) and blitted.
  const MARGIN = 2; // px around the bubble
  const cache = new Map();
  function sprite(tier, pxR) {
    const px = Math.max(4, Math.round(pxR));
    const key = tier + ':' + px;
    let c = cache.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = 2 * (px + MARGIN);
      const x = c.getContext('2d');
      x.translate(c.width / 2, c.height / 2);
      drawPiece(x, tier, px);
      if (cache.size > 200) cache.clear();
      cache.set(key, c);
    }
    return c;
  }

  RM.PIECES = PIECES;
  RM.POINTS = POINTS;
  RM.GIANT_BONUS = GIANT_BONUS;
  RM.drawPiece = drawPiece;
  RM.sprite = sprite;
  RM.clearSprites = () => cache.clear();
})();
