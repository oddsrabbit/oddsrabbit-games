// Garden lab: the garden strip drawn from art/garden.ts and garden.ts at 4x,
// for checking the art and the spots before the garden room is built
// (docs/rabbit-pets-garden.md, stage 1). Built by `npm run build` into
// dist/dev/garden-lab.js, which dev/garden-lab.html loads. Not shipped.

import { drawField, drawFirefly, drawGarden, drawGardenShade, drawSpot, drawTag } from '../src/art/garden';
import { drawItem } from '../src/art/items';
import { drawRabbit } from '../src/art/rabbit';
import type { PixelGrid } from '../src/art/pixels';
import { plotOffer, plotUpgrade, stage, type CropId } from '../src/extras';
import { AREA_W, FIELD, gardenView, GROUND, hitBox, hitTest, STRIP_H, STRIP_W, type GardenThing } from '../src/garden';
import { newPet, type PetState } from '../src/sim';
import { HOUR_MS } from '../src/tuning';
import type { Season, Weather } from '../src/world';
import type { BuildingId } from '../src/yard';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const NOW = Date.UTC(2026, 8, 24, 12, 0);
const SIZE: Record<BuildingId | 'shed', { w: number; h: number }> = { patch: { w: 11, h: 5 }, hive: { w: 8, h: 9 }, log: { w: 12, h: 8 }, shed: { w: 12, h: 10 } };

function preset(name: string): PetState {
  const s = newPet('lab', 'Clover', 'snow', NOW, 'UTC', 'long');
  const plot = (crop: CropId, doneFrac: number, hours: number) => ({ crop, plantedAtMs: NOW - doneFrac * hours * HOUR_MS, readyAtMs: NOW + (1 - doneFrac) * hours * HOUR_MS });
  if (name === 'new') { s.yard = { counts: { patch: 1 }, sheds: 0, stored: 2, atMs: NOW }; return s; }
  if (name === 'mid') {
    s.upgrades = ['plot2', 'plot3'];
    s.garden = { plots: [plot('berry', 1, 8), plot('golden', 0.45, 12), null] };
    s.yard = { counts: { patch: 5, hive: 2 }, sheds: 0, stored: 43, atMs: NOW };
    return s;
  }
  s.upgrades = ['plot2', 'plot3', 'plot4', 'plot5', 'can'];
  s.garden = { plots: [plot('berry', 1, 8), plot('golden', 0.8, 12), plot('sprout', 0.1, 4), plot('berry', 0.5, 8), plot('golden', 1, 12)] };
  s.yard = { counts: { patch: 10, hive: 5, log: 3 }, sheds: 2, stored: 400, atMs: NOW };
  return s;
}

function put(g: PixelGrid, s: PixelGrid, cx: number, by: number): void {
  const x0 = Math.round(cx - s.w / 2), y0 = by - s.h;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const p = s.px[y]![x]!;
    if (!p[3] || x0 + x < 0 || y0 + y < 0 || x0 + x >= g.w || y0 + y >= g.h) continue;
    const a = p[3] / 255, q = g.px[y0 + y]![x0 + x]!;
    g.px[y0 + y]![x0 + x] = [Math.round(q[0] + (p[0] - q[0]) * a), Math.round(q[1] + (p[1] - q[1]) * a), Math.round(q[2] + (p[2] - q[2]) * a), 255];
  }
}

function spriteFor(pet: PetState, t: GardenThing, season: Season): PixelGrid | null {
  if (t.kind === 'plot') {
    if (t.state === 'locked') return drawSpot(FIELD.w, FIELD.h, plotOffer(pet, t.index) !== 'next', season === 'winter');
    const p = pet.garden?.plots?.[t.index] ?? null;
    return drawField(season, p?.crop ?? null, p ? stage(p, NOW) : 0);
  }
  const id = t.kind === 'shed' ? 'shed' : t.id;
  if (t.state === 'owned') return drawItem(id);
  return drawSpot(Math.max(SIZE[id].w, 9), Math.max(SIZE[id].h, 7), t.state === 'locked', season === 'winter');
}

function draw(): void {
  const season = $<HTMLSelectElement>('season').value as Season;
  const weather = $<HTMLSelectElement>('weather').value as Weather;
  const night = $<HTMLInputElement>('night').checked;
  const phaseOn = $<HTMLInputElement>('moon').checked;
  const phase = phaseOn ? Number($<HTMLInputElement>('phase').value) / 100 : null;
  const pet = preset($<HTMLSelectElement>('preset').value);
  const g = drawGarden(season, weather, night, phase);
  for (const t of gardenView(pet, NOW)) {
    const s = spriteFor(pet, t, season);
    if (s) put(g, s, t.spot.x, t.spot.y);
    // the next field for sale carries its price
    const price = t.kind === 'plot' && plotOffer(pet, t.index) === 'next' ? plotUpgrade(t.index)?.price : undefined;
    if (price !== undefined) put(g, drawTag(String(price), true, pet.clover >= price), t.spot.x, t.spot.y);
  }
  put(g, drawRabbit('snow', night ? 'asleep' : 'content', 0, { ears: 'long', neck: 'bandana' }), 80, STRIP_H);
  if (night) {
    // the renderer's night pass: multiply the shade over the ground, then fireflies
    const shade = drawGardenShade(season, weather, [0x62, 0x60, 0x8e, 255]);
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const t = shade.px[y]![x]!, p = g.px[y]![x]!;
      if (t[3]) g.px[y]![x] = [Math.round(p[0] * t[0] / 255), Math.round(p[1] * t[1] / 255), Math.round(p[2] * t[2] / 255), 255];
    }
    for (const [x, y, f] of [[30, 72, 0], [84, 90, 1], [14, 100, 0], [140, 84, 0], [170, 100, 1], [220, 76, 0], [258, 90, 1]] as const) put(g, drawFirefly(f), x, y);
  }

  const scale = Number($<HTMLSelectElement>('scale').value);
  const c = $<HTMLCanvasElement>('strip');
  c.width = STRIP_W * scale; c.height = STRIP_H * scale;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(STRIP_W, STRIP_H);
  g.px.forEach((row, y) => row.forEach((p, x) => { const o = (y * STRIP_W + x) * 4; img.data.set([p[0], p[1], p[2], 255], o); }));
  const tmp = document.createElement('canvas'); tmp.width = STRIP_W; tmp.height = STRIP_H;
  tmp.getContext('2d')!.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, 0, 0, c.width, c.height);

  if ($<HTMLInputElement>('areas').checked) {
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    for (let a = 1; a < 3; a++) ctx.fillRect(a * AREA_W * scale, 0, 2, c.height);
    ctx.fillStyle = 'rgba(255,80,80,.35)';
    ctx.fillRect(0, GROUND.pathY * scale, c.width, GROUND.pathH * scale);
  }
  if ($<HTMLInputElement>('hits').checked) {
    ctx.strokeStyle = '#f6d24a'; ctx.lineWidth = 2;
    for (const t of gardenView(pet, NOW)) {
      const b = hitBox(t.kind === 'building' ? t.id : t.kind, t.spot);
      ctx.strokeRect(b.x * scale + 1, b.y * scale + 1, b.w * scale - 2, b.h * scale - 2);
    }
  }
  c.onclick = (e) => {
    const r = c.getBoundingClientRect();
    const x = (e.clientX - r.left) / scale, y = (e.clientY - r.top) / scale;
    const hit = hitTest(pet, x, y, NOW);
    $('hit').textContent = `(${x.toFixed(0)}, ${y.toFixed(0)}) → ` + (hit ? JSON.stringify({ ...hit, spot: undefined }) : 'nothing');
  };
  $('phase-out').textContent = phaseOn ? String(phase) : 'crescent';
}

for (const id of ['season', 'weather', 'night', 'moon', 'phase', 'preset', 'scale', 'hits', 'areas']) $(id).addEventListener('input', draw);
draw();
