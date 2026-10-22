// What the page-prep worker is sent and answers. Shared by the worker and the
// upload screen, so no code beyond these constants.

/** The long side pictures are scaled to before prep (short ones are scaled up to MIN_SIDE). */
export const MAX_SIDE = 1600;
export const MIN_SIDE = 1000;
/** Thumbnails' long side, as tools/prep-page.ts makes them. */
export const THUMB = 360;

/** 0 = fewer, bigger areas; 1 = normal; 2 = more detail. */
export type Detail = 0 | 1 | 2;

export interface PrepRequest {
  /** Greyscale, one byte per pixel, already flattened onto white. */
  grey: Uint8Array;
  w: number;
  h: number;
  detail: Detail;
}

export interface PrepRegion {
  id: number;
  area: number;
  label: [number, number];
  bbox: [number, number, number, number];
}

export interface PrepReply {
  ok: true;
  w: number;
  h: number;
  regions: PrepRegion[];
  /** Region id + 1 per pixel. */
  ids: Uint16Array;
  /** 1 = ink kept for display. */
  ink: Uint8Array;
  thumbW: number;
  thumbH: number;
  thumbIds: Uint16Array;
  /** Thickened ink, box-averaged to thumb size: an alpha per pixel. */
  thumbInk: Uint8Array;
  /** Share of the picture that's ink before loose strokes are dropped. */
  inkShare: number;
}

export interface PrepFailure {
  ok: false;
  message: string;
}
