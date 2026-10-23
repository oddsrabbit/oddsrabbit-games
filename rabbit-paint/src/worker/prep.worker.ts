// Runs page prep off the main thread: a 1600 px picture takes a second or two
// on a phone, which would otherwise freeze the "making your page" screen.

import type { PrepFailure, PrepRequest } from './messages';
import { prepPicture } from './page-prep';

self.onmessage = (e: MessageEvent<PrepRequest>) => {
  const { rgb, w, h, gaps, style } = e.data;
  try {
    const res = prepPicture(rgb, w, h, gaps, style);
    (self as unknown as Worker).postMessage(res, [res.ids.buffer, res.ink.buffer, res.thumbIds.buffer, res.thumbInk.buffer]);
  } catch (err) {
    const fail: PrepFailure = { ok: false, message: (err as Error)?.message ?? 'prep failed' };
    (self as unknown as Worker).postMessage(fail);
  }
};
