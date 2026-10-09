(() => {
  let opening;
  function db() {
    return opening ||= new Promise((resolve,reject) => {
      const request=indexedDB.open('sifi-youtube-suggestions',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('records',{keyPath:'id'});
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>{opening=null;reject(request.error);};
      request.onblocked=()=>{opening=null;reject(new Error('Suggestion storage is blocked. Close older YouTube tabs and reload.'));};
    });
  }
  async function get(id) {
    const database=await db();
    return new Promise((resolve,reject)=>{
      const req=database.transaction('records').objectStore('records').get(id);
      req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);
    });
  }
  async function put(record) {
    if(JSON.stringify(record).length>20_000_000)throw new Error('Suggestions are too large to save. Reduce the page limit.');
    const database=await db();
    return new Promise((resolve,reject)=>{
      const tx=database.transaction('records','readwrite'),store=tx.objectStore('records');
      // Only expired snapshots are evicted: revisits within the retention period
      // must not become a fresh lottery just because other videos were opened.
      const cursor=store.openCursor();
      cursor.onsuccess=()=>{const c=cursor.result;if(!c)return;if(c.value.expiresAt<=Date.now())c.delete();c.continue();};
      store.put(record);
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Saving suggestions was interrupted.'));
    });
  }
  globalThis.SifiYouTubeRecommendationsStore={get,put};
})();
