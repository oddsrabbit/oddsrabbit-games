// The fill picker: a card over the painting toolbar. Solid, gradient or
// pattern; a colour square and hue bar; basic swatches; favourites.
// Every change applies at once (the next tap paints with it).

import { cssFor, fillName, GRADIENTS, hexToHsv, hsvToHex, makeFill, parseFill, PATTERNS, type Fill, type FillKind, type ParsedFill } from './fills';
import { FAVS_MAX, type ColorPrefs } from './store';
import { button, el, icon } from './ui';

const BASICS = ['#e8746a', '#f2a541', '#f4d27a', '#9bcb6b', '#4fa77a', '#7fb7e6', '#3b5ba5', '#b48ce0', '#2a2230', '#ffffff'];

export interface PickerOptions {
  current: Fill;
  colors: ColorPrefs;
  onPick(fill: Fill): void;
  onFavsChange(): void;
  onEyedropper(): void;
  onClose(): void;
}

export function openPicker(host: HTMLElement, o: PickerOptions): { close(): void } {
  const fill: ParsedFill = parseFill(o.current) ?? { kind: 'solid', style: 0, a: '#7fb7e6', b: '#7fb7e6' };
  if (fill.kind === 'solid') fill.b = '#ffffff';
  let stop: 0 | 1 = 0;

  const card = el('div', 'picker');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Colors and fills');

  const tabs = el('div', 'seg');
  tabs.setAttribute('role', 'tablist');
  const tabBtns = (['solid', 'gradient', 'pattern'] as FillKind[]).map((kind) => {
    const b = button('seg-btn', kind[0]!.toUpperCase() + kind.slice(1), () => {
      fill.kind = kind;
      fill.style = 0;
      stop = 0;
      changed();
    });
    b.setAttribute('role', 'tab');
    b.dataset.kind = kind;
    tabs.append(b);
    return b;
  });

  const preview = el('div', 'picker-preview');
  const chip = el('div', 'swatch big');
  chip.setAttribute('role', 'img');
  const name = el('div', 'picker-name');
  const favBtn = button('pill', '', () => {
    const f = current();
    const i = o.colors.favs.indexOf(f);
    if (i >= 0) o.colors.favs.splice(i, 1);
    else o.colors.favs = [...o.colors.favs, f].slice(-FAVS_MAX);
    o.onFavsChange();
    render();
  });
  preview.append(chip, name, favBtn);

  const styles = el('div', 'picker-styles');
  const stops = el('div', 'picker-stops');
  const stopBtns = [0, 1].map((i) => {
    const b = button('stop-btn', '', () => { stop = i as 0 | 1; render(); });
    stops.append(b);
    return b;
  });

  // Colour square (saturation × value) and hue bar.
  const sv = el('div', 'sv');
  sv.setAttribute('role', 'slider');
  sv.setAttribute('aria-label', 'Saturation and brightness');
  const svKnob = el('div', 'knob');
  sv.append(svKnob);
  const hue = el('div', 'hue');
  hue.setAttribute('role', 'slider');
  hue.setAttribute('aria-label', 'Hue');
  const hueKnob = el('div', 'hue-knob');
  hue.append(hueKnob);
  const mixer = el('div', 'mixer');
  mixer.append(sv, hue);
  let hsv = hexToHsv(activeHex());

  drag(sv, (x, y) => { hsv = [hsv[0], x, 1 - y]; setActive(hsvToHex(...hsv)); });
  drag(hue, (_x, y) => { hsv = [Math.min(359.9, y * 360), hsv[1] || 0.6, hsv[2] || 0.85]; setActive(hsvToHex(...hsv)); });

  const basics = el('div', 'swatch-row');
  for (const hex of BASICS) {
    const b = button('swatch', '', () => { hsv = hexToHsv(hex); setActive(hex); }, `Use ${hex}`);
    b.style.background = hex;
    b.dataset.hex = hex;
    basics.append(b);
  }

  const favLabel = el('div', 'label', 'Favorites');
  const favRow = el('div', 'swatch-row fav-row');

  const foot = el('div', 'picker-foot');
  foot.append(
    button('pill', `${icon('dropper', 16)} From picture`, () => o.onEyedropper()),
    button('pill dark', 'Done', () => close()),
  );

  card.append(tabs, preview, styles, stops, mixer, basics, favLabel, favRow, foot);
  host.append(card);
  requestAnimationFrame(() => card.classList.add('open'));

  function activeHex(): string {
    return fill.kind === 'solid' || stop === 0 ? fill.a : fill.b;
  }
  function setActive(hex: string) {
    if (fill.kind === 'solid' || stop === 0) fill.a = hex;
    else fill.b = hex;
    changed(false);
  }
  function current(): Fill {
    return makeFill(fill);
  }
  function changed(resetHsv = true) {
    if (resetHsv) hsv = hexToHsv(activeHex());
    o.onPick(current());
    render();
  }

  function render() {
    const f = current();
    tabBtns.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.kind === fill.kind)));
    chip.style.background = cssFor(f, 14);
    chip.setAttribute('aria-label', `Current fill: ${fillName(f)}`);
    name.textContent = fillName(f);
    const isFav = o.colors.favs.includes(f);
    favBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="${isFav ? '#f2b630' : 'none'}" stroke="#b9831c" stroke-width="2" stroke-linejoin="round" aria-hidden="true">${'<path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1L3.2 9.4l6.1-.8z"/>'}</svg> ${isFav ? 'Saved' : 'Save'}`;
    favBtn.setAttribute('aria-pressed', String(isFav));

    styles.replaceChildren();
    styles.hidden = fill.kind === 'solid';
    stops.hidden = fill.kind === 'solid';
    if (fill.kind !== 'solid') {
      const names = fill.kind === 'gradient' ? GRADIENTS : PATTERNS;
      names.forEach((label, i) => {
        const f2 = makeFill({ ...fill, style: i });
        const b = button('style-tile', '', () => { fill.style = i; changed(); }, label);
        b.style.background = cssFor(f2, 12);
        b.setAttribute('aria-pressed', String(i === fill.style));
        styles.append(b);
      });
      const labels = fill.kind === 'gradient' ? ['From', 'To'] : ['Pattern', 'Background'];
      stopBtns.forEach((b, i) => {
        const hex = i === 0 ? fill.a : fill.b;
        b.innerHTML = `<span class="dot" style="background:${hex}"></span>${labels[i]}`;
        b.setAttribute('aria-pressed', String(stop === i));
      });
    }

    const [h, s, v] = hsv;
    sv.style.background = `linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, hsl(${h}, 100%, 50%))`;
    svKnob.style.left = `${s * 100}%`;
    svKnob.style.top = `${(1 - v) * 100}%`;
    svKnob.style.background = activeHex();
    hueKnob.style.top = `${(h / 360) * 100}%`;
    for (const b of basics.children) (b as HTMLElement).setAttribute('aria-pressed', String((b as HTMLElement).dataset.hex === activeHex()));

    favRow.replaceChildren();
    if (!o.colors.favs.length) favRow.append(el('div', 'hint', 'Tap Save to keep a fill here'));
    for (const fav of o.colors.favs) {
      const b = button('swatch', '', () => {
        const p = parseFill(fav);
        if (!p) return;
        Object.assign(fill, p);
        if (p.kind === 'solid') fill.b = '#ffffff';
        stop = 0;
        changed();
      }, `Use ${fillName(fav)}`);
      b.style.background = cssFor(fav, 10);
      b.setAttribute('aria-pressed', String(fav === f));
      favRow.append(b);
    }
  }

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    card.classList.remove('open');
    setTimeout(() => card.remove(), 180);
    o.onClose();
  }

  render();
  return { close };
}

/** Pointer drag reporting 0..1 coordinates within `target`. */
function drag(target: HTMLElement, onMove: (x: number, y: number) => void) {
  const at = (e: PointerEvent) => {
    const r = target.getBoundingClientRect();
    onMove(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
  };
  target.addEventListener('pointerdown', (e) => {
    target.setPointerCapture(e.pointerId);
    at(e);
    const move = (ev: PointerEvent) => at(ev);
    const up = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); target.removeEventListener('pointercancel', up); };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  });
}
