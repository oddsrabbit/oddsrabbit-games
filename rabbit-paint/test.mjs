// Bundles each *.test.ts with esbuild and runs it under Node.

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import * as esbuild from 'esbuild';

const files = [
  ...readdirSync('src').filter((f) => f.endsWith('.test.ts')).map((f) => `src/${f}`),
  ...readdirSync('tools').filter((f) => f.endsWith('.test.ts')).map((f) => `tools/${f}`),
];
let failed = false;
for (const file of files) {
  const outfile = `.test-build/${file.replace(/[\\/]/g, '_').replace(/\.ts$/, '.mjs')}`;
  await esbuild.build({ entryPoints: [file], outfile, bundle: true, format: 'esm', platform: 'node', target: 'node20', external: ['node:*', 'sharp'], logLevel: 'warning' });
  console.log(`\n# ${file}`);
  const run = spawnSync(process.execPath, [outfile], { stdio: 'inherit' });
  if (run.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
