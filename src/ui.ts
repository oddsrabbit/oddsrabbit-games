// Small DOM and bridge helpers shared by both modes.

import type { OddsRabbitGlobal } from '@oddsrabbit/apps-sdk';
import { DAY_MS, EPOCH_MS } from './puzzle';

declare global {
  interface Window {
    OddsRabbit: OddsRabbitGlobal;
  }
}

export const OR = (): OddsRabbitGlobal => window.OddsRabbit;

export const SHARE_URL = 'https://www.oddsrabbit.com/games/word-rush/';

/** Server time minus device time, so a wrong phone clock can't stretch a ranked run. */
let clockOffset = 0;

/** Server-synced time (ms). */
export const serverNow = (): number => Date.now() + clockOffset;

export async function syncClock(): Promise<void> {
  try {
    const server = await OR().time.now();
    if (Number.isFinite(server)) clockOffset = server - Date.now();
  } catch {
    /* device clock it is */
  }
}

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

export function haptic(kind: 'light' | 'medium' | 'success' | 'error'): void {
  void OR().actions.haptic(kind).catch(() => undefined);
}

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    // A write still on its way is newer than what the server holds.
    const raw = writes.get(key)?.latest ?? (await OR().storage.get(key));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Writes for one key, one at a time. For a signed-in player each write is its
 * own request to the server, and parallel requests can land out of order: a
 * run saving after every word once ended up stored with only its first three.
 * So a key has at most one write in flight, and when it lands the latest value
 * goes next; values in between are skipped.
 */
const writes = new Map<string, { latest: string; run: Promise<void> | null }>();

/**
 * Best-effort, like rabbit-words: a failed write (offline, a degraded host) is
 * retried a couple of times, then left for the next write of the key, and the
 * game plays on from memory. Resolves once this value, or a newer one, is
 * stored or given up on.
 */
export function writeJson(key: string, value: unknown): Promise<void> {
  const raw = JSON.stringify(value);
  const w = writes.get(key);
  if (w) {
    w.latest = raw;
    return w.run!;
  }
  const entry: { latest: string; run: Promise<void> | null } = { latest: raw, run: null };
  writes.set(key, entry);
  entry.run = flushWrites(key, entry);
  return entry.run;
}

async function flushWrites(key: string, w: { latest: string }): Promise<void> {
  let sent: string | null = null;
  let failures = 0;
  try {
    while (sent !== w.latest) {
      const raw: string = w.latest;
      try {
        await OR().storage.set(key, raw);
        sent = raw;
        failures = 0;
      } catch {
        if (++failures >= 3) return;
        await new Promise((r) => window.setTimeout(r, 400 * failures));
      }
    }
  } finally {
    // Synchronously after the last check, so a write arriving now starts a fresh run.
    writes.delete(key);
  }
}

export function formatPuzzleDate(index: number): string {
  return new Date(EPOCH_MS + index * DAY_MS).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function showToast(message: string): void {
  document.querySelector('.toast')?.remove();
  const toast = el('div', 'toast', message);
  toast.setAttribute('role', 'status');
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  window.setTimeout(() => {
    toast.classList.remove('show');
    window.setTimeout(() => toast.remove(), 300);
  }, 2200);
}

/** A centred modal; Escape, the backdrop and anything with `.modal-close` dismiss it. */
export function openModal(html: string, onClose?: () => void): () => void {
  const backdrop = el('div', 'modal-backdrop');
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.innerHTML = `<div class="modal">${html}</div>`;
  document.body.appendChild(backdrop);
  const close = (): void => {
    document.removeEventListener('keydown', onEsc);
    backdrop.remove();
    onClose?.();
  };
  const onEsc = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onEsc);
  backdrop.querySelectorAll('.modal-close').forEach((b) => b.addEventListener('click', close));
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  return close;
}

export async function shareText(text: string): Promise<void> {
  try {
    await OR().actions.share({ title: 'Word Rush', text });
    return;
  } catch {
    /* fall through to the clipboard */
  }
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied');
  } catch {
    showToast('Could not share');
  }
}

export function inviteShare(): Promise<void> {
  return shareText(`Play Word Rush with me: a new letter grid to hunt every day. ${SHARE_URL}`);
}

/** "Next board in 5h 12m", kept ticking while it's on screen. */
export function resetTimeLine(): HTMLElement {
  const p = el('p', 'reset-time');
  const tick = (): void => {
    const now = serverNow();
    const next = EPOCH_MS + (Math.floor((now - EPOCH_MS) / DAY_MS) + 1) * DAY_MS;
    const minutes = Math.max(0, Math.floor((next - now) / 60_000));
    const h = Math.floor(minutes / 60);
    p.textContent = h > 0 ? `New boards in ${h}h ${minutes % 60}m` : `New boards in ${minutes}m`;
  };
  tick();
  const timer = window.setInterval(() => {
    if (!p.isConnected) window.clearInterval(timer);
    else tick();
  }, 30_000);
  return p;
}
