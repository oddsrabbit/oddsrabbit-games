// "Now" for the game: server time via OR.time.now() when the host has it, the
// device clock otherwise. The SDK caches the server offset, so this keeps its
// own copy and refreshes it in the background; reads are synchronous.

import type { OddsRabbitGlobal } from '@oddsrabbit/apps-sdk';

let offsetMs = 0;
let trusted = false;

export function now(): number {
  return Date.now() + offsetMs;
}

/** Server time minus the device clock, as last measured (0 before then). */
export function clockOffset(): number {
  return offsetMs;
}

/** Whether "now" comes from the server rather than the device clock. */
export function isServerTime(): boolean {
  return trusted;
}

export async function syncClock(OR: OddsRabbitGlobal): Promise<void> {
  const before = Date.now();
  const server = await OR.time.now();
  const after = Date.now();
  // OR.time.now() resolves Date.now() itself when the host can't answer, so a
  // result within a few ms of the device clock tells us nothing either way.
  offsetMs = server - (before + after) / 2;
  trusted = OR.capabilities.has('time.now');
}
