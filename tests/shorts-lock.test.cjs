const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../extension/shorts-lock.js'), 'utf8');

function browser(route = '/shorts/first') {
  const handlers = new Map();
  class Element {
    constructor(exempt = false) { this.exempt = exempt; }
    closest() { return this.exempt ? this : null; }
  }
  const location = { pathname: route };
  const context = { Element, location, window: {
    addEventListener(type, handler, options) {
      if (type === 'sifi-youtube-settings') { handlers.set(type, handler); return; }
      assert.equal(options.capture, true);
      assert.equal(options.passive, false);
      handlers.set(type, handler);
    },
  } };
  vm.runInNewContext(source, context);
  function fire(type, properties = {}) {
    const target = properties.target || new Element();
    const event = {
      target, cancelable: true, defaultPrevented: false, stopped: false,
      clientX: 100, clientY: 400, isPrimary: true, buttons: 1,
      touches: [{ clientX: 100, clientY: 400 }],
      composedPath: () => [target],
      preventDefault() { this.defaultPrevented = true; },
      stopImmediatePropagation() { this.stopped = true; },
      ...properties,
    };
    handlers.get(type)(event);
    return event;
  }
  return { fire, location, Element };
}

test('up and down swipes cannot reach carousel move or release handlers', () => {
  for (const end of [100, 700]) {
    const { fire } = browser();
    assert.equal(fire('touchstart').stopped, true);
    const move = fire('touchmove', { touches: [{ clientX: 100, clientY: end }] });
    assert.equal(move.defaultPrevented, true);
    assert.equal(move.stopped, true);
    assert.equal(fire('touchend', { touches: [] }).stopped, true);
    assert.equal(fire('click').stopped, true, 'no synthetic click from a cancelled swipe');
    fire('touchstart');
    assert.equal(fire('touchend', { touches: [] }).stopped, false);
    assert.equal(fire('click').stopped, false, 'next deliberate tap works');
  }
});

test('the saved toggle disables all gesture interception immediately and can re-enable it', () => {
  const { fire } = browser();
  fire('touchstart');
  fire('sifi-youtube-settings', { detail: { shortsLock: false } });
  assert.equal(fire('touchmove').stopped, false);
  assert.equal(fire('wheel').stopped, false);
  assert.equal(fire('keydown', { key: 'ArrowDown' }).stopped, false);
  fire('sifi-youtube-settings', { detail: { shortsLock: true } });
  assert.equal(fire('wheel').stopped, true);
});

test('pointer dragging is blocked but a stationary tap still works', () => {
  const { fire } = browser();
  fire('pointerdown');
  assert.equal(fire('pointermove', { clientY: 100 }).stopped, true);
  assert.equal(fire('pointerup').stopped, true);
  fire('pointerdown');
  assert.equal(fire('pointerup').stopped, false);
  assert.equal(fire('click').stopped, false);
});

test('wheel and key down/up cannot change Shorts; playback and browser keys remain', () => {
  const { fire } = browser();
  assert.equal(fire('wheel', { deltaY: 900 }).defaultPrevented, true);
  assert.equal(fire('wheel', { deltaY: -900 }).defaultPrevented, true);
  assert.equal(fire('wheel', { ctrlKey: true }).stopped, false);
  for (const type of ['keydown', 'keyup']) {
    for (const key of ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']) {
      assert.equal(fire(type, { key }).stopped, true);
    }
    for (const key of [' ', 'k', 'Escape', 'ArrowLeft', 'ArrowRight']) {
      assert.equal(fire(type, { key }).stopped, false);
    }
    assert.equal(fire(type, { key: 'Home', metaKey: true }).stopped, false);
  }
});

test('comments, dialogs and editing controls retain their gestures', () => {
  const { fire, Element } = browser();
  const target = new Element(true);
  fire('touchstart', { target });
  assert.equal(fire('touchmove', { target }).stopped, false);
  assert.equal(fire('touchend', { target }).stopped, false);
  assert.equal(fire('wheel', { target }).stopped, false);
  assert.equal(fire('keydown', { target, key: 'ArrowDown' }).stopped, false);
});

test('SPA exit, Back and re-entry do not leave scrolling locked elsewhere', () => {
  const { fire, location } = browser('/');
  assert.equal(fire('wheel').stopped, false);
  location.pathname = '/shorts/first';
  assert.equal(fire('wheel').stopped, true);
  fire('touchstart');
  location.pathname = '/watch';
  assert.equal(fire('touchmove').stopped, false);
  assert.equal(fire('wheel').stopped, false);
  location.pathname = '/shorts/second';
  assert.equal(fire('wheel').stopped, true);
  location.pathname = '/@creator/shorts';
  assert.equal(fire('wheel').stopped, false);
});

test('non-cancelable and cancelled touches do not throw or poison the next tap', () => {
  const { fire } = browser();
  assert.equal(fire('wheel', { cancelable: false }).stopped, true);
  fire('touchstart');
  fire('touchcancel');
  assert.equal(fire('touchmove').stopped, false);
  fire('touchstart');
  assert.equal(fire('touchend').stopped, false);
});
