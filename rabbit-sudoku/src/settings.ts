// Player settings, saved under `settings`.

/** The game's colours. `auto` follows the app's light or dark mode. */
export type ThemeChoice = 'auto' | 'light' | 'paper' | 'dark';
/** What `data-theme` on <html> ends up as, once `auto` is resolved. */
export type Theme = Exclude<ThemeChoice, 'auto'>;

export const THEME_LABELS: Record<ThemeChoice, string> = {
  auto: 'Match app',
  light: 'Light',
  paper: 'Paper',
  dark: 'Dark',
};

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
  /** Show the private timer while playing and on the solved sheet. Never ranked. */
  showTime: boolean;
  theme: ThemeChoice;
}

/** The on/off settings, shown as switches. */
export type Toggle = Exclude<keyof Settings, 'theme'>;

export const DEFAULT_SETTINGS: Settings = {
  flagRepeats: true,
  showMistakes: false,
  digitFirst: false,
  autoNotes: true,
  vibration: true,
  showTime: false,
  theme: 'auto',
};

export const SETTING_LABELS: Record<Toggle, string> = {
  flagRepeats: 'Flag repeated digits',
  showMistakes: 'Show mistakes',
  digitFirst: 'Pick the digit first',
  autoNotes: 'Clear notes automatically',
  vibration: 'Vibration',
  showTime: 'Show my time',
};

export function parseSettings(raw: unknown): Settings {
  const s = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    for (const key of Object.keys(SETTING_LABELS) as Toggle[]) {
      const v = r[key];
      if (typeof v === 'boolean') s[key] = v;
    }
    if (typeof r.theme === 'string' && Object.prototype.hasOwnProperty.call(THEME_LABELS, r.theme)) s.theme = r.theme as ThemeChoice;
  }
  return s;
}

/** `auto` takes the app's scheme; an older app that doesn't say gets light. */
export function resolveTheme(choice: ThemeChoice, appScheme: string | null | undefined): Theme {
  if (choice !== 'auto') return choice;
  return appScheme === 'dark' ? 'dark' : 'light';
}
