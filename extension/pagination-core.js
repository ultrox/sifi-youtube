((root, factory) => {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SifiYouTubePages = factory();
})(globalThis, () => {
  const PAGE_SIZE = 10;
  const MAX_PAGES = 30;
  function limit(value) {
    return Number.isInteger(value) ? Math.min(MAX_PAGES, Math.max(1, value)) : 6;
  }
  function feedEntry(url) {
    if (!['m.youtube.com', 'www.youtube.com', 'youtube.com'].includes(url.hostname)) return null;
    if (url.pathname === '/') return 'home';
    if (url.pathname === '/feed/subscriptions') return 'subscriptions';
    return null;
  }
  function scope(url, settings) {
    if (url.hostname !== 'm.youtube.com') return null;
    if (url.pathname === '/' && settings.homePagination) return { key: 'home', kind: 'home', label: 'Home' };
    if (url.pathname === '/feed/subscriptions' && settings.subscriptionsPagination) return { key: 'subscriptions', kind: 'subscriptions', label: 'Subscriptions' };
    if (url.pathname === '/watch' && url.searchParams.get('v') && settings.recommendationsPagination) {
      return { key: `watch:${url.searchParams.get('v')}`, kind: 'recommendations', label: 'More videos' };
    }
    return null;
  }
  function delay(value) {
    return Number.isInteger(value) ? Math.min(10000, Math.max(500, value)) : 900;
  }
  function pageSize(kind, settings) {
    const value = settings[`${kind}PageSize`];
    return Number.isInteger(value) ? Math.min(30, Math.max(1, value)) : kind === 'recommendations' ? 5 : 10;
  }
  function view(count, page, maxPages, hasMore, size = PAGE_SIZE) {
    const cap = limit(maxPages);
    const total = Math.min(count, cap * size);
    const pages = hasMore ? cap : Math.max(1, Math.ceil(total / size));
    const current = Math.max(1, Math.min(page, pages));
    return {
      page: current, pages, total, start: (current - 1) * size,
      end: Math.min(current * size, total),
      previous: current > 1,
      next: current < cap && (current * size < total || hasMore),
      atLimit: current === cap && total >= (current - 1) * size + 1,
    };
  }
  function numbers(page, pages) {
    if (pages <= 6) return Array.from({ length: pages }, (_, i) => i + 1);
    const start = Math.max(2, Math.min(page - 1, pages - 3));
    const selected = [...new Set([1, start, start + 1, start + 2, pages])].sort((a, b) => a - b);
    const result = [];
    for (const number of selected) {
      if (result.length && number - result.at(-1) > 1) result.push('…');
      result.push(number);
    }
    return result;
  }
  return { PAGE_SIZE, MAX_PAGES, limit, delay, pageSize, feedEntry, scope, view, numbers };
});
