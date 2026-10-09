(() => {
  const defaults = Object.freeze({ shortsLock: true, subscriptionsHome: true, channelVideos: true,
    homePagination: true, subscriptionsPagination: true, recommendationsPagination: true, pageDelayMs: 900, pageLimit: 6, homePageSize: 10, subscriptionsPageSize: 10, recommendationsPageSize: 5 });
  function normalize(value) {
    return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) =>
      [key, key === 'pageDelayMs' ? (Number.isInteger(value?.[key]) ? Math.min(10000, Math.max(500, value[key])) : 900)
        : typeof fallback === 'number' ? (Number.isInteger(value?.[key]) ? Math.min(30, Math.max(1, value[key])) : fallback)
        : typeof value?.[key] === 'boolean' ? value[key] : fallback]));
  }
  function channelBase(path) {
    return path.match(/^\/(?:@[^/]+|(?:channel|c|user)\/[^/]+)(?=\/|$)/)?.[0] || null;
  }
  function destination(path, settings) {
    if (settings.subscriptionsHome && path === '/') return '/feed/subscriptions';
    const base = channelBase(path);
    if (settings.channelVideos && base && (path === base || path === `${base}/`)) return `${base}/videos`;
    return null;
  }
  globalThis.SifiYouTubeSettings = { defaults, normalize, channelBase, destination };
})();
