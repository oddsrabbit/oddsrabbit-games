// Runs a TypeScript tool from tools/: esbuild bundles it for Node, then Node
// runs it with the remaining arguments.
//
//   node tools/run.mjs gen-boards --days 120 --stats

import { spawn } from 'node:child_process';
import * as esbuild from 'esbuild';

const [name, ...args] = process.argv.slice(2);
if (!name) {
  console.error('usage: node tools/run.mjs <tool> [args]');
  process.exit(1);
}
const outfile = `.tools-build/${name}.mjs`;
await esbuild.build({
  entryPoints: [`tools/${name}.ts`],
  outfile,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  external: ['node:*'],
  sourcemap: 'inline',
  logLevel: 'warning',
});
const child = spawn(process.execPath, ['--enable-source-maps', outfile, ...args], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 1));
