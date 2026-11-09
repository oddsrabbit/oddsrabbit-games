// Player settings, saved under `settings`.

export interface Settings {
  /** Mark a digit that repeats in its row, column or box. A rule, not the answer. */
  flagRepeats: boolean;
  /** Mark digits that don't match the solution. Off unless the player asks. */
  showMistakes: boolean;
  /** Tap a digit, then cells, instead of a cell, then a digit. */
  digitFirst: boolean;
  /** Placing a digit removes it from the notes of the cells it sees. */
  autoNotes: boolean;
  /** Haptics. Shown on touch devices only, as in solitaire. */
  vibration: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  flagRepeats: true,
  showMistakes: false,
  digitFirst: false,
  autoNotes: true,
  vibration: true,
};

export const SETTING_LABELS: Record<keyof Settings, string> = {
  flagRepeats: 'Flag repeated digits',
  showMistakes: 'Show mistakes',
  digitFirst: 'Pick the digit first',
  autoNotes: 'Clear notes automatically',
  vibration: 'Vibration',
};

export function parseSettings(raw: unknown): Settings {
  const s = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === 'object') {
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      const v = (raw as Record<string, unknown>)[key];
      if (typeof v === 'boolean') s[key] = v;
    }
  }
  return s;
}
