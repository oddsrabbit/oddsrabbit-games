// The player's own pictures, turned into pages on this device. They live in
// IndexedDB, not account storage: a page is a few hundred KB of images, and
// account storage holds 64 KB per game. So they stay on this device, and so
// does their progress (store.ts keeps `mine-<id>` keys local).
//
// A page here is addressed as slug `user-<id>`, session key `mine-<id>`.

import type { PageInfo } from './art';

export interface MinePage {
  id: string;
  title: string;
  createdAt: number;
  info: PageInfo;
  /** The same files a catalog page has, as PNGs, plus the picture as given. */
  files: { regions: Blob; lineart: Blob; thumbRegions: Blob; thumbLineart: Blob; source: Blob };
  /** Set once sent for review to the shared library. */
  submitted?: { at: number; id: string | null };
}

export const MINE_SLUG = 'user-';
export const MINE_MAX = 30;

export const isMineSlug = (slug: string): boolean => slug.startsWith(MINE_SLUG);
export const mineId = (slug: string): string => slug.slice(MINE_SLUG.length);
export const mineSlug = (id: string): string => MINE_SLUG + id;
export const mineKey = (id: string) => `mine-${id}` as const;

const DB = 'rabbit-paint';
const STORE = 'pages';
let dbp: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbp ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  dbp.catch(() => { dbp = null; });
  return dbp;
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise<T>((resolve, reject) => {
    const tx = d.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Newest first. Empty when IndexedDB isn't there (some private modes). */
export async function listMine(): Promise<MinePage[]> {
  try {
    const all = await run<MinePage[]>('readonly', (s) => s.getAll() as IDBRequest<MinePage[]>);
    return all.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export function getMine(id: string): Promise<MinePage | undefined> {
  return run<MinePage | undefined>('readonly', (s) => s.get(id) as IDBRequest<MinePage | undefined>);
}

export async function putMine(page: MinePage): Promise<void> {
  await run('readwrite', (s) => s.put(page));
  // Ask once not to be cleared under storage pressure; fine if refused.
  void navigator.storage?.persist?.().catch(() => false);
}

export async function deleteMine(id: string): Promise<void> {
  await run('readwrite', (s) => s.delete(id));
}

export function newMineId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
