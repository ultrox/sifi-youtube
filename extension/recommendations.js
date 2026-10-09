(() => {
  'use strict';
  if(location.hostname!=='m.youtube.com')return;
  const core=SifiYouTubeRecommendationsCore,store=SifiYouTubeRecommendationsStore;
  const nativeFetch=window.fetch.bind(window),sessions=new Map();
  let settings;
  try{settings=SifiYouTubeSettings.normalize(JSON.parse(localStorage.getItem('sifi.youtube.edition.settings.v1')||'{}'));}
  catch{settings=SifiYouTubeSettings.normalize();}
  let serial=0,active;
  const enabled=()=>settings.recommendationsCache&&settings.recommendationsPagination;
  const currentVideo=()=>location.pathname==='/watch'?new URL(location.href).searchParams.get('v'):null;
  function owner(){
    const cfg=window.ytcfg;
    if(!cfg?.get)return null;
    if(!cfg.get('LOGGED_IN'))return 'guest';
    const id=cfg.get('DATASYNC_ID')||cfg.get('DELEGATED_SESSION_ID');
    return typeof id==='string'&&id.length>0?encodeURIComponent(id):null;
  }
  const notify=()=>window.dispatchEvent(new Event('sifi-youtube-edition'));
  function select(data,id){
    const target=core.section(data),account=owner();
    if(!enabled()||!target||!id||!account)return data;
    // Initial data is assigned both as JSON and as a parsed object.
    if(core.parse(core.cursor(target.contents)))return data;
    if(active?.seed.video===id && active.seed.owner===account && currentVideo()===id){
      const result=core.clone(data),section=core.section(result);
      section.contents=[core.continuation(active.token,0)];delete section.header;
      active.hydrate=true;queueMicrotask(notify);return result;
    }
    const key=account+'|'+id,token=key+'|'+(++serial);
    const seed={schema:1,id:key,owner:account,video:id,capturedAt:Date.now(),
      expiresAt:Date.now()+settings.recommendationsCacheHours*3600000,
      capacity:Math.min(900,settings.pageLimit*settings.recommendationsPageSize),
      items:core.items(target.contents).map(SifiYouTubeEditionsCore.frozen),cursor:core.cursor(target.contents),complete:false};
    seed.items=seed.items.slice(0,seed.capacity);
    const session={token,seed,loading:true,hydrate:true,error:'',record:null,job:null};
    sessions.set(token,session);active=session;
    const result=core.clone(data),section=core.section(result);
    // A local continuation hydrates IDB before any new suggestions are shown.
    // The player, comments, live metadata and engagement panels stay native.
    section.contents=[core.continuation(token,0)];
    delete section.header; // Live recommendation filter chips would reshuffle the saved set.
    queueMicrotask(notify);
    return result;
  }
  const descriptor=Object.getOwnPropertyDescriptor(window,'ytInitialData');
  if(!descriptor||descriptor.configurable){
    let value=descriptor?.get?descriptor.get.call(window):descriptor?.value;
    const transform=next=>{
      const data=typeof next==='string'?JSON.parse(next):next;
      const result=select(data,core.video(data)||currentVideo());
      return typeof next==='string'?JSON.stringify(result):result;
    };
    Object.defineProperty(window,'ytInitialData',{configurable:true,enumerable:true,
      get:()=>descriptor?.get?descriptor.get.call(window):value,
      set:next=>{const result=transform(next);if(descriptor?.set)descriptor.set.call(window,result);else value=result;}});
    if(value)window.ytInitialData=value;
  }
  function check(session){if(owner()!==session.seed.owner)throw new DOMException('Account changed','AbortError');}
  async function resolve(session,request,body){
    check(session);
    if(session.record)return session.record;
    if(!session.job){
      const run=async()=>{
        check(session);
        const saved=await store.get(session.seed.id);
        let record=core.valid(saved,session.seed.owner,session.seed.video,Date.now())?saved:core.clone(session.seed);
        if(!record.complete){
          await store.put(record); // Resume the same seed after an interrupted capture.
          const seen=new Set(),started=performance.now();
          while(record.cursor&&record.items.length<record.capacity){
            if(seen.has(record.cursor)||performance.now()-started>120000)throw new Error('Could not finish saving suggestions. Reload to retry.');
            seen.add(record.cursor);
            const headers=new Headers(request.headers);headers.delete('content-encoding');headers.delete('content-length');headers.set('content-type','application/json');
            const response=await nativeFetch(request.url,{method:'POST',headers,credentials:'include',signal:AbortSignal.timeout(20000),
              body:JSON.stringify({context:body.context||window.ytcfg?.get('INNERTUBE_CONTEXT'),continuation:record.cursor})});
            check(session);
            if(!response.ok)throw new Error('Could not save suggestions. Reload to retry.');
            const batch=core.batch(await response.json());
            if(!batch)throw new Error('YouTube changed its suggestions. The saved set was not replaced.');
            record.items.push(...core.items(batch.continuationItems).map(SifiYouTubeEditionsCore.frozen).slice(0,record.capacity-record.items.length));
            record.cursor=core.cursor(batch.continuationItems);
          }
          record.cursor=null;record.complete=true;
          await store.put(record);
        }
        check(session);return record;
      };
      session.job=(navigator.locks?navigator.locks.request('sifi-suggestions:'+session.seed.id,run):run())
        .then(record=>session.record=record).finally(()=>session.job=null);
    }
    return session.job;
  }
  const response=data=>new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json; charset=utf-8'}});
  window.fetch=async function(input,init){
    const url=new URL(input instanceof Request?input.url:String(input),location.href);
    if(url.origin!==location.origin||url.pathname!=='/youtubei/v1/next')return nativeFetch(input,init);
    const request=new Request(input instanceof Request?input.clone():input,init);
    let body;
    try{const copy=request.clone();body=copy.headers.get('content-encoding')==='gzip'
      ?await new Response(copy.body.pipeThrough(new DecompressionStream('gzip'))).json():await copy.json();}
    catch{return nativeFetch(input,init);}
    const parsed=core.parse(body.continuation);
    if(parsed){
      const session=sessions.get(parsed.id);
      try{
        if(!session)throw new Error('Suggestion session expired. Reload to reconnect.');
        const record=await resolve(session,request,body);
        session.loading=false;session.hydrate=false;session.error='';notify();
        return response({onResponseReceivedEndpoints:[{appendContinuationItemsAction:{targetId:'watch-next-feed',continuationItems:core.page(record,session.token,parsed.offset)}}]});
      }catch(error){
        if(session){session.loading=false;session.error=error.message||'Suggestions unavailable. Reload to retry.';notify();}
        return new Response(JSON.stringify({error:{message:'Saved suggestions unavailable'}}),{status:503});
      }
    }
    const result=await nativeFetch(input,init);
    // Comment continuations and all unrelated /next operations pass through.
    if(!enabled()||!result.ok||body.continuation)return result;
    const data=await result.clone().json();
    if(!core.section(data))return result;
    return response(select(data,core.video(data)||body.videoId));
  };
  window.addEventListener('sifi-youtube-settings',event=>{settings=SifiYouTubeSettings.normalize(event.detail);notify();});
  window.addEventListener('sifi-youtube-route',()=>{if(active?.seed.video!==currentVideo())active=null;});
  globalThis.SifiYouTubeRecommendations={
    state(){
      if(!enabled()||!active||active.seed.owner!==owner()||active.seed.video!==currentVideo())return null;
      const record=active.record;
      return {label:'Saved suggestions',detail:active.error||(active.loading?'Saving suggestions…':
        `Fixed for ${Math.round((record.expiresAt-record.capturedAt)/3600000)} hours · Saved ${new Date(record.capturedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`),
        loading:active.loading,error:active.error,count:record?.items.length||0,available:false,recommendations:true};
    },
    needsHydration:()=>!!active?.hydrate,
  };
})();
