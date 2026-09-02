// Tiny IndexedDB wrapper. Everything lives on this machine; nothing is uploaded.
const DB_NAME = 'elle-act';
const DB_VER = 2;                       // v2: pages store (rendered PDF pages)
const STORES = {
  questions: { keyPath: 'id', indexes: ['subject', 'source'] },
  passages:  { keyPath: 'id', indexes: ['source'] },
  prompts:   { keyPath: 'id', indexes: ['source'] },
  responses: { keyPath: 'id', indexes: ['promptId'] },
  attempts:  { keyPath: 'id', indexes: ['questionId', 'day'] },
  scores:    { keyPath: 'id', indexes: ['date'] },
  pages:     { keyPath: 'id', indexes: ['source'] },   // `${source}::${n}` → JPEG data URL
  meta:      { keyPath: 'k' },
};

let _db = null;

export function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, cfg] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(name)) continue;
        const st = db.createObjectStore(name, { keyPath: cfg.keyPath });
        for (const ix of cfg.indexes || []) st.createIndex(ix, ix, { unique: false });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const out = fn(t.objectStore(store));
    t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const put     = (store, val)  => tx(store, 'readwrite', s => s.put(val));
export const del     = (store, key)  => tx(store, 'readwrite', s => s.delete(key));
export const clear   = (store)       => tx(store, 'readwrite', s => s.clear());
export const get     = (store, key)  => tx(store, 'readonly',  s => s.get(key));

export function putMany(store, vals) {
  return tx(store, 'readwrite', s => { vals.forEach(v => s.put(v)); });
}

export function all(store) {
  return tx(store, 'readonly', s => s.getAll());
}

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---- small key/value helpers on the meta store ----
export async function getMeta(k, fallback = null) {
  const row = await get('meta', k);
  return row ? row.v : fallback;
}
export const setMeta = (k, v) => put('meta', { k, v });

export async function wipeAll() {
  for (const name of Object.keys(STORES)) await clear(name);
}
