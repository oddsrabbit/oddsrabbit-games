// Renders pets.html's three sets to out/pets/<set>-<tier>.png.
// Needs the repo served on :8765 (python3 -m http.server 8765 --bind 127.0.0.1).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const html = execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--virtual-time-budget=8000', '--dump-dom',
  'http://127.0.0.1:8765/bubble-merge/dev/style-mocks/pets.html'], { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
const data = JSON.parse(html.match(/<script type="application\/json" id="out">([\s\S]*?)<\/script>/)[1]);
const dir = path.join(__dirname, 'out', 'pets');
fs.mkdirSync(dir, { recursive: true });
const sizes = {};
for (const [set, imgs] of Object.entries(data)) {
  for (const [t, url] of Object.entries(imgs)) {
    const buf = Buffer.from(url.split(',')[1], 'base64');
    fs.writeFileSync(path.join(dir, `${set}-${String(t).padStart(2, '0')}.png`), buf);
    (sizes[set] = sizes[set] || []).push(buf.readUInt32BE(16) + 'x' + buf.readUInt32BE(20));
  }
}
console.log(JSON.stringify(sizes));
