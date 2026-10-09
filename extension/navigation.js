(() => {
  const model = SifiYouTubeSettings;
  let settings = null;
  let handledPath = null;
  let waitingPath = null;
  let manualChannel = null;
  let attempts = 0;
  let timer = null;
  let selecting = false;
  const restored = performance.getEntriesByType('navigation')[0]?.type === 'back_forward';
  // A landing default, not a restriction on Home. Never re-arm within this
  // document after navigation, Back, a manual Home click, or a settings change.
  let explicitEdition = false;
  try {
    const requested = Number(sessionStorage.getItem('sifi.youtube.edition.keep-home'));
    explicitEdition = requested > 0 && Date.now() - requested >= 0 && Date.now() - requested < 30000;
    sessionStorage.removeItem('sifi.youtube.edition.keep-home');
  } catch { /* Storage is optional for normal navigation defaults. */ }
  let homeDefaultPending = location.pathname === '/' && !restored && !explicitEdition;

  function cancelRetry() {
    clearTimeout(timer);
    timer = null;
  }

  function findTab(target) {
    if (target === '/feed/subscriptions') {
      return document.querySelector('.pivot-bar-item-tab.pivot-subs, a[href="/feed/subscriptions"]');
    }
    // Prefer destinations to translated text; modern mobile tabs omit their URL.
    const linked = [...document.querySelectorAll('yt-tab-shape a[href], [role="tab"] a[href], a[role="tab"][href]')]
      .find(a => { try { return new URL(a.href, location.href).pathname === target; } catch { return false; } });
    if (linked) return linked;
    const browse = document.querySelector('ytm-browse, ytd-browse');
    const contents = browse?.data?.contents || window.ytInitialData?.contents;
    const tabs = contents?.singleColumnBrowseResultsRenderer?.tabs || contents?.twoColumnBrowseResultsRenderer?.tabs || [];
    const videoTab = tabs.map(t => t.tabRenderer).find(tab =>
      tab?.endpoint?.commandMetadata?.webCommandMetadata?.url === target);
    if (!videoTab) {
      // Mobile may discard element data after mounting. Only use visible tab
      // labels once the canonical URL confirms this is the requested channel.
      const canonical = document.querySelector('link[rel="canonical"]')?.href;
      if (!canonical || model.channelBase(new URL(canonical, location.href).pathname) !== model.channelBase(target)) return null;
      return document.querySelector('yt-tab-shape[tab-title="Videos"], yt-tab-shape[tab-title="Vídeos"], yt-tab-shape[tab-title="Vidéos"]');
    }
    return [...document.querySelectorAll('yt-tab-shape, tp-yt-paper-tab')]
      .find(tab => (tab.getAttribute('tab-title') || tab.textContent.trim()) === videoTab.title) || null;
  }

  function applyDefault() {
    cancelRetry();
    const path = location.pathname;
    if (!settings || handledPath === path) return;
    if (path === '/' && !homeDefaultPending) return;
    if (manualChannel === path || manualChannel === path.replace(/\/$/, '')) {
      handledPath = path;
      manualChannel = null;
      return;
    }
    const target = model.destination(path, settings);
    if (!target) return;
    if (waitingPath !== path) { waitingPath = path; attempts = 0; }
    const tab = findTab(target);
    if (tab) {
      if (target === '/feed/subscriptions') homeDefaultPending = false;
      handledPath = path;
      selecting = true;
      try { tab.click(); } finally { selecting = false; }
      return;
    }
    // Only retry briefly while a destination page mounts. No observers or
    // permanent polling over video lists, comments, or the Shorts carousel.
    if (++attempts < 40) timer = setTimeout(applyDefault, 200);
  }

  window.addEventListener('sifi-youtube-settings', event => {
    settings = model.normalize(event.detail);
    if (!settings.subscriptionsHome) homeDefaultPending = false;
    applyDefault();
  });
  window.addEventListener('click', event => {
    if (selecting) return;
    const node = event.composedPath().find(n => n instanceof Element);
    if (node?.closest('.pivot-bar-item-tab.pivot-w2w, a[href="/"], a[href="https://www.youtube.com/"], a[href="https://m.youtube.com/"]')) {
      homeDefaultPending = false;
    }
    if (node?.closest('yt-tab-shape, tp-yt-paper-tab')) {
      manualChannel = model.channelBase(location.pathname);
    }
  }, true);
  window.addEventListener('popstate', () => {
    // Back restores the exact page/tab the user left, without another default.
    handledPath = location.pathname;
    homeDefaultPending = false;
    manualChannel = null;
    waitingPath = null;
    cancelRetry();
    window.dispatchEvent(new Event('sifi-youtube-route'));
  });
  for (const name of ['pushState', 'replaceState']) {
    const original = history[name];
    history[name] = function (...args) {
      const previous = location.pathname;
      const result = original.apply(this, args);
      if (location.pathname !== previous) {
        window.dispatchEvent(new Event('sifi-youtube-route'));
        homeDefaultPending = false;
        handledPath = null;
        waitingPath = null;
        if (manualChannel && location.pathname.replace(/\/$/, '') !== manualChannel) manualChannel = null;
        queueMicrotask(applyDefault);
      }
      return result;
    };
  }
  document.addEventListener('yt-navigate-finish', applyDefault);
  document.addEventListener('DOMContentLoaded', applyDefault, { once: true });
  if (restored) handledPath = location.pathname;
  window.dispatchEvent(new Event('sifi-youtube-ready'));
})();
