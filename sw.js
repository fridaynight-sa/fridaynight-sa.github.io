/* Serves _blob/<id> for media added in «فئاتي»: from this device first,
   then from the Firebase mirror (images only). */
try { importScripts("firebase-config.js"); } catch (e) {}
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

const idb = () => new Promise((res, rej) => { const r = indexedDB.open("sj-media", 1); r.onupgradeneeded = () => r.result.createObjectStore("files"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const getLocal = id => idb().then(d => new Promise(res => { const q = d.transaction("files").objectStore("files").get(id); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); })).catch(() => null);

async function serve(id) {
  const loc = await getLocal(id);
  if (loc && loc.blob) return new Response(loc.blob, { headers: { "Content-Type": loc.type || loc.blob.type || "application/octet-stream" } });
  const C = self.FIREBASE_CONFIG;
  if (C && C.databaseURL) {
    try {
      const r = await fetch(C.databaseURL.replace(/\/$/, "") + "/media/" + id + "/d.json");
      const d = r.ok ? await r.json() : null;
      if (typeof d === "string" && d.startsWith("data:")) return fetch(d);
    } catch (e) {}
  }
  return new Response("not found", { status: 404 });
}

self.addEventListener("fetch", e => {
  const m = new URL(e.request.url).pathname.match(/\/_blob\/([0-9a-f]{32})$/);
  if (m) e.respondWith(serve(m[1]));
});

/* Mind Games offline: a copy of the section (pages, games, and the shared files they use) is kept on the
   phone (mind/sync.js fills it the first time a Mind Games page opens). The internet is always tried first,
   so updates arrive right away; the copy is used only when offline. */
const MIND = "mind-v1";
const mindPages = new Set();     // open Mind Games pages: only their requests are handled here, other games are left alone
function shared(u) {
  if (u.origin === self.location.origin) return /\/(fnfx|fnanim|firebase-config)\.js$/.test(u.pathname) || /\/icons\/[\w-]+\.png$/.test(u.pathname) || /\/favicon-\d+\.png$/.test(u.pathname);
  return u.href.startsWith("https://www.gstatic.com/firebasejs/") || u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com";
}
const fromMind = e => mindPages.has(e.clientId) || /\/mind\//.test(e.request.referrer || "");
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const u = new URL(e.request.url), own = u.origin === self.location.origin && u.pathname.includes("/mind/");
  if (e.request.mode === "navigate") { if (!own) return; if (e.resultingClientId) mindPages.add(e.resultingClientId); }
  else if (!((own || shared(u)) && fromMind(e))) return;
  if (e.clientId && own) mindPages.add(e.clientId);
  e.respondWith(fetch(e.request).then(r => {
    if (r && (r.ok || r.type === "opaque")) { const copy = r.clone(); caches.open(MIND).then(c => c.put(e.request, copy)).catch(() => {}); }
    return r;
  }).catch(() => caches.open(MIND).then(c => c.match(e.request).then(m => m || c.match(e.request, { ignoreSearch: true }))).then(m => m || Response.error())));
});
