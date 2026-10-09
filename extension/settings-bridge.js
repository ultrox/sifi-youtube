(() => {
  // Keep this script self-contained: the Android extension loader deduplicates
  // a shared script filename even when it is listed in two execution worlds.
  const normalize = value => ({ recommendationsCacheHours: Number.isInteger(value?.recommendationsCacheHours) ? Math.min(168, Math.max(1, value.recommendationsCacheHours)) : 24, pageDelayMs: Number.isInteger(value?.pageDelayMs) ? Math.min(10000, Math.max(500, value.pageDelayMs)) : 900, ...Object.fromEntries(
    ['recommendationsCache', 'subscriptionsGrouping', 'homeEditions', 'subscriptionsEditions', 'shortsLock', 'subscriptionsHome', 'channelVideos', 'homePagination', 'subscriptionsPagination', 'recommendationsPagination'].map(key =>
      [key, typeof value?.[key] === 'boolean' ? value[key] : true])),
    ...Object.fromEntries(Object.entries({pageLimit: 6, homePageSize: 10, subscriptionsPageSize: 10, recommendationsPageSize: 5}).map(([key, fallback]) => [key, Number.isInteger(value?.[key]) ? Math.min(30, Math.max(1, value[key])) : fallback])) });
  let values = normalize();
  let loaded = false;
  function publish() {
    if (!loaded) return;
    document.documentElement?.setAttribute('data-sifi-shorts-lock', String(values.shortsLock));
    window.dispatchEvent(new CustomEvent('sifi-youtube-settings', { detail: values }));
  }
  window.addEventListener('sifi-youtube-ready', publish);
  document.addEventListener('DOMContentLoaded', publish, { once: true });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.settings) return;
    values = normalize(changes.settings.newValue);
    loaded = true;
    publish();
  });
  chrome.storage.local.get('settings', result => {
    if (chrome.runtime.lastError) console.warn('SIFI YouTube: settings unavailable; using defaults.');
    if (!loaded) values = normalize(result?.settings);
    loaded = true;
    publish();
  });
})();
