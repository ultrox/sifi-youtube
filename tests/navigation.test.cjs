const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function browser(initialPath = '/', restored = false) {
  const listeners = new Map();
  const jobs = [];
  const timers = new Map();
  const clicks = [];
  let nextTimer = 0;
  let ready = true;
  let renderedChannel = '/@creator';
  const location = { pathname: initialPath, href: `https://m.youtube.com${initialPath}` };
  function fire(type, event = {}) { for (const handler of listeners.get(type) || []) handler(event); }
  function listen(type, fn) { listeners.set(type, [...listeners.get(type) || [], fn]); }
  class Element { closest() { return this; } }
  const history = { pushState(_, __, url) { location.pathname = new URL(url, location.href).pathname; location.href = `https://m.youtube.com${location.pathname}`; } };
  history.replaceState = history.pushState;
  const tab = destination => ({
    getAttribute: () => 'Vidéos', textContent: 'Vidéos',
    click() { clicks.push(destination); history.pushState(null, '', destination); },
  });
  const document = {
    addEventListener: listen,
    querySelector(selector) {
      if (!ready) return null;
      if (selector.includes('pivot-subs')) return tab('/feed/subscriptions');
      if (selector === 'ytm-browse, ytd-browse') return { data: { contents: { singleColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: {
        title: 'Vidéos', endpoint: { commandMetadata: { webCommandMetadata: { url: `${renderedChannel}/videos` } } },
      } }] } } } };
      return null;
    },
    querySelectorAll(selector) { return ready && selector === 'yt-tab-shape, tp-yt-paper-tab' ? [tab(`${renderedChannel}/videos`)] : []; },
  };
  const context = { URL, Element, Event: class {}, document, location, history,
    performance: { getEntriesByType: () => [{ type: restored ? 'back_forward' : 'navigate' }] },
    window: { addEventListener: listen, dispatchEvent() {} },
    queueMicrotask: fn => jobs.push(fn),
    setTimeout: fn => { timers.set(++nextTimer, fn); return nextTimer; },
    clearTimeout: id => timers.delete(id),
  };
  for (const file of ['settings-model.js', 'navigation.js']) vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../extension', file), 'utf8'), context);
  const flush = () => { while (jobs.length) jobs.shift()(); };
  const settings = (detail = {}) => { fire('sifi-youtube-settings', { detail }); flush(); };
  const go = url => { history.pushState(null, '', url); flush(); };
  const back = url => { location.pathname = url; fire('popstate'); fire('yt-navigate-finish'); flush(); };
  const retry = () => { const pending = [...timers.values()]; timers.clear(); for (const fn of pending) fn(); flush(); };
  return { settings, go, back, retry, clicks, location, timers,
    ready: value => { ready = value; },
    channel: value => { renderedChannel = value; },
    manualTab: () => fire('click', { composedPath: () => [new Element()] }),
  };
}

test('initial Home defaults once; manual Home visits and Back remain on Home', () => {
  const b = browser();
  b.settings();
  assert.deepEqual(b.clicks, ['/feed/subscriptions']);
  b.go('/watch'); b.back('/');
  assert.deepEqual(b.clicks, ['/feed/subscriptions']);
  b.go('/watch'); b.go('/');
  assert.equal(b.clicks.length, 1);
  assert.equal(b.location.pathname, '/');
  b.settings();
  assert.equal(b.clicks.length, 1, 'settings publication must not re-arm the default');
});

test('opening a video first never hijacks its later Home navigation', () => {
  const b = browser('/watch'); b.settings(); b.go('/');
  assert.equal(b.clicks.length, 0);
});

test('initial Home waits for tabs, but leaving before they mount cancels the default', () => {
  const b = browser(); b.ready(false); b.settings(); b.ready(true); b.retry();
  assert.deepEqual(b.clicks, ['/feed/subscriptions']);
  const left = browser(); left.ready(false); left.settings(); left.go('/watch');
  left.ready(true); left.go('/'); left.retry();
  assert.equal(left.clicks.length, 0);
});

test('a new Home document defaults again, but enabling the setting does not move the current page', () => {
  const fresh = browser(); fresh.settings();
  assert.deepEqual(fresh.clicks, ['/feed/subscriptions']);
  const disabled = browser(); disabled.settings({ subscriptionsHome: false }); disabled.settings();
  assert.equal(disabled.clicks.length, 0);
});

test('channels use endpoint metadata even with translated tab text; manual choices survive', () => {
  const b = browser('/@creator'); b.settings();
  assert.deepEqual(b.clicks, ['/@creator/videos']);
  b.manualTab(); b.go('/@creator/shorts');
  assert.equal(b.clicks.length, 1);
  b.manualTab(); b.go('/@creator');
  assert.equal(b.clicks.length, 1);
  b.go('/watch'); b.go('/@creator');
  assert.equal(b.clicks.length, 2);
});

test('delayed tabs are retried briefly, never clicking stale channel tabs', () => {
  const b = browser('/@creator'); b.ready(false); b.settings();
  assert.equal(b.clicks.length, 0);
  b.ready(true); b.channel('/@other'); b.retry();
  assert.equal(b.clicks.length, 0);
  b.channel('/@creator'); b.retry();
  assert.deepEqual(b.clicks, ['/@creator/videos']);
  assert.equal(b.timers.size, 0);
});

test('missing tabs stop retries; disabled defaults and restored documents do not navigate', () => {
  const missing = browser('/@creator'); missing.ready(false); missing.settings();
  for (let n = 0; n < 45; n++) missing.retry();
  assert.equal(missing.timers.size, 0);
  assert.equal(missing.clicks.length, 0);
  const disabled = browser(); disabled.settings({ subscriptionsHome: false });
  assert.equal(disabled.clicks.length, 0);
  const restored = browser('/', true); restored.settings();
  assert.equal(restored.clicks.length, 0);
});
