const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function browser() {
  const handlers = new Map();
  const frames = [];
  const calls = [];
  const player = { unMute: () => calls.push('unmute'), mute: () => calls.push('mute'), setVolume: value => calls.push(value) };
  const video = { muted: true, volume: 1, paused: false, closest: () => player };
  let button;
  const location = { pathname: '/shorts/one' };
  const listen = (type, fn) => handlers.set(type, fn);
  const context = {
    location, requestAnimationFrame: fn => frames.push(fn),
    window: { addEventListener: listen },
    document: {
      addEventListener: listen,
      querySelector: () => video,
      body: { appendChild(node) { node.isConnected = true; } },
      createElement() {
        button = {
          dataset: {}, attrs: {}, isConnected: false,
          setAttribute(key, value) { this.attrs[key] = value; },
          addEventListener(_, fn) { this.click = () => fn({ preventDefault() {}, stopPropagation() {} }); },
          remove() { this.isConnected = false; },
        };
        return button;
      },
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../extension/shorts-audio.js'), 'utf8'), context);
  const flush = () => { while (frames.length) frames.shift()(); };
  flush();
  return { video, button, calls, location, event(type, detail) { handlers.get(type)({ detail }); flush(); } };
}

test('the sound control stays available while muted without automatically enabling audio', () => {
  const b = browser();
  assert.equal(b.video.muted, true);
  assert.equal(b.button.isConnected, true);
  assert.equal(b.button.textContent, 'Sound off');
  assert.deepEqual(b.calls, []);
  b.button.click();
  assert.equal(b.video.muted, false);
  assert.equal(b.button.textContent, 'Sound on');
  assert.deepEqual(b.calls, ['unmute']);
  b.button.click();
  assert.equal(b.video.muted, true);
  assert.deepEqual(b.calls, ['unmute', 'mute']);
});

test('sound changes preserve pause state and recover from zero volume', () => {
  const b = browser(); b.video.paused = true; b.video.volume = 0;
  b.button.click();
  assert.equal(b.video.paused, true);
  assert.equal(b.video.volume, 1);
  assert.equal(b.video.muted, false);
  assert.deepEqual(b.calls, [100, 'unmute']);
});

test('external mute changes update the button and leaving Shorts removes it', () => {
  const b = browser(); b.video.muted = false; b.event('volumechange');
  assert.equal(b.button.textContent, 'Sound on');
  b.location.pathname = '/'; b.event('sifi-youtube-route');
  assert.equal(b.button.isConnected, false);
  b.location.pathname = '/shorts/two'; b.video.muted = true; b.event('sifi-youtube-route');
  assert.equal(b.button.isConnected, true);
  assert.equal(b.button.textContent, 'Sound off');
  b.event('sifi-youtube-settings', { shortsLock: false });
  assert.equal(b.button.isConnected, false);
  b.event('sifi-youtube-settings', { shortsLock: true });
  assert.equal(b.button.isConnected, true);
});
