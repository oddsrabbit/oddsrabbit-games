// Small shared helpers: the SDK handle, DOM building, storage, haptics.

import type { OddsRabbitGlobal } from '@oddsrabbit/apps-sdk';

type AppHapticType = Parameters<OddsRabbitGlobal['actions']['haptic']>[0];

declare global {
  interface Window {
    OddsRabbit: OddsRabbitGlobal;
  }
}

export const OR = (): OddsRabbitGlobal => window.OddsRabbit;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(className: string, label: string, onClick: () => void, ariaLabel?: string): HTMLButtonElement {
  const b = el('button', className);
  b.type = 'button';
  if (label.startsWith('<')) b.innerHTML = label;
  else b.textContent = label;
  if (ariaLabel) b.setAttribute('aria-label', ariaLabel);
  b.addEventListener('click', onClick);
  return b;
}

/** Inline stroke icons, 24-unit viewBox. */
export const ICONS = {
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  share: '<path d="M12 15V3"/><path d="M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  save: '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  find: '<path d="M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14z"/><path d="M21 21l-5-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1L3.2 9.4l6.1-.8z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  dropper: '<path d="M2 22l5-1 11-11-4-4L3 17z"/><path d="M14 6l3-3a2 2 0 0 1 3 0l1 1a2 2 0 0 1 0 3l-3 3"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 16l5-5 4 4 3-3 6 6"/><path d="M15.5 8.5h.01"/>',
  more: '<path d="M6 12h.01M12 12h.01M18 12h.01"/>',
} as const;

export function icon(name: keyof typeof ICONS, size = 18): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

// --- storage ----------------------------------------------------------------------
// The player's storage follows their account. A guest has none (the hosts
// refuse it), so a guest's progress lives in this browser instead.

const LOCAL_PREFIX = 'rabbit-paint:';
let accountStorage = true;

function localGet(key: string): string | null {
  try { return localStorage.getItem(LOCAL_PREFIX + key); } catch { return null; }
}
function localSet(key: string, value: string): void {
  try { localStorage.setItem(LOCAL_PREFIX + key, value); } catch { /* full or blocked */ }
}

/** `localOnly` keeps a key in this browser even when signed in. */
export async function readJson<T>(key: string, fallback: T, localOnly = false): Promise<T> {
  let raw: string | null = null;
  if (!localOnly && accountStorage && OR().user) {
    try { raw = await OR().storage.get(key); } catch { accountStorage = false; }
  }
  raw ??= localGet(key);
  if (raw === null) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export async function writeJson(key: string, value: unknown, localOnly = false): Promise<void> {
  const raw = JSON.stringify(value);
  localSet(key, raw);
  if (!localOnly && accountStorage && OR().user) {
    try { await OR().storage.set(key, raw); } catch { accountStorage = false; }
  }
}

export async function removeJson(key: string, localOnly = false): Promise<void> {
  try { localStorage.removeItem(LOCAL_PREFIX + key); } catch { /* blocked */ }
  if (!localOnly && accountStorage && OR().user) {
    try { await OR().storage.delete(key); } catch { /* left for next time */ }
  }
}

// --- misc ---------------------------------------------------------------------------

export function haptic(type: AppHapticType): void {
  if (OR().capabilities.has('actions.haptic')) void OR().actions.haptic(type).catch(() => {});
}

let clockOffset = 0;
export async function syncClock(): Promise<void> {
  const server = await OR().time.now();
  if (Number.isFinite(server)) clockOffset = server - Date.now();
}
export const serverNow = (): number => Date.now() + clockOffset;

export function toast(text: string, ms = 2200): void {
  const t = el('div', 'toast', text);
  t.setAttribute('role', 'status');
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
