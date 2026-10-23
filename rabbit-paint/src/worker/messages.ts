// What the page-prep worker is sent and answers. Shared by the worker and the
// upload screen, so no code beyond these constants.

/** The long side pictures are scaled to before prep (short ones are scaled up to MIN_SIDE). */
export const MAX_SIDE = 1600;
export const MIN_SIDE = 1000;
/** Thumbnails' long side, as tools/prep-page.ts makes them. */
export const THUMB = 360;

/** How big a gap in the lines to close: 0 = keeps fine detail; 1 = normal; 2 = closes bigger gaps. */
export type Gaps = 0 | 1 | 2;

/**
 * How the picture becomes lines. `lines`: its dark lines are the ink, for
 * line art and photos of printed pages. `outline`: a line goes round each
 * area of colour, for colour pictures, logos and photos.
 */
export type PrepStyle = 'lines' | 'outline';

export interface PrepRequest {
  /** RGB, three bytes per pixel, already flattened onto white. */
  rgb: Uint8Array;
  w: number;
  h: number;
  gaps: Gaps;
  /** null: the worker picks one from the picture. */
  style: PrepStyle | null;
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
  /** The same ink as a smooth SVG, crisp at any zoom. */
  lineSvg: string;
  thumbW: number;
  thumbH: number;
  thumbIds: Uint16Array;
  /** Thickened ink, box-averaged to thumb size: an alpha per pixel. */
  thumbInk: Uint8Array;
  /** Share of the picture that's ink before loose strokes are dropped. */
  inkShare: number;
  /** The style used: the one asked for, or the one picked. */
  style: PrepStyle;
}

export interface PrepFailure {
  ok: false;
  message: string;
}
