import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SETTINGS, parseSettings, resolveTheme } from './settings';

test('a save from before themes keeps its switches and matches the app', () => {
  const s = parseSettings({ flagRepeats: false, vibration: false });
  assert.equal(s.flagRepeats, false);
  assert.equal(s.vibration, false);
  assert.equal(s.theme, 'auto');
});

test('a saved theme is kept; anything else falls back', () => {
  assert.equal(parseSettings({ theme: 'paper' }).theme, 'paper');
  assert.equal(parseSettings({ theme: 'neon' }).theme, 'auto');
  assert.equal(parseSettings({ theme: 'toString' }).theme, 'auto');
  assert.deepEqual(parseSettings(null), DEFAULT_SETTINGS);
});

test('auto follows the app, and light when the app does not say', () => {
  assert.equal(resolveTheme('auto', 'dark'), 'dark');
  assert.equal(resolveTheme('auto', 'light'), 'light');
  assert.equal(resolveTheme('auto', null), 'light');
  assert.equal(resolveTheme('paper', 'dark'), 'paper');
});
