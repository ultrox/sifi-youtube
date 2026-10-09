const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
for (const folder of ['extension', 'scripts']) {
  for (const file of fs.readdirSync(path.join(root, folder))) {
    if (/\.(?:js|cjs)$/.test(file)) execFileSync(process.execPath, ['--check', path.join(root, folder, file)], { stdio: 'inherit' });
  }
}
JSON.parse(fs.readFileSync(path.join(root, 'extension/manifest.json')));
console.log('JavaScript and manifest syntax passed.');
