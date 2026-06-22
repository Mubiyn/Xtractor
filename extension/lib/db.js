// Minimal IndexedDB wrapper for storing fetched bookmarks locally. Keeping the
// last fetch around lets the user re-export in another format without re-paging
// the API, and de-dupes across runs.

const DB_NAME = "xbe";
const DB_VERSION = 1;
const STORE = "bookmarks";
const META = "meta";

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, store, mode) {
  return db.transaction(store, mode).objectStore(store);
}

function done(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function putBookmarks(records) {
  if (!records || !records.length) return;
  const db = await open();
  const store = tx(db, STORE, "readwrite");
  for (const r of records) store.put(r);
  await done(store.transaction);
  db.close();
}

export async function getAllBookmarks() {
  const db = await open();
  const store = tx(db, STORE, "readonly");
  const result = await new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

export async function countBookmarks() {
  const db = await open();
  const store = tx(db, STORE, "readonly");
  const result = await new Promise((resolve, reject) => {
    const req = store.count();
    req.onsuccess = () => resolve(req.result || 0);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}

export async function clearBookmarks() {
  const db = await open();
  const store = tx(db, STORE, "readwrite");
  store.clear();
  await done(store.transaction);
  db.close();
}

export async function setMeta(key, value) {
  const db = await open();
  const store = tx(db, META, "readwrite");
  store.put({ key, value });
  await done(store.transaction);
  db.close();
}

export async function getMeta(key) {
  const db = await open();
  const store = tx(db, META, "readonly");
  const result = await new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return result;
}
