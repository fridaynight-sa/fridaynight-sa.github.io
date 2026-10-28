/* Mind Games — progress for every game in this section.
   1) Each game saves on this phone by itself (its own key, e.g. lamha-v1, dots-v1).
   2) One «رمز تقدمك» for all the games: a backup copy online at mind/<code>/<field>, sent automatically
      after each session, and sent again when the internet comes back (nothing is lost while offline).
   3) Optional Google sign-in: the code is kept with the account (mindu/<uid>), so progress comes back
      on any phone without typing the code. Shown only when firebase-config.js has apiKey + authDomain.
   A game registers itself:  MindSync.register(field, { get: () => data, merge: remoteData => {}, after: () => {} })
   and calls MindSync.save(field) when its data changes. Also turns on offline use (../sw.js). */
(function () {
  "use strict";
  const ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", OK = /^[A-HJ-NP-Z2-9]{8}$/;
  const CODE = "mind-code", DIRTY = "mind-dirty";
  const KEYS = { j: "lamha-v1", dots: "dots-v1", squares: "squares-v1" };          // field online → where that game saves on this phone
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const games = {};
  let db = null, auth = null, user = null, msg = "";

  // offline: the service worker (../sw.js) answers from a copy when there is no internet. It fills the copy
  // when asked, once per site update, so only people who open Mind Games download it.
  let offline = "none";   // none (this browser can't) · wait (copy being made) · ready
  try {
    const me = document.currentScript && new URL(document.currentScript.src), root = me && new URL("../", me);
    if (root && "serviceWorker" in navigator && self.caches) {
      const ver = me.searchParams.get("v") || "0";
      offline = ls.get("mind-cached") ? "ready" : "wait";
      navigator.serviceWorker.register(new URL("sw.js", root)).catch(() => {});
      navigator.serviceWorker.addEventListener("message", e => {
        const d = e.data || {};
        if (d.type === "mind-cached" && d.ok) { ls.set("mind-cached", d.v); offline = "ready"; dispatchEvent(new Event("mindoffline")); }
      });
      if (ls.get("mind-cached") !== ver && navigator.onLine !== false)
        navigator.serviceWorker.ready.then(r => { if (r.active) r.active.postMessage({ type: "cache-mind", v: ver }); }).catch(() => {});
    }
  } catch (e) {}

  const C = self.FIREBASE_CONFIG;
  try { if (C && C.databaseURL && self.firebase) { if (!firebase.apps.length) firebase.initializeApp(C); db = firebase.database(); } } catch (e) { db = null; }

  /* ---------- the code ---------- */
  function code() {
    let c = ls.get(CODE);
    if (!c) {   // players of لمحة from before: their code was kept inside لمحة's save
      try { const g = JSON.parse(ls.get(KEYS.j) || "null"); if (g && OK.test(g.code || "")) { c = g.code; ls.set(CODE, c); } } catch (e) {}
    }
    return c && OK.test(c) ? c : null;
  }
  function ensureCode() {
    let c = code();
    if (!c) { c = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => ABC[b % ABC.length]).join(""); ls.set(CODE, c); }
    return c;
  }
  const show = c => c ? c.slice(0, 4) + "-" + c.slice(4) : "";

  /* ---------- backup ---------- */
  const dirty = () => { try { return JSON.parse(ls.get(DIRTY) || "{}") || {}; } catch (e) { return {}; } };
  const mark = (f, on) => { const d = dirty(); if (on) d[f] = 1; else delete d[f]; ls.set(DIRTY, JSON.stringify(d)); };
  function dataOf(f) {
    if (games[f]) return games[f].get();
    try { return JSON.parse(ls.get(KEYS[f]) || "null"); } catch (e) { return null; }
  }
  function save(f) {
    const d = dataOf(f); if (!d) return Promise.resolve();
    if (ls.get(KEYS[f] + ":in") && !games[f]) return Promise.resolve();   // wait until that game merges what came from the code
    mark(f, true);                                                     // stays marked until the copy really arrives
    if (!db) return Promise.resolve();
    const c = ensureCode();
    return db.ref("mind/" + c + "/" + f).set(JSON.stringify(d)).then(() => { if (code() === c) mark(f, false); link(); }, () => {});
  }
  function flush() { Object.keys(dirty()).forEach(f => { if (KEYS[f]) save(f); }); }
  addEventListener("online", flush);

  /* ---------- bring progress back from a code ---------- */
  function adopt(c, v) {
    let found = false;
    Object.keys(KEYS).forEach(f => {
      let o = null; try { o = v && typeof v[f] === "string" ? JSON.parse(v[f]) : null; } catch (e) {}
      if (!o || typeof o !== "object" || !Array.isArray(o.sessions) || !(o.sessions.length || o.level > 1)) return;   // nothing played under that code
      found = true;
      if (games[f]) games[f].merge(o);
      else ls.set(KEYS[f] + ":in", JSON.stringify(o));        // that game merges it next time it opens
    });
    if (!found) return false;
    ls.set(CODE, c);
    Object.keys(KEYS).forEach(f => { if (dataOf(f)) save(f); });   // the code now holds everything from both phones
    Object.values(games).forEach(g => { try { g.after && g.after(); } catch (e) {} });
    return true;
  }
  async function restore(input) {
    const c = String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!OK.test(c)) return "الرمز 8 حروف وأرقام، مثل ABCD-EFGH.";
    if (!db) return "ما فيه اتصال الحين. جرّب بعدين.";
    let v;
    try { v = (await db.ref("mind/" + c).get()).val(); } catch (e) { return "ما قدرت أرجّع التقدم. تأكد من الاتصال وجرّب مرة ثانية."; }
    return adopt(c, v) ? "" : "ما لقيت تقدم بهالرمز. تأكد منه.";
  }
  function incoming(f) {    // progress that came from a code while this game was closed
    const s = ls.get(KEYS[f] + ":in"); if (!s) return null;
    ls.del(KEYS[f] + ":in");
    try { return JSON.parse(s); } catch (e) { return null; }
  }

  /* ---------- Google (optional) ---------- */
  // the sign-in library loads only once Google sign-in is set up in firebase-config.js (apiKey + authDomain)
  function startAuth() {
    try { auth = firebase.auth(); } catch (e) { auth = null; return; }
    auth.onAuthStateChanged(signedIn);
    paint();
  }
  if (db && C.apiKey && C.authDomain) {
    if (typeof firebase.auth === "function") startAuth();
    else { const s = document.createElement("script"); s.src = "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"; s.onload = startAuth; document.head.appendChild(s); }
  }
  function link() { if (user && db && code()) db.ref("mindu/" + user.uid).set(code()).catch(() => {}); }
  async function signedIn(u) {
    user = u || null;
    if (user) {
      try {
        const saved = (await db.ref("mindu/" + user.uid).get()).val();
        if (OK.test(saved || "") && saved !== code()) {
          const v = (await db.ref("mind/" + saved).get()).val();
          if (!adopt(saved, v || {})) { ls.set(CODE, saved); Object.keys(KEYS).forEach(f => { if (dataOf(f)) save(f); }); }
        } else if (!saved) { ensureCode(); link(); Object.keys(KEYS).forEach(f => { if (dataOf(f)) save(f); }); }
      } catch (e) {}
    }
    paint();
  }
  async function google() {
    if (!auth) return;
    msg = "";
    try { await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); }
    catch (e) {
      if (!/popup-closed|cancelled-popup/.test((e && e.code) || "")) msg = "ما ضبط الدخول بـ Google. جرّب مرة ثانية، أو افتح الموقع في Safari أو Chrome نفسه.";
      paint();
    }
  }

  /* ---------- the card (same in every game and on the section page) ---------- */
  function card() {
    const c = code();
    return `<div class="card" id="mindsync"><h2>🔑 حفظ تقدمك</h2>
      <p class="small" style="margin:0 0 8px">✅ تقدمك ينحفظ في جوالك لحاله، ونسخة احتياطية أونلاين تنحفظ لحالها بعد كل جلسة. رمز واحد لكل ألعاب Mind Games.</p>
      ${c ? `<p class="small muted" style="margin:0 0 4px">رمز تقدمك (تحتاجه بس لو غيّرت جوالك):</p><div class="code">${show(c)}</div>`
        : `<p class="small muted" style="margin:0">رمز تقدمك يطلع لك بعد أول جلسة.</p>`}
      ${auth ? (user
        ? `<p class="small" style="margin:10px 0 6px">👤 داخل بحساب Google${user.email ? `: <bdi>${esc(user.email)}</bdi>` : ""}. تقدمك يرجع لك في أي جوال تدخل منه.</p><button type="button" class="btn alt" data-ms="out">اطلع من حساب Google</button>`
        : `<button type="button" class="btn alt" data-ms="google" style="margin-top:10px">ادخل بحساب Google (اختياري)</button><p class="small muted" style="margin:6px 0 0">بدال الرمز: تقدمك يرجع لك لحاله في أي جوال.</p>`) : ""}
      <p class="small" style="margin:10px 0 6px">عندك رمز من قبل؟</p>
      <div class="row"><input id="msrc" maxlength="9" placeholder="ABCD-EFGH" autocomplete="off" aria-label="رمز التقدم"><button type="button" data-ms="restore">رجّع</button></div>
      <p class="small" id="msmsg" role="status" style="margin:6px 0 0;color:#ffd43b">${esc(msg)}</p></div>`;
  }
  function paint() { const el = document.getElementById("mindsync"); if (el) el.outerHTML = card(); }
  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-ms]"); if (!b) return;
    const a = b.dataset.ms;
    if (a === "restore") {
      b.disabled = true; const m = await restore((document.getElementById("msrc") || {}).value); msg = m || "✅ رجع تقدمك."; paint();
      if (!m && !Object.keys(games).length) setTimeout(() => location.reload(), 900);   // the section page: show the restored numbers
    }
    else if (a === "google") google();
    else if (a === "out") { if (auth) { await auth.signOut().catch(() => {}); msg = ""; paint(); } }
  });

  function register(f, g) { games[f] = g; }
  setTimeout(flush, 1500);
  self.MindSync = { register, save, incoming, code, show, card, restore, flush, get signedIn() { return !!user; }, get offline() { return offline; } };
})();
