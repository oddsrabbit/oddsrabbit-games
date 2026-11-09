// Small DOM, storage and bridge helpers shared by the screens.

import type { OddsRabbitGlobal } from '@oddsrabbit/apps-sdk';

declare global {
  interface Window {
    OddsRabbit: OddsRabbitGlobal;
  }
}

export const OR = (): OddsRabbitGlobal => window.OddsRabbit;

export const SHARE_URL = 'https://www.oddsrabbit.com/games/rabbit-sudoku/';

// ---------- time ----------

/** Server time minus device time, so the day rolls over on the server's clock. */
let clockOffset = 0;
export const serverNow = (): number => Date.now() + clockOffset;

export async function syncClock(): Promise<void> {
  try {
    const server = await OR().time.now();
    if (Number.isFinite(server)) clockOffset = server - Date.now();
  } catch {
    /* the device clock, then */
  }
}

// ---------- DOM ----------

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function button(className: string, text: string, onClick: () => void, label?: string): HTMLButtonElement {
  const b = el('button', className, text);
  b.type = 'button';
  if (label) b.setAttribute('aria-label', label);
  b.addEventListener('click', onClick);
  return b;
}

/** Off when the player turned vibration off in settings. Every buzz goes through haptic(). */
let vibration = true;
export function setVibration(on: boolean): void {
  vibration = on;
}

export function haptic(kind: 'light' | 'medium' | 'success' | 'error'): void {
  if (!vibration) return;
  void OR()
    .actions.haptic(kind)
    .catch(() => undefined);
}

/** A sheet over the screen with a title, a body and a close button. Returns a closer. */
export function openSheet(title: string, body: HTMLElement, onClose?: () => void): () => void {
  const backdrop = el('div', 'sheet-backdrop');
  const sheet = el('div', 'sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', title);
  const head = el('div', 'sheet-head');
  const close = (): void => {
    backdrop.remove();
    document.documentElement.removeAttribute('data-sheet');
    onClose?.();
  };
  head.append(el('h2', '', title), button('icon-button', '✕', close, 'Close'));
  sheet.append(head, body);
  backdrop.appendChild(sheet);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  document.body.appendChild(backdrop);
  document.documentElement.setAttribute('data-sheet', '');
  return close;
}

// ---------- storage ----------

/**
 * Writes for one key go one at a time, latest value next: parallel requests to
 * the server can land out of order, and an older save must never win.
 */
const writes = new Map<string, { latest: string; running: boolean }>();

export function writeJson(key: string, value: unknown): void {
  const json = JSON.stringify(value);
  const queued = writes.get(key);
  if (queued) {
    queued.latest = json;
    return;
  }
  const w = { latest: json, running: true };
  writes.set(key, w);
  void (async () => {
    for (;;) {
      const sent = w.latest;
      try {
        await OR().storage.set(key, sent);
      } catch {
        /* kept on screen; the next change tries again */
      }
      if (w.latest === sent) break;
    }
    writes.delete(key);
  })();
}

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = writes.get(key)?.latest ?? (await OR().storage.get(key));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
