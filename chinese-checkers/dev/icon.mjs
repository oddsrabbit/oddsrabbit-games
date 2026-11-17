// Writes icon/icon.svg: the app icon (option I3b from the style mocks, picked
// 2026-11-17). A simplified star board, three rows to a point instead of
// four so it reads at home-screen size, at the opening of a six-player game:
// each point full of marbles in its colour, the middle holes soft dimples.
// Render icon-512.png and icon-1024.png from it with dev/icon.html in a
// browser (see README).
//
//   node dev/icon.mjs
import { writeFileSync } from 'node:fs';

const S = 512, C = S / 2, S3 = Math.sqrt(3);
const n = 3;                          // star size: 3 rows per point
const TIP = 0.41 * S;                 // centre to the tip of the star's outline
const grow = (2 * n + 1.3) / (2 * n); // outline sits this far past the tip holes
const sc = TIP / (1.5 * 2 * n) / grow;
// Point colours clockwise from the top: the game's seat colours.
const PC = { '-90': '#e0482f', '-30': '#e9b21c', '30': '#2f9e5e', '90': '#2f74d0', '150': '#8656d0', '210': '#e0559c' };

const f = (x) => x.toFixed(2);
const star = [];
for (let k = 0; k < 6; k++) {
  const ta = (90 + k * 60) * Math.PI / 180, ia = (120 + k * 60) * Math.PI / 180;
  star.push(`${f(C + TIP * Math.cos(ta))},${f(C + TIP * Math.sin(ta))}`);
  star.push(`${f(C + TIP / S3 * Math.cos(ia))},${f(C + TIP / S3 * Math.sin(ia))}`);
}
const holes = [];
for (let r = -2 * n; r <= 2 * n; r++) {
  for (let q = -2 * n; q <= 2 * n; q++) {
    const s = -q - r;
    if (!((q >= -n && r >= -n && s >= -n) || (q <= n && r <= n && s <= n))) continue;
    const x = C + sc * S3 * (q + r / 2), y = C + sc * 1.5 * r;
    const inPoint = Math.max(Math.abs(q), Math.abs(r), Math.abs(s)) > n;
    if (!inPoint) { holes.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(sc * 0.42)}" fill="#d8ba86"/>`); continue; }
    const ang = Math.atan2(y - C, x - C) * 180 / Math.PI;
    let best = -90, bd = 999;
    for (const t of [-90, -30, 30, 90, 150, 210]) {
      const d = Math.abs(((ang - t + 540) % 360) - 180);
      if (d < bd) { bd = d; best = t; }
    }
    holes.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(sc * 0.74)}" fill="${PC[best]}"/>`);
  }
}
const pts = star.join(' ');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" role="img" aria-label="A star board at the start of a six-player game, each point full of marbles in its own colour">
<rect width="${S}" height="${S}" fill="#f3efe4"/>
<polygon points="${pts}" fill="#b98a55" stroke="#b98a55" stroke-width="${f(sc * 1.5)}" stroke-linejoin="round"/>
<polygon points="${pts}" fill="#ecd6ab" stroke="#ecd6ab" stroke-width="${f(sc * 0.9)}" stroke-linejoin="round"/>
${holes.join('\n')}
</svg>
`;
writeFileSync(new URL('../icon/icon.svg', import.meta.url), svg);
console.log(`icon/icon.svg: ${holes.length} holes`);
