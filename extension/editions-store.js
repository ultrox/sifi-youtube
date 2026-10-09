(() => {
  const core = SifiYouTubeEditionsCore;
  const PREFIX = 'sifi.youtube.edition.v1.';
  let opening;
  function db() {
    return opening ||= new Promise((resolve, reject) => {
      const request = indexedDB.open('sifi-youtube-editions', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('records', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { opening = null; reject(request.error); };
      request.onblocked = () => { opening = null; reject(new Error('Edition storage is blocked. Close older YouTube tabs and reload.')); };
    });
  }
  async function get(id) {
    const database = await db();
    return new Promise((resolve, reject) => {
      const request = database.transaction('records').objectStore('records').get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }
  function bootstrap(owner, feed) {
    try {
      const record = JSON.parse(localStorage.getItem(PREFIX + owner + '.' + feed) || 'null');
      return record?.schema === 1 && record.owner === owner && record.feed === feed && core.grid(record.payload) ? record : null;
    } catch { return null; }
  }
  function pending(owner, feed, slot) {
    try {
      const record = JSON.parse(localStorage.getItem(PREFIX + owner + '.' + feed + '.pending') || 'null');
      return record?.schema === 1 && record.owner === owner && record.feed === feed && record.slot?.id === slot.id && core.grid(record.payload) ? record : null;
    } catch { return null; }
  }
  function begin(record) {
    const existing = pending(record.owner, record.feed, record.slot);
    if (existing) return existing;
    const encoded = JSON.stringify(record);
    if (encoded.length > 600_000) throw new Error('Edition preview is too large to save.');
    localStorage.setItem(PREFIX + record.owner + '.' + record.feed + '.pending', encoded);
    return record;
  }
  function saveBootstrap(record) {
    const value = { ...record, payload: core.seedPayload(record), items: record.items.slice(0, 1), cursor: null };
    const encoded = JSON.stringify(value);
    if (encoded.length > 600_000) throw new Error('Edition preview is too large to save.');
    localStorage.setItem(PREFIX + record.owner + '.' + record.feed, encoded);
    localStorage.removeItem(PREFIX + record.owner + '.' + record.feed + '.pending');
  }
  async function put(record) {
    if (JSON.stringify(record).length > 20_000_000) throw new Error('Edition exceeds the local storage limit. Reduce the page limit for the next edition.');
    const database = await db();
    await new Promise((resolve, reject) => {
      const transaction = database.transaction('records', 'readwrite');
      transaction.objectStore('records').put(record);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error('Edition save was interrupted.'));
    });
    saveBootstrap(record);
    // Keep this and the preceding edition per feed. Other signed-in accounts
    // are isolated by owner; discard their records to bound local retention.
    const transaction = database.transaction('records', 'readwrite');
    const store = transaction.objectStore('records');
    const all = store.getAll();
    all.onsuccess = () => {
      const keep = all.result.filter(r => r.owner === record.owner && r.feed === record.feed).sort((a,b) => b.slot.startsAt - a.slot.startsAt).slice(0,2).map(r => r.id);
      for (const value of all.result) if (value.owner !== record.owner || (value.feed === record.feed && !keep.includes(value.id))) store.delete(value.id);
    };
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX) && !key.startsWith(PREFIX + record.owner + '.')) localStorage.removeItem(key);
    }
  }
  globalThis.SifiYouTubeEditionStore = { get, put, bootstrap, pending, begin };
})();
