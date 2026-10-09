((root, factory) => {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SifiYouTubeEditionsCore = factory();
})(globalThis, () => {
  const HOURS = [8, 13, 18];
  const LABELS = ['Morning', 'Afternoon', 'Evening'];
  const PREFIX = 'sifi-yt-edition:';
  const clone = value => JSON.parse(JSON.stringify(value));
  function windowAt(now = Date.now()) {
    const date = new Date(now);
    let index = HOURS.findLastIndex(hour => hour <= date.getHours());
    if (index < 0) { date.setDate(date.getDate() - 1); index = 2; }
    date.setHours(HOURS[index], 0, 0, 0);
    const next = new Date(date);
    if (index === 2) next.setDate(next.getDate() + 1);
    next.setHours(HOURS[(index + 1) % 3], 0, 0, 0);
    return { id: String(date.getTime()), startsAt: +date, nextAt: +next, label: LABELS[index] };
  }
  function feed(path) { return path === '/' ? 'home' : path === '/feed/subscriptions' ? 'subscriptions' : null; }
  function browseFeed(body) { return body?.browseId === 'FEwhat_to_watch' ? 'home' : body?.browseId === 'FEsubscriptions' ? 'subscriptions' : null; }
  function grid(data) {
    const tabs = data?.contents?.singleColumnBrowseResultsRenderer?.tabs;
    return tabs?.find(t => t.tabRenderer?.selected)?.tabRenderer?.content?.richGridRenderer ||
      tabs?.find(t => t.tabRenderer?.content?.richGridRenderer)?.tabRenderer?.content?.richGridRenderer || null;
  }
  function batch(data) {
    const actions = [...data?.onResponseReceivedActions || [], ...data?.onResponseReceivedEndpoints || []];
    return actions.map(a => a.appendContinuationItemsAction || a.reloadContinuationItemsCommand).find(a => Array.isArray(a?.continuationItems));
  }
  function items(contents) { return (contents || []).filter(item => item.richItemRenderer || item.richSectionRenderer); }
  function cursor(contents) {
    const item = contents?.find(item => item.continuationItemRenderer)?.continuationItemRenderer;
    return item?.continuationEndpoint?.continuationCommand?.token || null;
  }
  function frozen(item) {
    const copy = clone(item);
    // Preserve every Short in a shelf, but prevent nested continuation requests
    // from extending or reshuffling that saved shelf later.
    function strip(value) {
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        if (key === 'continuations') { delete value[key]; continue; }
        if (Array.isArray(child)) value[key] = child.filter(x => !x?.continuationItemRenderer);
        if (key === 'continuationEndpoint') { delete value[key]; continue; }
        strip(value[key]);
      }
    }
    strip(copy);
    return copy;
  }
  function channel(item) {
    const content = item?.richItemRenderer?.content;
    const video = content?.videoWithContextRenderer || content?.videoRenderer;
    if (!video) return null;
    const runs = video.shortBylineText?.runs || video.ownerText?.runs || video.longBylineText?.runs || [];
    const owner = runs.find(run => /^UC[\w-]+$/.test(run.navigationEndpoint?.browseEndpoint?.browseId || ''));
    return owner ? {id: owner.navigationEndpoint.browseEndpoint.browseId, name: owner.text || 'this channel'} : null;
  }
  function groupSubscriptions(items) {
    const groups = [], channels = new Map();
    items.forEach((item, index) => {
      const owner = channel(item);
      let group = owner && channels.get(owner.id);
      if (!group) {
        group = {key: owner?.id || `item:${index}`, items:[]};
        groups.push(group);
        if (owner) channels.set(owner.id, group);
      }
      group.items.push(item);
    });
    return {items: groups.flatMap(group => group.items.map(item => {
      const copy = clone(item);
      copy.sifiGroupKey = group.key;
      return copy;
    })), groupCount: groups.length};
  }
  function token(id, offset) { return PREFIX + encodeURIComponent(id) + ':' + offset; }
  function parseToken(value) {
    if (typeof value !== 'string' || !value.startsWith(PREFIX)) return null;
    const match = value.slice(PREFIX.length).match(/^(.*):(\d+)$/);
    if (!match) return null;
    try { return { id: decodeURIComponent(match[1]), offset: Number(match[2]) }; } catch { return null; }
  }
  function continuation(id, offset) {
    return { continuationItemRenderer: { trigger: 'CONTINUATION_TRIGGER_ON_ITEM_SHOWN', continuationEndpoint: {
      commandMetadata: { webCommandMetadata: { sendPost: true, apiUrl: '/youtubei/v1/browse' } },
      continuationCommand: { token: token(id, offset), request: 'CONTINUATION_REQUEST_TYPE_BROWSE' },
    } } };
  }
  function page(record, offset, count = 30) {
    let end = Math.min(record.items.length, offset + count);
    // Never split a channel across replay batches: its disclosure must contain
    // every saved upload without triggering another request on expansion.
    while (end < record.items.length && record.items[end - 1]?.sifiGroupKey && record.items[end].sifiGroupKey === record.items[end - 1].sifiGroupKey) end++;
    const result = record.items.slice(offset, end).map(clone);
    if (offset + result.length < record.items.length) result.push(continuation(record.id, offset + result.length));
    return result;
  }
  function seedPayload(record) {
    const payload = clone(record.payload);
    const target = grid(payload);
    target.contents = record.items.slice(0, 1).map(clone);
    // Even a one-item edition hydrates once, so the record is validated in IDB.
    target.contents.push(continuation(record.id, target.contents.length));
    return payload;
  }
  return { HOURS, LABELS, clone, windowAt, feed, browseFeed, grid, batch, items, cursor, frozen, channel, groupSubscriptions, token, parseToken, continuation, page, seedPayload };
});
