(() => {
  'use strict';

  const panelSelector = [
    'ytm-engagement-panel',
    'ytd-engagement-panel-section-list-renderer',
    '[role="dialog"]',
    '[role="menu"]',
    'dialog',
    'tp-yt-paper-dialog',
    'ytm-bottom-sheet-renderer .bottom-sheet-container',
  ].join(',');
  const controlSelector = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"]';
  const scrollKeys = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']);
  const listenerOptions = { capture: true, passive: false };
  let touch = null;
  let pointer = null;
  let suppressClickUntil = 0;
  let enabled = true;
  window.addEventListener('sifi-youtube-settings', event => {
    enabled = event.detail?.shortsLock !== false;
    if (!enabled) { touch = null; pointer = null; suppressClickUntil = 0; }
  });

  // Consult the route on each event: SPA entry, Back and exit need no observers,
  // polling, history interception, layout reads, or replacement player.
  const inShorts = () => enabled && /^\/shorts\/[^/]+\/?$/.test(location.pathname);
  const element = event => event.composedPath().find(node => node instanceof Element);
  const exempt = event => !!element(event)?.closest(`${panelSelector},${controlSelector}`);
  const blockedSurface = event => inShorts() && !exempt(event);

  function stop(event) {
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
  }

  function start(event, point) {
    return point && blockedSurface(event)
      ? { x: point.clientX, y: point.clientY, moved: false, route: location.pathname }
      : null;
  }

  function move(event, point, gesture) {
    if (!gesture || gesture.route !== location.pathname || !point) return;
    if (Math.hypot(point.clientX - gesture.x, point.clientY - gesture.y) > 6) {
      gesture.moved = true;
      suppressClickUntil = Date.now() + 700;
    }
    // Even the first move is stopped, before YouTube starts dragging its carousel.
    stop(event);
  }

  function end(event, gesture) {
    // YouTube can navigate from release velocity even with touchmove blocked.
    // A genuine tap still reaches play/pause, Back and the other native buttons.
    if (gesture?.moved && gesture.route === location.pathname) stop(event);
  }

  window.addEventListener('touchstart', event => {
    suppressClickUntil = 0;
    touch = start(event, event.touches[0]);
    // Do not arm YouTube's drag/long-press recognizer. Keep the browser's
    // default handling so an actual tap can still generate its native click.
    if (touch) event.stopImmediatePropagation();
  }, listenerOptions);
  window.addEventListener('touchmove', event => move(event, event.touches[0], touch), listenerOptions);
  window.addEventListener('touchend', event => {
    end(event, touch);
    touch = null;
  }, listenerOptions);
  window.addEventListener('touchcancel', () => { touch = null; }, listenerOptions);

  window.addEventListener('pointerdown', event => {
    suppressClickUntil = 0;
    pointer = event.isPrimary ? start(event, event) : null;
    if (pointer) event.stopImmediatePropagation();
  }, listenerOptions);
  window.addEventListener('pointermove', event => {
    if (event.isPrimary && event.buttons) move(event, event, pointer);
  }, listenerOptions);
  window.addEventListener('pointerup', event => {
    end(event, pointer);
    pointer = null;
  }, listenerOptions);
  window.addEventListener('pointercancel', () => { pointer = null; }, listenerOptions);

  // Some mobile builds synthesize a click after a cancelled drag. Do not turn
  // that swipe into a click on a caption/link under the finger. A new tap resets it.
  window.addEventListener('click', event => {
    if (inShorts() && Date.now() < suppressClickUntil) stop(event);
  }, listenerOptions);

  window.addEventListener('wheel', event => {
    if (!blockedSurface(event) || event.ctrlKey) return; // Keep browser zoom.
    stop(event);
  }, listenerOptions);
  for (const type of ['keydown', 'keyup']) {
    window.addEventListener(type, event => {
      if (blockedSurface(event) && scrollKeys.has(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) stop(event);
    }, listenerOptions);
  }
})();
