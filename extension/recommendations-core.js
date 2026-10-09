((root, factory) => {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SifiYouTubeRecommendationsCore = factory();
})(globalThis, () => {
  const PREFIX = 'sifi-yt-suggestions:';
  const clone = value => JSON.parse(JSON.stringify(value));
  const items = contents => (contents || []).filter(x => x.videoWithContextRenderer || x.compactVideoRenderer || x.reelShelfRenderer);
  function section(data) {
    return data?.contents?.singleColumnWatchNextResults?.results?.results?.contents
      ?.map(x => x.itemSectionRenderer).find(x => x?.targetId === 'watch-next-feed');
  }
  function batch(data) {
    return [...data?.onResponseReceivedEndpoints || [], ...data?.onResponseReceivedActions || []]
      .map(x => x.appendContinuationItemsAction || x.reloadContinuationItemsCommand)
      .find(x => x?.targetId === 'watch-next-feed' && Array.isArray(x.continuationItems));
  }
  const cursor = contents => contents?.find(x => x.continuationItemRenderer)?.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token || null;
  const video = data => data?.currentVideoEndpoint?.watchEndpoint?.videoId;
  function continuation(id, offset) {
    return {continuationItemRenderer:{trigger:'CONTINUATION_TRIGGER_ON_ITEM_SHOWN',continuationEndpoint:{
      commandMetadata:{webCommandMetadata:{sendPost:true,apiUrl:'/youtubei/v1/next'}},
      continuationCommand:{token:PREFIX+encodeURIComponent(id)+':'+offset,request:'CONTINUATION_REQUEST_TYPE_WATCH_NEXT'},
    }}};
  }
  function parse(token) {
    if (typeof token !== 'string' || !token.startsWith(PREFIX)) return null;
    const match = token.slice(PREFIX.length).match(/^(.*):(\d+)$/);
    try { return match ? {id:decodeURIComponent(match[1]),offset:Number(match[2])} : null; } catch { return null; }
  }
  function page(record, id, offset, size=30) {
    const result=clone(record.items.slice(offset,offset+size));
    if (offset+result.length<record.items.length) result.push(continuation(id,offset+result.length));
    return result;
  }
  const valid = (record, owner, id, now=Date.now()) => record?.schema===1 && record.owner===owner && record.video===id && record.expiresAt>now;
  return {clone,items,section,batch,cursor,video,continuation,parse,page,valid};
});
