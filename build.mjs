// Build for Word Battle. Produces dist/word-battle/, uploaded to
// apps.oddsrabbit.com/word-battle/ next to the SDK's own dist.
//
// Plain JS with no bundling: the build only copies files and stamps the
// cache-bust tokens into index.html. The game loads the shared SDK and the
// leaderboard UI from the host (`../sdk-v1.js`, `../leaderboard-v1.*`), so
// neither is bundled here. They're read from the sibling apps-sdk checkout
// because `__SDK_VERSION__` and `__UI_VERSION__` must be the same content
// hashes apps-sdk stamps into its own games, so every game busts the cached
// files together. Run `npm run build` in ../apps-sdk first.

import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const BUILD_ID = process.env.BUILD_ID || String(Date.now());
const SDK_DIST = process.env.SDK_DIST || '../apps-sdk/dist';
const JS = ['rules.js', 'board.js', 'application.js'];

async function hash(files) {
  const bufs = await Promise.all(files.map((f) => readFile(`${SDK_DIST}/${f}`))).catch(() => null);
  if (!bufs) {
    console.warn(`${SDK_DIST}/${files[0]} not found; build apps-sdk first. Using BUILD_ID for its stamp.`);
    return BUILD_ID;
  }
  const h = createHash('sha256');
  for (const b of bufs) h.update(b);
  return h.digest('hex').slice(0, 12);
}

// Hashed the same way as apps-sdk's build.config.mjs: the SDK alone, and the
// leaderboard JS and CSS together.
const SDK_VERSION = await hash(['sdk-v1.js']);
const UI_VERSION = await hash(['leaderboard-v1.js', 'leaderboard-v1.css']);

await rm('dist', { recursive: true, force: true });
await mkdir('dist/word-battle/js', { recursive: true });
await mkdir('dist/word-battle/fonts', { recursive: true });

const html = await readFile('index.html', 'utf8');
await Promise.all([
  writeFile(
    'dist/word-battle/index.html',
    html
      .replaceAll('__BUILD_ID__', BUILD_ID)
      .replaceAll('__SDK_VERSION__', SDK_VERSION)
      .replaceAll('__UI_VERSION__', UI_VERSION)
  ),
  copyFile('styles.css', 'dist/word-battle/styles.css'),
  // The platform manifest points at <slug>/icon-512.png (tools/setup-apps-
  // platform.php in the web repo), so the icon ships with the bundle.
  copyFile('icon/icon-512.png', 'dist/word-battle/icon-512.png'),
  copyFile('fonts/bricolage-grotesque-800-latin.woff2', 'dist/word-battle/fonts/bricolage-grotesque-800-latin.woff2'),
  copyFile('fonts/OFL.txt', 'dist/word-battle/fonts/OFL.txt'),
  ...JS.map((name) => copyFile(`js/${name}`, `dist/word-battle/js/${name}`)),
]);

// Local copies so the game runs from dist/ with `../sdk-v1.js` resolving.
// For local use only; don't upload these from here.
await Promise.all(
  ['sdk-v1.js', 'leaderboard-v1.js', 'leaderboard-v1.css'].map((f) =>
    copyFile(`${SDK_DIST}/${f}`, `dist/${f}`).catch(() => {})
  )
);

console.log('Build complete.');
