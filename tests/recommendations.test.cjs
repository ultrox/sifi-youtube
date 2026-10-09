const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const core=require('../extension/recommendations-core.js');
const editions=require('../extension/editions-core.js');
const card=id=>({videoWithContextRenderer:{videoId:id}});
const cursor=token=>({continuationItemRenderer:{continuationEndpoint:{continuationCommand:{token}}}});
const payload=(video,items,token='live')=>({currentVideoEndpoint:{watchEndpoint:{videoId:video}},playerOverlays:{live:true},contents:{singleColumnWatchNextResults:{results:{results:{contents:[{itemSectionRenderer:{targetId:'comments-section',contents:[{comment:'fresh'}]}},{itemSectionRenderer:{targetId:'watch-next-feed',header:{filter:'live'},contents:[...items,...token?[cursor(token)]:[]]}}]}}}}});
const batch=items=>({onResponseReceivedEndpoints:[{appendContinuationItemsAction:{targetId:'watch-next-feed',continuationItems:items}}]});
function storage(){const rows=new Map();return {rows,async get(id){return structuredClone(rows.get(id)||null)},async put(r){rows.set(r.id,structuredClone(r))}};}
function browser(store=storage(),overrides={}){
  let now=1000000000,account='owner';const requests=[],listeners=new Map();
  class Clock extends Date {constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
  const ctx={URL,Request,Response,Headers,DOMException,AbortSignal,DecompressionStream,performance,Date:Clock,queueMicrotask,
    Event:class {constructor(type){this.type=type}},navigator:{},
    location:{hostname:'m.youtube.com',origin:'https://m.youtube.com',pathname:'/watch',href:'https://m.youtube.com/watch?v=videoA'},
    localStorage:{getItem:()=>JSON.stringify(overrides)},
    ytcfg:{get:key=>key==='LOGGED_IN'?true:key==='DATASYNC_ID'?account:null},
    SifiYouTubeRecommendationsCore:core,SifiYouTubeRecommendationsStore:store,SifiYouTubeEditionsCore:editions,
    addEventListener:(type,fn)=>listeners.set(type,[...listeners.get(type)||[],fn]),
    dispatchEvent:e=>{for(const fn of listeners.get(e.type)||[])fn(e)},
    fetch:async(input,init)=>{const req=new Request(input,init),body=await req.json();requests.push(body);return new Response(JSON.stringify(body.continuation?batch([card('b'),card('c'),card('d')]):payload(body.videoId,[card('new')],null)))},
  };ctx.window=ctx;
  vm.runInNewContext(fs.readFileSync(require.resolve('../extension/settings-model.js'),'utf8'),ctx);
  vm.runInNewContext(fs.readFileSync(require.resolve('../extension/recommendations.js'),'utf8'),ctx);
  const initial=data=>{ctx.ytInitialData=data;return typeof ctx.ytInitialData==='string'?JSON.parse(ctx.ytInitialData):ctx.ytInitialData};
  const load=async token=>{const r=await ctx.fetch(new Request('https://m.youtube.com/youtubei/v1/next',{method:'POST',body:JSON.stringify({continuation:token,context:{client:{}}})}));return {status:r.status,data:await r.json()}};
  return {ctx,store,requests,initial,load,time:value=>now=value,account:value=>account=value};
}
test('only recommendation section is replaced; comments and player remain live',async()=>{
  const b=browser(storage(),{pageLimit:1,recommendationsPageSize:3});
  const original=payload('videoA',[card('a')]);const seed=b.initial(JSON.stringify(original));
  assert.deepEqual(seed.playerOverlays,original.playerOverlays);
  assert.deepEqual(seed.contents.singleColumnWatchNextResults.results.results.contents[0],original.contents.singleColumnWatchNextResults.results.results.contents[0]);
  assert.equal(core.items(core.section(seed).contents).length,0);
  const result=await b.load(core.cursor(core.section(seed).contents));
  assert.equal(result.status,200);
  assert.deepEqual(core.items(core.batch(result.data).continuationItems).map(x=>x.videoWithContextRenderer.videoId),['a','b','c']);
  assert.equal(b.ctx.SifiYouTubeRecommendations.state().count,3);
  assert.equal(b.store.rows.size,1);
});
test('reload and a separate browser context replay the exact stored set without fetching continuations',async()=>{
  const store=storage(),first=browser(store);
  const seed=first.initial(payload('videoA',[card('a')]));await first.load(core.cursor(core.section(seed).contents));
  const before=JSON.stringify([...store.rows.values()]);
  const second=browser(store),replay=second.initial(payload('videoA',[card('reshuffled')]));
  const result=await second.load(core.cursor(core.section(replay).contents));
  assert.deepEqual(core.items(core.batch(result.data).continuationItems).map(x=>x.videoWithContextRenderer.videoId),['a','b','c','d']);
  assert.equal(second.requests.length,0);assert.equal(JSON.stringify([...store.rows.values()]),before);
});
test('expiration is fixed, refreshes on a later visit, and never changes an open session',async()=>{
  const store=storage(),first=browser(store);const seed=first.initial(payload('videoA',[card('a')],null));const token=core.cursor(core.section(seed).contents);await first.load(token);
  first.time(1000000000+25*3600000);
  assert.equal(core.items(core.batch((await first.load(token)).data).continuationItems)[0].videoWithContextRenderer.videoId,'a');
  const second=browser(store);second.time(1000000000+25*3600000);
  const next=second.initial(payload('videoA',[card('fresh')],null));
  assert.equal(core.items(core.batch((await second.load(core.cursor(core.section(next).contents))).data).continuationItems)[0].videoWithContextRenderer.videoId,'fresh');
});
test('videos and accounts have independent snapshots',async()=>{
  const b=browser();let seed=b.initial(payload('videoA',[card('a')],null));await b.load(core.cursor(core.section(seed).contents));
  seed=b.initial(payload('videoB',[card('b')],null));await b.load(core.cursor(core.section(seed).contents));
  b.account('other');seed=b.initial(payload('videoA',[card('other')],null));await b.load(core.cursor(core.section(seed).contents));
  assert.equal(b.store.rows.size,3);
});
test('storage errors report failure instead of silently replacing recommendations',async()=>{
  const store=storage();store.put=async()=>{throw new Error('Storage full')};const b=browser(store),seed=b.initial(payload('videoA',[card('a')]));
  assert.equal((await b.load(core.cursor(core.section(seed).contents))).status,503);
  assert.equal(b.requests.length,0);assert.equal(b.ctx.SifiYouTubeRecommendations.state().error,'Storage full');
});
test('native comments and disabled caching keep original request bodies readable',async()=>{
  const b=browser(storage(),{recommendationsCache:false}),data=payload('videoA',[card('a')]);assert.equal(b.initial(data),data);
  const req=new Request('https://m.youtube.com/youtubei/v1/next',{method:'POST',body:JSON.stringify({continuation:'comments'})});
  await b.ctx.fetch(req);assert.equal(b.requests[0].continuation,'comments');
});
test('SPA watch navigation keeps current metadata but reuses saved suggestions',async()=>{
  const b=browser(),seed=b.initial(payload('videoA',[card('a')],null));await b.load(core.cursor(core.section(seed).contents));
  const r=await b.ctx.fetch(new Request('https://m.youtube.com/youtubei/v1/next',{method:'POST',body:JSON.stringify({videoId:'videoA'})}));
  const root=await r.json();assert.deepEqual(root.playerOverlays,{live:true});
  const replay=await b.load(core.cursor(core.section(root).contents));
  assert.equal(core.items(core.batch(replay.data).continuationItems)[0].videoWithContextRenderer.videoId,'a');
});
test('interrupted capture resumes its durable original seed',async()=>{
  const store=storage(),first=browser(store);
  const seed=first.initial(payload('videoA',[card('original')]));
  const token=core.cursor(core.section(seed).contents);
  const put=store.put;let writes=0;store.put=async r=>{if(++writes===2)throw new Error('Interrupted');return put(r)};
  assert.equal((await first.load(token)).status,503);store.put=put;
  const second=browser(store),next=second.initial(payload('videoA',[card('different')]));
  const result=await second.load(core.cursor(core.section(next).contents));
  assert.equal(core.items(core.batch(result.data).continuationItems)[0].videoWithContextRenderer.videoId,'original');
});
test('empty lists complete locally and continuation batches never exceed the saved set',async()=>{
  const b=browser(),seed=b.initial(payload('videoA',[],null));
  const r=await b.load(core.cursor(core.section(seed).contents));assert.deepEqual(core.batch(r.data).continuationItems,[]);assert.equal(b.requests.length,0);
  const record={items:Array.from({length:35},(_,i)=>card(String(i)))};
  const page=core.page(record,'id',0);assert.equal(core.parse(core.cursor(page)).offset,30);
  assert.equal(core.page(record,'id',30).length,5);
});
test('compressed native requests replay saved suggestions',async()=>{
  const zlib=require('node:zlib'),b=browser(),seed=b.initial(payload('videoA',[card('a')],null));
  const req=new Request('https://m.youtube.com/youtubei/v1/next',{method:'POST',headers:{'content-encoding':'gzip'},body:zlib.gzipSync(JSON.stringify({continuation:core.cursor(core.section(seed).contents)}))});
  const result=await b.ctx.fetch(req);assert.equal(result.status,200);assert.equal(b.requests.length,0);
});
test('two tabs use one capture under the same per-video lock',async()=>{
  const store=storage(),a=browser(store),b=browser(store);let chain=Promise.resolve();
  const locks={request:(_key,run)=>{const job=chain.then(run);chain=job.catch(()=>{});return job}};
  a.ctx.navigator.locks=b.ctx.navigator.locks=locks;
  const sa=a.initial(payload('videoA',[card('first')])),sb=b.initial(payload('videoA',[card('second')]));
  const [ra,rb]=await Promise.all([a.load(core.cursor(core.section(sa).contents)),b.load(core.cursor(core.section(sb).contents))]);
  assert.deepEqual(ra.data,rb.data);assert.equal(a.requests.length+b.requests.length,1);
});
test('account switching during hydration never exposes the previous account snapshot',async()=>{
  const b=browser(),seed=b.initial(payload('videoA',[card('private')],null));b.account('different');
  assert.equal((await b.load(core.cursor(core.section(seed).contents))).status,503);assert.equal(b.store.rows.size,0);
});
test('repeated root responses cannot refresh an open video after expiry',async()=>{
  const b=browser(),seed=b.initial(payload('videoA',[card('original')],null));await b.load(core.cursor(core.section(seed).contents));
  b.time(1000000000+25*3600000);
  const repeat=b.initial(payload('videoA',[card('replacement')],null));
  const result=await b.load(core.cursor(core.section(repeat).contents));
  assert.equal(core.items(core.batch(result.data).continuationItems)[0].videoWithContextRenderer.videoId,'original');
});
test('recommendation settings default to 24 hours and clamp independently of page limits',()=>{
  const b=browser();const settings=b.ctx.SifiYouTubeSettings;
  assert.equal(settings.normalize().recommendationsCacheHours,24);
  assert.equal(settings.normalize({recommendationsCacheHours:168}).recommendationsCacheHours,168);
  assert.equal(settings.normalize({recommendationsCacheHours:0}).recommendationsCacheHours,1);
  assert.equal(settings.normalize({recommendationsCacheHours:999}).recommendationsCacheHours,168);
  assert.equal(settings.normalize({recommendationsCache:false}).recommendationsCache,false);
});
test('an account change also blocks an already hydrated in-memory snapshot',async()=>{
  const b=browser(),seed=b.initial(payload('videoA',[card('private')],null));
  const token=core.cursor(core.section(seed).contents);assert.equal((await b.load(token)).status,200);
  b.account('different');assert.equal((await b.load(token)).status,503);
});
