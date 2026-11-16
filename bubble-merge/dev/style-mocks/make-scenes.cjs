// Renders scenes.html's background-and-box mocks to out/scenes/<name>.png.
// Needs the repo served on :8765 (python3 -m http.server 8765 --bind 127.0.0.1).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const html = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--virtual-time-budget=8000', '--dump-dom',
  'http://127.0.0.1:8765/bubble-merge/dev/style-mocks/scenes.html'], { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
const data = JSON.parse(html.match(/<script type="application\/json" id="out">([\s\S]*?)<\/script>/)[1]);
const dir = path.join(__dirname, 'out', 'scenes');
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
for (const [name, url] of Object.entries(data)) fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
console.log(Object.keys(data).join(' '));
