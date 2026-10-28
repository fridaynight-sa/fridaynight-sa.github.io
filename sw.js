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
   phone. Mind Games pages (and the home-screen app) ask for it with a "cache-mind" message, once per site
   update. The internet is always tried first, so updates arrive right away; the copy is used only offline.
   With no internet at all, any other page of the site opens Mind Games instead (the group games need internet). */
const MIND = "mind-v1";
const MIND_FILES = ["mind/", "mind/mind.css", "mind/sync.js", "mind/lamha/", "mind/lamha/app.js", "mind/lamha/draw.js",
  "mind/dots/", "mind/dots/app.js", "mind/dots/levels.js", "mind/squares/", "mind/squares/app.js",
  "fnfx.js", "fnanim.js", "firebase-config.js", "favicon-32.png", "favicon-64.png",
  ...["mind", "lamha", "dots", "squares", "seenjeem", "outside", "sedq", "mf", "draw", "dafour", "tv"].map(x => `icons/${x}.png`)];
const MIND_MUST = 11;                    // the first eleven files: without them the games can't open offline
const MIND_CDN = ["app", "database", "auth"].map(x => `https://www.gstatic.com/firebasejs/10.12.2/firebase-${x}-compat.js`);
async function cacheMind() {
  const c = await caches.open(MIND), root = self.registration.scope;
  const got = await Promise.all(MIND_FILES.map(u => c.add(new Request(new URL(u, root).href, { cache: "reload" })).then(() => true, () => false)));
  await Promise.all(MIND_CDN.map(u => fetch(u, { mode: "no-cors" }).then(r => c.put(u, r)).catch(() => {})));
  return got.slice(0, MIND_MUST).every(Boolean);
}
self.addEventListener("message", e => {
  const d = e.data || {};
  if (d.type !== "cache-mind") return;
  e.waitUntil(cacheMind().catch(() => false).then(ok => { if (e.source) e.source.postMessage({ type: "mind-cached", v: d.v, ok }); }));
});
const fromCopy = req => caches.open(MIND).then(c => c.match(req, { ignoreVary: true }).then(m => m || c.match(req, { ignoreSearch: true, ignoreVary: true })));
const mindPages = new Set();     // open Mind Games pages: only their requests are handled here, other games are left alone
function shared(u) {
  if (u.origin === self.location.origin) return /\/(fnfx|fnanim|firebase-config)\.js$/.test(u.pathname) || /\/icons\/[\w-]+\.png$/.test(u.pathname) || /\/favicon-\d+\.png$/.test(u.pathname);
  return u.href.startsWith("https://www.gstatic.com/firebasejs/") || u.hostname === "fonts.googleapis.com" || u.hostname === "fonts.gstatic.com";
}
const fromMind = e => mindPages.has(e.clientId) || /\/mind\//.test(e.request.referrer || "");
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const u = new URL(e.request.url), own = u.origin === self.location.origin && u.pathname.includes("/mind/");
  if (e.request.mode === "navigate") {
    if (!own) {   // another page of the site with no internet: open Mind Games instead (if its copy is here)
      if (u.origin !== self.location.origin) return;
      const toMind = () => fromCopy(new URL("mind/", self.registration.scope).href).then(m => m ? Response.redirect(new URL("mind/?offline=1", self.registration.scope).href, 302) : Response.error());
      e.respondWith(self.navigator && navigator.onLine === false ? toMind().then(r => r.type === "error" ? fetch(e.request) : r) : fetch(e.request).catch(toMind));
      return;
    }
    if (e.resultingClientId) mindPages.add(e.resultingClientId);
  }
  else if (!((own || shared(u)) && fromMind(e))) return;
  if (e.clientId && own) mindPages.add(e.clientId);
  e.respondWith(fetch(e.request).then(r => {
    if (r && (r.ok || r.type === "opaque")) { const copy = r.clone(); caches.open(MIND).then(c => c.put(e.request, copy)).catch(() => {}); }
    return r;
  }).catch(() => fromCopy(e.request).then(m => m || Response.error())));
});
