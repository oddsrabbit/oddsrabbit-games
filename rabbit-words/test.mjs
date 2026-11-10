// Test runner for this game's pure logic, the same approach as the root
// test.config.mjs (which only scans the SDK's src/): esbuild compiles the
// `*.test.ts` files to ESM and Node's built-in runner runs them.
//
//   node rabbit-words/test.mjs     (from the repo root, or `node test.mjs` here)

import { spawn } from 'node:child_process';
import { readdir, rm } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

process.chdir(dirname(fileURLToPath(import.meta.url)));

const OUT_DIR = '.test-build';

async function findTests(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await findTests(path)));
    else if (entry.name.endsWith('.test.ts')) found.push(path);
  }
  return found;
}

const entryPoints = await findTests('src');
if (entryPoints.length === 0) {
  console.error('No *.test.ts files found under src/.');
  process.exit(1);
}

await rm(OUT_DIR, { recursive: true, force: true });

await esbuild.build({
  entryPoints,
  outdir: OUT_DIR,
  outbase: '.',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  external: ['node:*'],
  sourcemap: 'inline',
  logLevel: 'warning',
});

// Files named one by one: Node 22's `--test` doesn't walk a directory argument.
const testFiles = entryPoints.map((entry) =>
  join(OUT_DIR, relative('.', entry).replace(/\.ts$/, '.js'))
);

const child = spawn(process.execPath, ['--enable-source-maps', '--test', ...testFiles], {
  stdio: 'inherit',
  env: { ...process.env, LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' },
});
child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 1));
