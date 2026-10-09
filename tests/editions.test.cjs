const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../extension/editions-core.js');
const pages = require('../extension/pagination-core.js');
const card = id => ({richItemRenderer:{content:{videoRenderer:{videoId:id}}}});
const cursor = value => ({continuationItemRenderer:{continuationEndpoint:{continuationCommand:{token:value}}}});
const payload = (items, token='next') => ({responseContext:{fresh:true},contents:{singleColumnBrowseResultsRenderer:{tabs:[{tabRenderer:{selected:true,content:{richGridRenderer:{targetId:'browse-feedFEsubscriptions',contents:[...items,...token?[cursor(token)]:[]]}}}}]}}});
const batch = (items, token) => ({onResponseReceivedActions:[{appendContinuationItemsAction:{targetId:'browse-feedFEsubscriptions',continuationItems:[...items,...token?[cursor(token)]:[]]}}]});
function storage() {
  const complete = new Map(), seeds = new Map(), previews = new Map();
  return {complete, seeds, previews,
    bootstrap:(owner,feed)=>core.clone(previews.get(owner+feed)||null),
    pending:(owner,feed,slot)=>core.clone(seeds.get(owner+feed+slot.id)||null),
    begin(r){const key=r.owner+r.feed+r.slot.id;if(!seeds.has(key))seeds.set(key,core.clone(r));return core.clone(seeds.get(key));},
    async get(id){return core.clone(complete.get(id)||null)},
    async put(r){complete.set(r.id,core.clone(r));previews.set(r.owner+r.feed,{...core.clone(r),payload:core.seedPayload(r),items:r.items.slice(0,1)});},
  };
}
function browser(store=storage(), settings={}, path='/feed/subscriptions') {
  const listeners = new Map(), requests=[];let account='one';
  const local = new Map([['sifi.youtube.edition.settings.v1',JSON.stringify(settings)]]);
  const context={SifiYouTubeEditionsCore:core,SifiYouTubePages:pages,SifiYouTubeEditionStore:store,
    URL,Request,Response,Headers,AbortSignal,DOMException,DecompressionStream,performance,Date,
    Event:class {constructor(type){this.type=type}},queueMicrotask,
    setTimeout:()=>1,clearTimeout(){},navigator:{},
    localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v)},
    location:{hostname:'m.youtube.com',origin:'https://m.youtube.com',pathname:path,href:'https://m.youtube.com'+path},
    ytcfg:{get:k=>k==='LOGGED_IN'?true:k==='DATASYNC_ID'?account:null},
    addEventListener(type,fn){listeners.set(type,[...listeners.get(type)||[],fn])},
    dispatchEvent(event){for(const fn of listeners.get(event.type)||[])fn(event)},
    fetch:async(input,init)=>{const req=new Request(input,init);const body=await req.json();requests.push(body);return new Response(JSON.stringify(body.continuation==='next'?batch([card('b'),card('c')],'last'):batch([card('d'),card('e')],null)));},
  };
  context.window=context;
  vm.runInNewContext(fs.readFileSync(require.resolve('../extension/settings-model.js'),'utf8'),context);
  vm.runInNewContext(fs.readFileSync(require.resolve('../extension/editions.js'),'utf8'),context);
  const initial=(data)=>{context.ytInitialData=data;return typeof context.ytInitialData==='string'?JSON.parse(context.ytInitialData):context.ytInitialData};
  const load=async token=>{const response=await context.fetch(new Request('https://m.youtube.com/youtubei/v1/browse',{method:'POST',body:JSON.stringify({context:{client:{}},continuation:token})}));return {status:response.status,data:await response.json()};};
  return {context,initial,load,store,requests,account:value=>{account=value}};
}

test('editions use local 08:00, 13:00 and 18:00 boundaries, including overnight',()=>{
  const at=(day,h,m=0)=>new Date(2026,9,day,h,m).getTime();
  assert.equal(core.windowAt(at(9,7,59)).startsAt,at(8,18));
  assert.equal(core.windowAt(at(9,8)).label,'Morning');
  assert.equal(core.windowAt(at(9,12,59)).nextAt,at(9,13));
  assert.equal(core.windowAt(at(9,13)).label,'Afternoon');
  assert.equal(core.windowAt(at(9,18)).nextAt,at(10,8));
});
test('shelf snapshots retain every Short and native endpoint but remove live continuation',()=>{
  const shelf={richSectionRenderer:{content:{reelShelfRenderer:{items:[{shortsLockupViewModel:{onTap:{videoId:'short-a'}}},cursor('shelf-more')],continuations:[{token:'live'}]}}}};
  const frozen=core.frozen(shelf);
  assert.equal(frozen.richSectionRenderer.content.reelShelfRenderer.items.length,1);
  assert.equal(frozen.richSectionRenderer.content.reelShelfRenderer.items[0].shortsLockupViewModel.onTap.videoId,'short-a');
  assert.equal(shelf.richSectionRenderer.content.reelShelfRenderer.items.length,2);
});
test('a first capture freezes the full configured budget before replay and caps extra native items',async()=>{
  const b=browser(storage(),{pageLimit:2,subscriptionsPageSize:2});
  const seed=b.initial(JSON.stringify(payload([card('a')])));
  const response=await b.load(core.cursor(core.grid(seed).contents));
  assert.equal(response.status,200);
  assert.equal(b.requests.length,2);
  assert.deepEqual(core.items(core.batch(response.data).continuationItems).map(x=>x.richItemRenderer.content.videoRenderer.videoId),['b','c','d']);
  const record=[...b.store.complete.values()][0];assert.equal(record.count,4);assert.equal(record.complete,true);
  assert.equal(b.context.SifiYouTubeEditions.state('subscriptions').loading,false);
});
test('hard reload replays the saved edition rather than the newly supplied feed or Shorts',async()=>{
  const store=storage();const first=browser(store);
  const seed=first.initial(payload([card('original')]));await first.load(core.cursor(core.grid(seed).contents));
  const reload=browser(store);const replay=reload.initial(payload([card('fresh-randomized')]));
  assert.equal(core.items(core.grid(replay).contents)[0].richItemRenderer.content.videoRenderer.videoId,'original');
  const response=await reload.load(core.cursor(core.grid(replay).contents));
  assert.equal(response.status,200);assert.equal(reload.requests.length,0);
});
test('an interrupted capture reuses its persisted initial seed on reload',()=>{
  const store=storage();browser(store).initial(payload([card('first')]));
  const b=browser(store);const seed=b.initial(payload([card('reshuffled')]));
  assert.equal(core.items(core.grid(seed).contents)[0].richItemRenderer.content.videoRenderer.videoId,'first');
});
test('account changes never replay another account edition',async()=>{
  const b=browser();const seed=b.initial(payload([card('private')]));const token=core.cursor(core.grid(seed).contents);b.account('two');
  const result=await b.load(token);assert.equal(result.status,503);assert.equal(b.requests.length,0);
});
test('disabled editions pass through the initial native feed',()=>{
  const b=browser(storage(),{subscriptionsEditions:false});const data=payload([card('a'),card('b')]);
  assert.equal(b.initial(data),data);assert.equal(core.parseToken(core.cursor(core.grid(data).contents)),null);
});
test('a capture failure never returns fresh content as if it were a saved edition',async()=>{
  const store=storage();store.put=async()=>{throw new Error('Storage full')};const b=browser(store);const seed=b.initial(payload([card('a')]));
  assert.equal((await b.load(core.cursor(core.grid(seed).contents))).status,503);
  assert.equal(store.complete.size,0);assert.match(b.context.SifiYouTubeEditions.state('subscriptions').error,/Storage full/);
});

test('SPA feed revisits use the stored payload without a server browse request',async()=>{
  const store=storage();const first=browser(store);const seed=first.initial(payload([card('original')]));await first.load(core.cursor(core.grid(seed).contents));
  const b=browser(store,{},'/watch');
  const result=await b.context.fetch(new Request('https://m.youtube.com/youtubei/v1/browse',{method:'POST',body:JSON.stringify({browseId:'FEsubscriptions',context:{client:{}}})}));
  const data=await result.json();assert.equal(core.items(core.grid(data).contents)[0].richItemRenderer.content.videoRenderer.videoId,'original');assert.equal(b.requests.length,0);
  assert.equal((await b.load(core.cursor(core.grid(data).contents))).status,200);
});
test('unrelated browse requests keep their original body readable',async()=>{
  const b=browser();const response=await b.context.fetch(new Request('https://m.youtube.com/youtubei/v1/browse',{method:'POST',body:JSON.stringify({browseId:'UCcreator',context:{client:{}}})}));
  assert.equal(response.status,200);assert.equal(b.requests[0].browseId,'UCcreator');
});
test('compressed native continuation requests replay cached data',async()=>{
  const b=browser();const seed=b.initial(payload([card('a')]));const text=JSON.stringify({context:{client:{}},continuation:core.cursor(core.grid(seed).contents)});
  const compressed=require('node:zlib').gzipSync(text);
  const response=await b.context.fetch(new Request('https://m.youtube.com/youtubei/v1/browse',{method:'POST',headers:{'content-encoding':'gzip'},body:compressed}));
  assert.equal(response.status,200);assert.equal(b.store.complete.size,1);
});
test('simultaneous requests in one document share a single complete capture',async()=>{
  const b=browser();const seed=b.initial(payload([card('a')]));const token=core.cursor(core.grid(seed).contents);
  const results=await Promise.all([b.load(token),b.load(token)]);
  assert.ok(results.every(r=>r.status===200));assert.equal(b.requests.length,2);assert.equal(b.store.complete.size,1);
});
test('a new time window selects a new edition without modifying the old record',async()=>{
  const store=storage();const first=browser(store);const seed=first.initial(payload([card('old')]));await first.load(core.cursor(core.grid(seed).contents));
  const old=[...store.complete.values()][0];const previous=core.clone(old);previous.slot={...old.slot,id:String(+old.slot.id-86400000),startsAt:old.slot.startsAt-86400000,nextAt:old.slot.startsAt};previous.id+='-old';
  store.previews.set(old.owner+old.feed,{...previous,payload:core.seedPayload(previous),items:previous.items.slice(0,1)});store.seeds.clear();store.complete.clear();store.complete.set(previous.id,previous);
  const next=browser(store);const nextSeed=next.initial(payload([card('new')]));assert.equal(core.items(core.grid(nextSeed).contents)[0].richItemRenderer.content.videoRenderer.videoId,'new');
  await next.load(core.cursor(core.grid(nextSeed).contents));assert.equal(store.complete.get(previous.id).items[0].richItemRenderer.content.videoRenderer.videoId,'old');
});

test('empty subscriptions can be saved without requesting invented live pages',async()=>{
  const b=browser();const seed=b.initial(payload([],null));
  const response=await b.load(core.cursor(core.grid(seed).contents));
  assert.equal(response.status,200);assert.equal(b.requests.length,0);
  assert.equal([...b.store.complete.values()][0].count,0);
  assert.deepEqual(core.batch(response.data).continuationItems,[]);
});

test('two tabs serialize their first capture and converge on the same snapshot',async()=>{
  const store=storage();const a=browser(store),b=browser(store);let queue=Promise.resolve();
  const locks={request:(_name,fn)=>{const next=queue.then(fn);queue=next.catch(()=>{});return next}};
  a.context.navigator.locks=locks;b.context.navigator.locks=locks;
  const first=a.initial(payload([card('first-tab')]));const second=b.initial(payload([card('second-tab')]));
  const results=await Promise.all([a.load(core.cursor(core.grid(first).contents)),b.load(core.cursor(core.grid(second).contents))]);
  assert.ok(results.every(r=>r.status===200));assert.equal(a.requests.length+b.requests.length,2);
  assert.equal([...store.complete.values()][0].items[0].richItemRenderer.content.videoRenderer.videoId,'first-tab');
});

const owned = (id, channel, name='Channel') => ({richItemRenderer:{content:{videoWithContextRenderer:{videoId:id,shortBylineText:{runs:[{text:name,navigationEndpoint:{browseEndpoint:{browseId:channel}}}]}}}}});
test('subscription groups combine distant uploads by stable channel ID and preserve shelves and unknown cards',()=>{
  const shelf={richSectionRenderer:{content:{reelShelfRenderer:{items:[]}}}};
  const source=[owned('a1','UCa','Same name'),owned('b1','UCb','Same name'),shelf,owned('a2','UCa'),card('unknown1'),owned('b2','UCb'),card('unknown2')];
  const before=JSON.stringify(source);
  const grouped=core.groupSubscriptions(source);
  assert.equal(grouped.groupCount,5);
  assert.deepEqual(grouped.items.map(x=>x.richItemRenderer?.content.videoWithContextRenderer?.videoId||x.richItemRenderer?.content.videoRenderer?.videoId||'shelf'),['a1','a2','b1','b2','shelf','unknown1','unknown2']);
  assert.equal(JSON.stringify(source),before);
  const first=core.page({id:'test',...grouped},0,3);
  assert.equal(core.items(first).length,4);
  assert.equal(core.parseToken(core.cursor(first)).offset,4);
});
test('grouped replay leaves the stored edition untouched and reports logical pagination size',async()=>{
  const b=browser();
  const source=[owned('a1','UCa'),owned('b1','UCb'),owned('a2','UCa'),owned('b2','UCb')];
  const seed=b.initial(payload(source,null));
  const result=await b.load(core.cursor(core.grid(seed).contents));
  assert.equal(result.status,200);
  assert.equal(b.context.SifiYouTubeEditions.state('subscriptions').count,2);
  assert.deepEqual(core.items(core.batch(result.data).continuationItems).map(x=>x.richItemRenderer.content.videoWithContextRenderer.videoId),['a2','b1','b2']);
  assert.deepEqual([...b.store.complete.values()][0].items,source);
  assert.equal(b.requests.length,0);
});
