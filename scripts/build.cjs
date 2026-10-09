// Keep the local key: Chromium uses it to identify future updates of this fork.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist');
fs.mkdirSync(out, { recursive: true });
const keyDir = path.join(root, '.keys');
const keyFile = process.env.SIFI_YOUTUBE_KEY || path.join(keyDir, 'youtube.pem');
execFileSync('python3', ['-c', `from pathlib import Path
import zipfile
root=Path(${JSON.stringify(root)})
with zipfile.ZipFile(root/'dist/sifi-youtube.zip','w',zipfile.ZIP_DEFLATED) as z:
 for f in sorted((root/'extension').rglob('*')):
  if f.is_file(): z.write(f,f.relative_to(root/'extension'))
`]);
const zip = fs.readFileSync(path.join(out, 'sifi-youtube.zip'));
if (!process.argv.includes('--crx')) {
  console.log('Built dist/sifi-youtube.zip');
  process.exit(0);
}
if (!fs.existsSync(keyFile)) throw new Error('CRX signing requires .keys/youtube.pem or SIFI_YOUTUBE_KEY. Keep the same key for updates.');
const key = crypto.createPrivateKey(fs.readFileSync(keyFile));
const pub = crypto.createPublicKey(key).export({ type: 'spki', format: 'der' });
const digest = crypto.createHash('sha256').update(pub).digest().subarray(0, 16);
const varint = n => { const bytes=[]; do { bytes.push((n & 127) | (n > 127 ? 128 : 0)); n >>>= 7; } while(n); return Buffer.from(bytes); };
const field = (number, bytes) => Buffer.concat([varint(number * 8 + 2), varint(bytes.length), bytes]);
const u32 = n => { const b=Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const signedData = field(1, digest);
const signature = crypto.sign('sha256', Buffer.concat([Buffer.from('CRX3 SignedData\0'), u32(signedData.length), signedData, zip]), key);
const header = Buffer.concat([field(2, Buffer.concat([field(1, pub), field(2, signature)])), field(10000, signedData)]);
fs.writeFileSync(path.join(out, 'sifi-youtube.crx'), Buffer.concat([Buffer.from('Cr24'), u32(3), u32(header.length), header, zip]));
const id = [...digest.toString('hex')].map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
fs.writeFileSync(path.join(out, 'sifi-youtube-build.json'), JSON.stringify({ id, version: JSON.parse(fs.readFileSync(path.join(root,'extension/manifest.json'))).version }, null, 2)+'\n');
console.log(`Built SIFI YouTube Focus: ${id}`);
