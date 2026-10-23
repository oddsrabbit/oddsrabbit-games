// Copies the public SDK subset of this repo into a checkout of the public
// oddsrabbit/apps-sdk repo.
//
// This repo is private: it holds the games, internal proposals and the deploy
// for apps.oddsrabbit.com, and it stays the place the SDK is developed. The
// public repo is a one-way mirror of the paths below plus a few files it owns
// itself (README, package.json, build.config.mjs, .gitignore, examples/), which
// this script never touches.
//
// ALLOWLIST, not a denylist: a new game or proposal folder stays private until
// someone adds it here on purpose.
//
//   node scripts/sync-public-sdk.mjs [path-to-public-checkout]
//
// Defaults to the apps-sdk checkout next to this repo. Review `git diff` there before committing.

import { cp, rm, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Everything resolves from the repo root, wherever the script is run from.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const PUBLIC_PATHS = [
  'src/sdk',
  'src/schemas',
  'src/ui',
  'src/host',
  'src/playground',
  'docs/game-header-guidelines.md',
  // The one game kept public, as a worked example of the SDK in a real game.
  // Every other game stays private.
  '2048',
  'LICENSE',
  '.gitattributes',
  'tsconfig.json',
  'tsconfig.build.json',
  'test.config.mjs',
];

const target = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(root, '../apps-sdk');

// rm-then-cp onto ourselves would delete the sources, so refuse outright.
if (target === root) {
  console.error(`${target} is this repo, not the public checkout.`);
  process.exit(1);
}

try {
  await stat(resolve(target, '.git'));
} catch {
  console.error(`${target} is not a git checkout. Pass the public repo's path.`);
  process.exit(1);
}

// Check every source before touching the target, so a missing path can't
// leave the public checkout half-synced.
const missing = [];
for (const path of PUBLIC_PATHS) {
  try {
    await stat(resolve(root, path));
  } catch {
    missing.push(path);
  }
}
if (missing.length) {
  console.error(`Missing in this repo, nothing synced: ${missing.join(', ')}`);
  process.exit(1);
}

for (const path of PUBLIC_PATHS) {
  const dest = resolve(target, path);
  // Replace, not merge, so a file deleted here is deleted there too.
  await rm(dest, { recursive: true, force: true });
  await cp(resolve(root, path), dest, { recursive: true });
  console.log(`synced ${path}`);
}

console.log(`\nDone. Review with: git -C "${target}" diff --stat`);
