// The share sheet: one place to send a result anywhere. The host's share
// (the phone's own sheet in the app), copy, the big social sites by intent
// URL, and a picture of the result. Posting straight to the OddsRabbit feed
// needs a bridge verb the platform doesn't have yet (`actions.publishPost`;
// the backend half exists), so it isn't offered here.
//
// Nothing shared ever shows the board's letters: anyone who hasn't played
// today's board can't be spoiled by a share.

import { el, OR, SHARE_URL, showToast } from './ui';

export interface ShareCard {
  /** "Word Rush Ranked #12 · 5×5" */
  title: string;
  /** Big line on the image: "73 pts" or "37/37 words". */
  headline: string;
  /** Smaller lines under it. */
  lines: string[];
  /** The board's shape for the silhouette: true = tile, false = hole. */
  rows: number;
  cols: number;
  tiles: boolean[];
}

export interface ShareOptions {
  /** The text that goes everywhere (it ends with the game's link). */
  text: string;
  card: ShareCard;
  /** File name stem for the image. */
  file: string;
}

const intent = (url: string): void => {
  window.open(url, '_blank', 'noopener,noreferrer');
};

export function openShareSheet(opts: ShareOptions): void {
  const { text } = opts;
  const enc = encodeURIComponent;
  const isTouch = navigator.maxTouchPoints > 0;
  let canShareFiles = false;
  try {
    canShareFiles = isTouch && typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File(['x'], 'x.png', { type: 'image/png' })] });
  } catch {
    canShareFiles = false;
  }

  const backdrop = el('div', 'modal-backdrop');
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', 'Share your result');
  const modal = el('div', 'modal share-sheet');
  let previewUrl: string | null = null;
  const close = (): void => {
    document.removeEventListener('keydown', onEsc);
    backdrop.remove();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  };
  const onEsc = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };

  const head = el('div', 'share-head');
  head.append(el('h2', '', 'Share your result'));
  const x = el('button', 'icon-btn small', '×');
  x.type = 'button';
  x.setAttribute('aria-label', 'Close');
  x.onclick = close;
  head.appendChild(x);
  modal.appendChild(head);

  const preview = el('img', 'share-preview-img');
  preview.alt = 'Your result card';
  modal.appendChild(preview);
  let blob: Blob | null = null;
  void renderCard(opts.card).then((b) => {
    blob = b;
    previewUrl = URL.createObjectURL(b);
    preview.src = previewUrl;
  }).catch(() => preview.remove());

  modal.appendChild(el('pre', 'share-text', text));

  const primary = el('div', 'share-primary');
  const btn = (label: string, cls: string, fn: () => void | Promise<void>): HTMLButtonElement => {
    const b = el('button', cls, label);
    b.type = 'button';
    b.addEventListener('click', () => void fn());
    return b;
  };
  primary.append(
    btn('Share…', 'primary-btn', async () => {
      try {
        await OR().actions.share({ title: 'Word Rush', text });
      } catch {
        await copy();
      }
    }),
    btn('Copy', 'secondary-btn', () => copy())
  );
  modal.appendChild(primary);

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Copied');
    } catch {
      showToast('Could not copy');
    }
  };

  modal.appendChild(el('p', 'share-label', 'Post it'));
  const socials = el('div', 'share-socials');
  socials.append(
    btn('X', 'social-btn', () => intent(`https://x.com/intent/post?text=${enc(text)}`)),
    btn('Threads', 'social-btn', () => intent(`https://www.threads.net/intent/post?text=${enc(text)}`)),
    btn('Bluesky', 'social-btn', () => intent(`https://bsky.app/intent/compose?text=${enc(text)}`)),
    btn('WhatsApp', 'social-btn', () => intent(`https://wa.me/?text=${enc(text)}`)),
    btn('Reddit', 'social-btn', () => intent(`https://www.reddit.com/submit?url=${enc(SHARE_URL)}&title=${enc(opts.card.title)}`)),
    // Facebook keeps only the link; the landing page's card does the rest.
    btn('Facebook', 'social-btn', () => intent(`https://www.facebook.com/sharer/sharer.php?u=${enc(SHARE_URL)}`))
  );
  modal.appendChild(socials);

  modal.appendChild(el('p', 'share-label', 'Picture'));
  const pics = el('div', 'share-primary');
  pics.appendChild(
    btn('Save image', 'secondary-btn', () => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${opts.file}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoked a moment later: some browsers start the download after click() returns.
      const href = a.href;
      window.setTimeout(() => URL.revokeObjectURL(href), 10_000);
    })
  );
  if (canShareFiles) {
    pics.appendChild(
      btn('Share image…', 'secondary-btn', async () => {
        if (!blob) return;
        try {
          await navigator.share({ text, files: [new File([blob], `${opts.file}.png`, { type: 'image/png' })] });
        } catch {
          /* cancelled */
        }
      })
    );
  }
  modal.appendChild(pics);

  backdrop.appendChild(modal);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener('keydown', onEsc);
  document.body.appendChild(backdrop);
}

// ---------- The picture ----------

const GOLD = '#ff8d00';
const INK = '#333333';
const CREAM = '#fcfcfc';

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** A 1080×1080 card: title, the headline number, the lines, and the board's silhouette (no letters). */
export async function renderCard(card: ShareCard): Promise<Blob> {
  const S = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('no canvas');
  g.fillStyle = CREAM;
  g.fillRect(0, 0, S, S);
  g.fillStyle = GOLD;
  g.fillRect(0, 0, S, 14);

  const font = (w: number, px: number): string => `${w} ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillStyle = INK;
  g.font = font(900, 84);
  g.fillText('Word Rush', S / 2, 150);
  g.fillStyle = '#666666';
  g.font = font(600, 38);
  g.fillText(card.title.replace(/^Word Rush\s*/, ''), S / 2, 210);

  // Silhouette: the board's tiles as blank squares.
  const box = 380;
  const gap = 12;
  const cell = Math.min((box - gap * (card.cols - 1)) / card.cols, (box - gap * (card.rows - 1)) / card.rows);
  const gw = card.cols * cell + (card.cols - 1) * gap;
  const gh = card.rows * cell + (card.rows - 1) * gap;
  const gx = (S - gw) / 2;
  const gy = 260;
  card.tiles.forEach((on, i) => {
    if (!on) return;
    const x = gx + (i % card.cols) * (cell + gap);
    const y = gy + Math.floor(i / card.cols) * (cell + gap);
    g.fillStyle = '#d0d0d0';
    roundRect(g, x, y + 6, cell, cell, cell * 0.16);
    g.fill();
    g.fillStyle = '#ffffff';
    roundRect(g, x, y, cell, cell, cell * 0.16);
    g.fill();
  });

  const textTop = gy + gh + 120;
  g.fillStyle = INK;
  g.font = font(900, 110);
  g.fillText(card.headline, S / 2, textTop);
  g.font = font(700, 40);
  g.fillStyle = '#444444';
  card.lines.slice(0, 3).forEach((line, i) => g.fillText(line, S / 2, textTop + 70 + i * 54));

  g.fillStyle = '#999999';
  g.font = font(600, 30);
  g.fillText('oddsrabbit.com/games/word-rush', S / 2, S - 50);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png'));
}
