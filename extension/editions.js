(() => {
  'use strict';
  if (location.hostname !== 'm.youtube.com') return;
  const core = SifiYouTubeEditionsCore;
  const store = SifiYouTubeEditionStore;
  const nativeFetch = window.fetch.bind(window);
  const SETTINGS = 'sifi.youtube.edition.settings.v1';
  let settings;
  try { settings = SifiYouTubeSettings.normalize(JSON.parse(localStorage.getItem(SETTINGS) || '{}')); }
  catch { settings = SifiYouTubeSettings.normalize(); }
  let visit = core.windowAt();
  let routeFeed = core.feed(location.pathname);
  const sessions = new Map();
  const records = new Map();
  const jobs = new Map();
  const presentations = new WeakMap();
  function presentation(record) {
    if (record.feed !== 'subscriptions' || !current(record.feed)?.grouped) return record;
    if (!presentations.has(record)) presentations.set(record, {...record, ...core.groupSubscriptions(record.items)});
    return presentations.get(record);
  }
  let boundaryTimer;

  function owner() {
    const cfg = window.ytcfg;
    if (!cfg?.get) return null;
    if (!cfg.get('LOGGED_IN')) return 'guest';
    const id = cfg.get('DATASYNC_ID') || cfg.get('DELEGATED_SESSION_ID');
    return typeof id === 'string' && id.length > 0 && id.length < 200 ? encodeURIComponent(id) : null;
  }
  function enabled(feed) { return !!feed && settings[`${feed}Editions`] && settings[`${feed}Pagination`]; }
  function current(feed) {
    const session = sessions.get(feed);
    return session?.owner === owner() ? session : null;
  }
  function notify() {
    window.dispatchEvent(new Event('sifi-youtube-edition'));
    clearTimeout(boundaryTimer);
    const session = current(core.feed(location.pathname));
    if (session && session.slot.nextAt > Date.now()) boundaryTimer = setTimeout(notify, session.slot.nextAt - Date.now() + 50);
  }
  function state(feed) {
    if (!enabled(feed)) return null;
    const session = current(feed);
    if (!session) return null;
    const next = new Date(session.slot.nextAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    return { label: `${session.slot.label} edition`, detail: session.error || (session.loading
      ? `Saving edition${session.count ? ` · ${session.count} items` : '…'}`
      : `Saved · Next edition ${next}`), available: Date.now() >= session.slot.nextAt,
      loading: session.loading, error: session.error || '', count: session.groupCount ?? session.count ?? 0, grouped: !!session.grouped };
  }
  function select(feed, data) {
    const account = owner();
    const target = core.grid(data);
    if (!account || !target || !enabled(feed)) return data;
    // YouTube may assign the JSON string and then its parsed object.
    const saved = store.bootstrap(account, feed);
    let record = saved && saved.slot.startsAt >= visit.startsAt ? saved : store.pending(account, feed, visit);
    if (!record) {
      const initial = core.items(target.contents).map(core.frozen);
      const payload = core.clone(data);
      delete payload.responseContext;
      const capacity = Math.min(900, settings.pageLimit * SifiYouTubePages.pageSize(feed, settings));
      record = store.begin({ schema: 1, id: `${account}|${feed}|${visit.id}`, owner: account, feed,
        slot: visit, capturedAt: Date.now(), capacity, payload,
        items: initial.slice(0, capacity), cursor: core.cursor(target.contents), complete: false });
    }
    records.set(record.id, record);
    sessions.set(feed, { owner: account, id: record.id, slot: record.slot, loading: !record.complete,
      hydrate: true, grouped: feed === 'subscriptions' && settings.subscriptionsGrouping, count: record.complete ? record.count : record.items.length });
    // Keep current account/player/topbar context, replacing only the feed grid.
    const rendered = core.clone(data);
    Object.assign(core.grid(rendered), core.grid(core.seedPayload(record)));
    queueMicrotask(notify);
    return rendered;
  }
  function bootstrap(value) {
    const feed = core.feed(location.pathname);
    if (!enabled(feed)) return value;
    try {
      const data = typeof value === 'string' ? JSON.parse(value) : value;
      const result = select(feed, data);
      return typeof value === 'string' ? JSON.stringify(result) : result;
    } catch (error) {
      // Do not present a silently refreshed feed if durable storage is unavailable.
      const data = typeof value === 'string' ? JSON.parse(value) : value;
      const target = core.grid(data);
      if (!target) return value;
      const account = owner();
      sessions.set(feed, {owner: account, slot: visit, loading:false, error:'Edition storage is unavailable. Reload to retry.'});
      target.contents = core.items(target.contents).slice(0, 1);
      queueMicrotask(notify);
      return typeof value === 'string' ? JSON.stringify(data) : data;
    }
  }
  const descriptor = Object.getOwnPropertyDescriptor(window, 'ytInitialData');
  if (!descriptor || descriptor.configurable) {
    let value = descriptor?.value;
    Object.defineProperty(window, 'ytInitialData', { configurable: true, enumerable: true,
      get: () => value, set: next => { value = bootstrap(next); } });
    if (value) value = bootstrap(value);
  }

  async function bodyOf(request) {
    const copy = request.clone();
    if (copy.headers.get('content-encoding') === 'gzip') {
      return new Response(copy.body.pipeThrough(new DecompressionStream('gzip'))).json();
    }
    return copy.json();
  }
  function response(data) { return new Response(JSON.stringify(data), { status:200, headers:{'content-type':'application/json; charset=utf-8'} }); }
  function checkOwner(account) { if (owner() !== account) throw new DOMException('Account changed', 'AbortError'); }
  async function capture(seed, request, body) {
    const account = seed.owner;
    checkOwner(account);
    const existing = await store.get(seed.id);
    if (existing?.complete) return existing;
    const record = core.clone(seed);
    record.items = record.items.map(core.frozen);
    const seen = new Set();
    const started = performance.now();
    while (record.cursor && record.items.length < record.capacity) {
      if (seen.has(record.cursor)) throw new Error('YouTube repeated a feed page. Reload to retry this edition.');
      if (performance.now() - started > 120000) throw new Error('Edition capture timed out. Reload to retry.');
      seen.add(record.cursor);
      const nextBody = {context: body.context || window.ytcfg?.get('INNERTUBE_CONTEXT'), continuation: record.cursor};
      const headers = new Headers(request.headers);
      headers.delete('content-encoding'); headers.delete('content-length');
      headers.set('content-type', 'application/json');
      const result = await nativeFetch(request.url, {method:'POST', headers, credentials:'include',
        body:JSON.stringify(nextBody), signal:AbortSignal.timeout(20000)});
      checkOwner(account);
      if (!result.ok) throw new Error('YouTube could not load this edition. Reload to retry.');
      const data = await result.json();
      const batch = core.batch(data);
      if (!batch) throw new Error('YouTube changed its feed response. This edition was not replaced.');
      record.items.push(...core.items(batch.continuationItems).map(core.frozen).slice(0, record.capacity - record.items.length));
      record.cursor = core.cursor(batch.continuationItems);
      const session = current(record.feed);
      if (session?.id === record.id) { session.count = record.items.length; notify(); }
    }
    record.cursor = null;
    record.complete = true;
    record.count = record.items.length;
    record.savedAt = Date.now();
    // Store one immutable capture atomically before exposing its later pages.
    await store.put(record);
    checkOwner(account);
    return record;
  }
  async function resolve(id, request, body) {
    const memory = records.get(id);
    if (memory?.complete && memory.items.length === memory.count) return memory;
    if (!jobs.has(id)) {
      const run = async () => {
        const saved = await store.get(id);
        if (saved?.complete) { checkOwner(saved.owner); return saved; }
        const seed = memory?.complete ? null : memory;
        if (!seed) throw new Error('Saved edition is unavailable. Reload to reconnect.');
        return capture(seed, request, body);
      };
      const job = navigator.locks ? navigator.locks.request(`sifi-youtube-edition:${id}`, run) : run();
      jobs.set(id, job.finally(() => jobs.delete(id)));
    }
    const record = await jobs.get(id);
    records.set(id, record);
    return record;
  }
  async function cachedContinuation(parsed, request, body) {
    const session = [...sessions.values()].find(s => s.id === parsed.id && s.owner === owner());
    if (!session) throw new Error('Edition session changed. Reload to reconnect.');
    session.error = '';
    session.loading = !records.get(parsed.id)?.complete;
    notify();
    const record = await resolve(parsed.id, request, body);
    checkOwner(record.owner);
    const displayed = presentation(record);
    session.loading = false; session.hydrate = false; session.count = record.count; session.error = '';
    session.groupCount = displayed.groupCount;
    notify();
    return response({ onResponseReceivedActions: [{appendContinuationItemsAction: {
      targetId: core.grid(record.payload).targetId,
      continuationItems: core.page(displayed, parsed.offset),
    }}] });
  }
  window.fetch = async function(input, init) {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    if (url.origin !== location.origin || url.pathname !== '/youtubei/v1/browse') return nativeFetch(input, init);
    const request = new Request(input instanceof Request ? input.clone() : input, init);
    let body;
    try { body = await bodyOf(request); } catch { return nativeFetch(input, init); }
    const parsed = core.parseToken(body.continuation);
    const feed = core.browseFeed(body);
    if (!parsed && !enabled(feed)) return nativeFetch(input, init);
    try {
      if (parsed) return await cachedContinuation(parsed, request, body);
      const account = owner();
      if (!account) return nativeFetch(input, init);
      const saved = store.bootstrap(account, feed);
      const pending = store.pending(account, feed, visit);
      const usable = saved && saved.slot.startsAt >= visit.startsAt ? saved : pending;
      if (usable) return response(select(feed, core.clone(usable.payload)));
      const result = await nativeFetch(input, init);
      if (!result.ok) return result;
      return response(select(feed, await result.json()));
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      const session = parsed ? [...sessions.values()].find(s => s.id === parsed.id) : current(feed);
      if (session) { session.loading = false; session.error = error.message || 'Edition unavailable. Reload to retry.'; notify(); }
      return new Response(JSON.stringify({error:{message:'Edition unavailable'}}),{status:503,headers:{'content-type':'application/json'}});
    }
  };
  window.addEventListener('sifi-youtube-settings', event => {
    settings = SifiYouTubeSettings.normalize(event.detail);
    try { localStorage.setItem(SETTINGS, JSON.stringify(settings)); } catch { /* Capture reports storage failures. */ }
    notify();
  });
  window.addEventListener('sifi-youtube-route', () => {
    const next = core.feed(location.pathname);
    if (next !== routeFeed) { routeFeed = next; if (next) visit = core.windowAt(); }
    notify();
  });
  globalThis.SifiYouTubeEditions = {
    state,
    openNext(feed) {
      // A deliberate Home-edition action must not invoke the landing default.
      if (feed === 'home') {
        try { sessionStorage.setItem('sifi.youtube.edition.keep-home', String(Date.now())); } catch { /* Reload remains available. */ }
      }
      location.reload();
    },
    needsHydration: feed => enabled(feed) && !!current(feed)?.hydrate,
    capturing: feed => !!current(feed)?.loading,
  };
})();
