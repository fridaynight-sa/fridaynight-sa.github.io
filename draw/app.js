/* ارسم وخمّن — drawing & guessing (online, Firebase).
   Each turn one player draws: they pick 1 of 3 words, draw it live, and the others type guesses.
   Faster right guesses score more; the drawer scores for every right guess.
   Paths under draw/<CODE>/:
     state          public state written by the host (no word until the reveal)
     players/<pid>  each player's entry: name, key, word pick / guesses sealed to the host
     strokes/sNNNN  the drawing, written live by the drawer
     hidden         host-only (sealed): the turn's word options and the chosen word
   Secrets are sealed with fncrypto.js; wrong guesses are shown to everyone, right ones never are.
   Values are stored as {j: JSON string}. */
(function () {
  "use strict";
  const app = document.getElementById("app");
  const chip = document.getElementById("hdrChip");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rnd = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
  const rint = n => Math.floor(rnd() * n);
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rint(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const rid = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, "0")).join("");
  const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  // loose compare: no tashkeel/tatweel, one alef/yaa/haa, no "ال", no spaces
  const norm = s => String(s || "").toLowerCase().replace(/[ً-ْٰـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .replace(/(^|\s)ال/g, "$1").replace(/[^\p{L}\p{N}]+/gu, "");
  function dist(a, b) { // edit distance (small strings)
    const m = a.length, n = b.length, d = Array.from({ length: m + 1 }, (_, i) => [i].concat(Array(n).fill(0)));
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }

  let WORDS = [];
  const CHOOSE_S = 15, DRAW_S = 80, REVEAL_S = 7, MIN_P = 2, VOTE_S = 60, AWARD_S = 25, BEST_PTS = 10, VOTE_MIN_P = 3;
  const COLORS = ["#2b1745", "#e03131", "#ff8a00", "#ffd43b", "#12a874", "#1c7ed6", "#7c3aed", "#f03e7a", "#8b5a2b"];
  const SIZES = [5, 12, 26];

  /* ---------------- engine ---------------- */
  const guessPts = (left, total) => 2 + Math.ceil(8 * Math.max(0, left) / (total || DRAW_S)); // 3…10
  // the drawer gets the fastest guesser's points + 1 for every other right guess,
  // so drawing well always pays more than it gives the others
  const drawerPts = pts => { const v = Object.values(pts); return v.length ? Math.max(...v) + (v.length - 1) : 0; };
  function hintFor(word, order, shown) { // "" = hidden letter, " " = space
    const ch = Array.from(word), out = ch.map(c => c === " " ? " " : "");
    order.slice(0, shown).forEach(i => { out[i] = ch[i]; });
    return out;
  }
  const hintsAt = (el, letters, total) => { const T = total || DRAW_S; return letters < 3 ? 0 : el > T * 0.7 ? Math.min(2, letters - 2) : el > T * 0.4 ? 1 : 0; };
  const DRAW_TIMES = [60, 80, 120];
  const drawS = () => (S && DRAW_TIMES.includes(S.dt) ? S.dt : DRAW_S);   // the host picks it in the lobby
  function judge(word, guess) {
    const a = norm(guess), b = norm(word);
    if (!a) return "none";
    if (a === b) return "right";
    return b.length >= 4 && dist(a, b) === 1 ? "close" : "wrong";
  }

  /* ---------------- firebase ---------------- */
  const CFG = self.FIREBASE_CONFIG;
  let db = null;
  try { if (CFG && CFG.databaseURL && self.firebase) { firebase.initializeApp(CFG); db = firebase.database(); } } catch (e) { console.error(e); }
  const enc = o => ({ j: JSON.stringify(o) });
  const dec = v => { try { return v && typeof v.j === "string" ? JSON.parse(v.j) : null; } catch (e) { return null; } };
  const MKEY = "draw-me-v1";
  let ME = LS.get(MKEY, null);
  let S = null, P = {}, HID = null, STROKES = {}, subs = [], view = "home", lastStep = null, stepStart = 0, tick = null;
  let OFFER = null, DWORD = null, hidSeq = 0, offSeq = 0, dwSeq = 0, gn = 0;
  const myKey = () => FNC.pub();
  const isHost = () => S && ME && S.host === ME.pid;
  const ref = p => db.ref("draw/" + ME.code + (p ? "/" + p : ""));
  const nameOf = id => (P[id] && P[id].name) || (S && S.names && S.names[id]) || "؟";
  const myEntry = () => (P[ME.pid] || {});
  function writeMe(patch) { const cur = Object.assign({}, myEntry(), patch); P[ME.pid] = cur; return ref("players/" + ME.pid).set(enc(cur)); }
  function writeState(patch) { S = Object.assign({}, S, patch); return ref("state").set(enc(S)); }
  const tvURL = () => location.origin + location.pathname.replace(/draw\/?(index\.html)?$/, "") + "tv/";
  const joinURL = c => location.origin + location.pathname + "#" + c;
  const pids = () => Object.keys(P).sort((a, b) => (P[a].at || 0) - (P[b].at || 0));
  const stepKey = () => S ? (S.phase + ":" + (S.tid || "")) : "";
  const amDrawer = () => S && ME && S.drawer === ME.pid;
  const elapsed = () => (Date.now() - stepStart) / 1000;

  function unsubscribe() { subs.forEach(f => f()); subs = []; }
  function subscribe() {
    unsubscribe();
    const on = (r, cb) => { const h = s => cb(s.val()); r.on("value", h); subs.push(() => r.off("value", h)); };
    on(ref("state"), v => {
      S = dec(v); const k = stepKey();
      if (k !== lastStep) { lastStep = k; stepStart = S && S.t0 && Math.abs(Date.now() - S.t0) < 15000 ? Math.min(Date.now(), S.t0) : Date.now(); }
      openOffer(); openWord(); render(); hostTick();
    });
    on(ref("players"), v => { P = {}; Object.entries(v || {}).forEach(([k, x]) => { const d = dec(x); if (d) P[k] = d; }); render(); hostTick(); });
    on(ref("strokes"), v => { STROKES = v || {}; if (board) board.set(DrawBoard.parse(STROKES, dec)); });
    on(ref("hidden"), async v => { const n = ++hidSeq, o = await FNC.open(dec(v)); if (n !== hidSeq) return; HID = o || null; hostTick(); });
  }
  // the drawer's 3 word options and the chosen word come sealed in state
  async function openOffer() {
    const n = ++offSeq, box = S && S.phase === "choose" && amDrawer() ? S.offer : null;
    const v = box ? await FNC.open(box) : undefined;
    if (n !== offSeq) return;
    const next = Array.isArray(v) ? { tid: S.tid, opts: v } : null;
    if (JSON.stringify(next) !== JSON.stringify(OFFER)) { OFFER = next; render(); }
  }
  async function openWord() {
    const n = ++dwSeq, box = S && (S.phase === "draw") && amDrawer() ? S.dword : null;
    const v = box ? await FNC.open(box) : undefined;
    if (n !== dwSeq) return;
    const next = typeof v === "string" ? { tid: S.tid, w: v } : null;
    if (JSON.stringify(next) !== JSON.stringify(DWORD)) { DWORD = next; render(); }
  }
  const genCode = () => { const L = "ABCDEFGHJKLMNPQRSTUVWXYZ"; return Array.from({ length: 4 }, () => L[rint(L.length)]).join(""); };
  async function createRoom(name) {
    let code = genCode();
    if (self.FNN && FNN.room) code = FNN.room;   // سهرة: the night already picked this room's code
    else for (let i = 0; i < 5; i++) { const s = await db.ref("draw/" + code + "/state").get(); if (!s.exists()) break; code = genCode(); }
    ME = { pid: (self.FNN && FNN.pid) || "p" + rid(8), name, code }; LS.set(MKEY, ME);
    S = { v: 1, host: ME.pid, hk: await myKey(), phase: "lobby", rounds: 1, scores: {}, used: [], names: {}, at: Date.now() };
    if (self.FNN) S.nt = FNN.n;   // which step of the سهرة this room is
    await ref("state").set(enc(S));
    await writeMe({ name, at: Date.now(), key: await myKey(), sn: packSeen() });
    view = "room"; history.replaceState(null, "", "#" + code); subscribe();
  }
  async function joinRoom(code, name) {
    const s = await db.ref("draw/" + code + "/state").get();
    if (!s.exists()) throw new Error("nocode");
    const same = ME && ME.code === code ? ME.pid : null;
    // two players with the same name make the rounds confusing: the name must be free in this room
    const mine = same || (self.FNN && FNN.pid) || null, nm = x => String(x || "").trim().toLowerCase();
    const others = (await db.ref("draw/" + code + "/players").get()).val() || {};
    if (Object.entries(others).some(([id, x]) => id !== mine && nm((dec(x) || {}).name) === nm(name))) throw new Error("taken");
    ME = { pid: same || (self.FNN && FNN.pid) || "p" + rid(8), name, code }; LS.set(MKEY, ME);
    P = {};
    const cur = dec((await db.ref("draw/" + code + "/players/" + ME.pid).get()).val()) || {};
    await db.ref("draw/" + code + "/players/" + ME.pid).set(enc(Object.assign({}, cur, { name, key: await myKey(), sn: packSeen(), at: cur.at || Date.now() })));
    S = dec(s.val()); view = "room"; history.replaceState(null, "", "#" + code); subscribe();
  }
  function leaveRoom() { unsubscribe(); if (ME) { ME.code = null; LS.set(MKEY, ME); } S = null; P = {}; HID = null; STROKES = {}; board = null; frame = ""; history.replaceState(null, "", location.pathname); goHome(); }

  /* ---------------- host ---------------- */
  async function saveHidden(H) { HID = H; await ref("hidden").set(enc(await FNC.seal(await myKey(), H))); }
  // Every phone remembers the words it has seen drawn (any room, any night). The host offers words
  // nobody in the room has seen; once everything was seen, the ones seen longest ago come back first.
  const SEEN_KEY = "draw-seen-v1";
  const seenList = () => { const v = LS.get(SEEN_KEY, []); return Array.isArray(v) ? v.filter(x => typeof x === "string") : []; };
  function noteSeen(w) { if (!w) return; const l = seenList().filter(x => x !== w); l.push(w); LS.set(SEEN_KEY, l.slice(-1500)); }
  // sent in the player's record: the latest seen words, up to 900 letters
  function packSeen() { const l = seenList(); let out = [], n = 0; for (let i = l.length - 1; i >= 0 && n + l[i].length + 1 <= 900; i--) { out.unshift(l[i]); n += l[i].length + 1; } return out.join("|"); }
  const unpackSeen = s => typeof s === "string" && s ? s.split("|").slice(0, 300) : [];
  function seenWeights(lists) { const w = {}; lists.forEach(l => { const L = l.length || 1; l.forEach((k, p) => { w[k] = (w[k] || 0) + 1 + p / L; }); }); return w; }
  function pickWords(used, w) {
    w = w || {};
    const all = [...new Set(WORDS.flatMap(c => c.words))];
    return all.map(x => ({ x, s: (used.includes(x) ? 1000 : 0) + (w[x] || 0) + rnd() * 0.3 })).sort((a, b) => a.s - b.s).slice(0, 3).map(o => o.x);
  }
  async function hostStart() {
    const ids = pids();
    if (ids.length < MIN_P) return `تحتاجون ${MIN_P} لاعبين على الأقل.`;
    const noKey = ids.filter(id => !P[id].key);
    if (noKey.length) return "لازم " + noKey.map(id => P[id].name).join(" و") + " يحدّث الصفحة.";
    const names = {}; ids.forEach(id => names[id] = P[id].name);
    const scores = {}; ids.forEach(id => scores[id] = 0);
    const queue = []; for (let r = 0; r < (S.rounds || 1); r++) queue.push(...shuffle(ids));
    (S.gal || []).forEach(g => db.ref("media/" + g.m).remove().catch(() => {}));
    await writeState({ game: (S.game || 0) + 1, order: ids, names, scores, queue, total: queue.length, turn: -1, gal: [], award: null });
    await startTurn(0);
    return "";
  }
  async function startTurn(i) {
    const drawer = S.queue[i];
    if (!P[drawer] || !P[drawer].key) { // drawer left: skip their turn
      if (i + 1 < S.queue.length) return startTurn(i + 1);
      return writeState({ phase: "end" });
    }
    const opts = pickWords(S.used || [], seenWeights([seenList()].concat((S.order || []).filter(id => id !== ME.pid && P[id]).map(id => unpackSeen(P[id].sn))))), tid = rid(4);
    await saveHidden({ tid, opts, word: null, hint: null, seen: {} });
    await ref("strokes").remove();
    await writeState({ phase: "choose", turn: i, drawer, tid, t0: Date.now(), offer: await FNC.seal(P[drawer].key, opts), dword: null, hint: null, correct: {}, chat: [], word: null, dpts: 0 });
  }
  async function hostBeginDraw(word) {
    const letters = Array.from(word).map((c, i) => c === " " ? -1 : i).filter(i => i >= 0);
    await saveHidden(Object.assign({}, HID, { word, hint: shuffle(letters), seen: {} }));
    await writeState({ phase: "draw", t0: Date.now(), dword: await FNC.seal(P[S.drawer].key, word), hint: hintFor(word, [], 0) });
  }
  const guessers = () => (S.order || []).filter(id => id !== S.drawer && P[id]);
  let ticking = false;
  async function hostTick() {
    if (!isHost() || ticking || !S || !HID || HID.tid !== S.tid) return;
    ticking = true;
    try {
      const el = elapsed();
      if (S.phase === "choose") {
        const pk = P[S.drawer] && P[S.drawer].pick;
        let w = pk && pk.t === S.tid ? await FNC.open(pk.s) : undefined;
        if (typeof w !== "string" || !HID.opts.includes(w)) w = el > CHOOSE_S + 1 || !P[S.drawer] ? HID.opts[0] : null;
        if (w) await hostBeginDraw(w);
      } else if (S.phase === "draw") {
        const word = HID.word, correct = Object.assign({}, S.correct || {}), chat = (S.chat || []).slice(), seen = Object.assign({}, HID.seen || {});
        let ch = false;
        for (const id of guessers()) {
          const g = P[id].g;
          if (!g || g.t !== S.tid || correct[id] || (seen[id] || 0) >= g.n) continue;
          seen[id] = g.n;
          const text = await FNC.open(g.s); if (typeof text !== "string") continue;
          const j = judge(word, text);
          if (j === "right") correct[id] = guessPts(drawS() - el, drawS());
          else if (j === "close") chat.push({ k: id + ":" + g.n, p: id, c: 1 });
          else if (j === "wrong") chat.push({ k: id + ":" + g.n, p: id, t: String(text).slice(0, 30) });
          ch = true;
        }
        const shown = hintsAt(el, Array.from(word).filter(c => c !== " ").length, drawS());
        const hint = hintFor(word, HID.hint || [], shown);
        const hintCh = JSON.stringify(hint) !== JSON.stringify(S.hint);
        if (ch) await saveHidden(Object.assign({}, HID, { seen }));
        const all = guessers().length && guessers().every(id => correct[id]);
        if (all || el > drawS() + 1) { await hostReveal(correct); return; }
        if (ch || hintCh) await writeState({ correct, chat: chat.slice(-14), hint });
      } else if (S.phase === "reveal") {
        if (el > REVEAL_S) await hostNext();
      } else if (S.phase === "vote") {
        const voters = (S.order || []).filter(id => P[id]);
        if (voters.every(id => voteDone(id)) || el > VOTE_S + 1) await hostAward();
      } else if (S.phase === "award") {
        if (el > AWARD_S) await writeState({ phase: "end" });
      }
    } finally { ticking = false; }
  }
  let revealing = false;
  async function hostReveal(correct) {
    if (revealing || !S || S.phase !== "draw") return;
    revealing = true;
    try { await doReveal(correct); } finally { revealing = false; }
  }
  // the finished drawing goes to media/<id> (a small JPEG) for the gallery at the end of the game
  async function saveDrawing(word, n) {
    const list = DrawBoard.parse(STROKES, dec);
    if (!list.length || !db) return null;
    try { const id = rid(16); await db.ref("media/" + id).set({ d: DrawBoard.snapshot(list), t: firebase.database.ServerValue.TIMESTAMP }); return { m: id, w: word || "", d: S.drawer, n }; }
    catch (e) { console.warn("gallery save failed", e); return null; }
  }
  async function doReveal(correct) {
    correct = correct || S.correct || {};
    const scores = Object.assign({}, S.scores), n = Object.keys(correct).length;
    Object.entries(correct).forEach(([id, p]) => scores[id] = (scores[id] || 0) + p);
    const dpts = drawerPts(correct); scores[S.drawer] = (scores[S.drawer] || 0) + dpts;
    const word = HID && HID.word;
    const pic = await saveDrawing(word, n), gal = (S.gal || []).concat(pic ? [pic] : []);
    await writeState({ phase: "reveal", t0: Date.now(), word, correct, scores, dpts, hint: null, dword: null, gal, used: (S.used || []).concat(word ? [word] : []) });
  }
  const voteDone = id => { const v = P[id] && P[id].v; return !!(v && v.g === S.game && v.done); };
  let awarding = false;
  async function hostAward() {
    if (awarding || S.phase !== "vote") return;
    awarding = true;
    try {
      const gal = S.gal || [], best = gal.map(() => 0), worst = gal.map(() => 0);
      for (const id of S.order || []) {
        const v = P[id] && P[id].v; if (!v || v.g !== S.game) continue;
        const o = await FNC.open(v.s); if (!o) continue;
        const ok = i => Number.isInteger(i) && gal[i] && gal[i].d !== id;   // never your own drawing
        if (ok(o.b)) best[o.b]++;
        if (ok(o.w) && o.w !== o.b) worst[o.w]++;
      }
      const top = a => { const m = Math.max(0, ...a); return m ? a.map((c, i) => c === m ? i : -1).filter(i => i >= 0) : []; };
      const b = top(best), w = top(worst), scores = Object.assign({}, S.scores), bonus = {};
      b.forEach(i => { bonus[gal[i].d] = BEST_PTS; });
      Object.keys(bonus).forEach(id => scores[id] = (scores[id] || 0) + bonus[id]);
      await writeState({ phase: "award", t0: Date.now(), scores, award: { b, bc: b.length ? best[b[0]] : 0, w, wc: w.length ? worst[w[0]] : 0, bonus } });
    } finally { awarding = false; }
  }
  async function hostNext() {
    const i = S.turn + 1;
    if (i >= S.total) {
      // 🖼️ the gallery vote needs 3 players (nobody votes for their own) and 2 drawings
      const canVote = (S.gal || []).length >= 2 && (S.order || []).filter(id => P[id]).length >= VOTE_MIN_P;
      await writeState(canVote ? { phase: "vote", t0: Date.now(), word: null, award: null } : { phase: "end", word: null });
      return;
    }
    await startTurn(i);
  }
  setInterval(() => { if (view === "room") hostTick(); }, 500);

  /* ---------------- drawing (drawer only) ---------------- */
  let board = null, frame = "", tool = { c: COLORS[0], w: SIZES[1] }, cur = null, flushT = 0;
  const strokeKeys = () => Object.keys(STROKES).sort();
  const nextKey = () => { const ks = strokeKeys(); const last = ks.length ? parseInt(ks[ks.length - 1].slice(1), 10) : -1; return "s" + String(last + 1).padStart(4, "0"); };
  function flush(final) {
    if (!cur) return;
    const now = Date.now();
    if (!final && now - flushT < 90) return;
    flushT = now;
    const s = cur.f ? { f: 1, c: cur.c, p: cur.p.slice() } : { c: cur.c, w: cur.w, p: cur.p.slice() };
    STROKES[cur.k] = enc(s);
    ref("strokes/" + cur.k).set(enc(s)).catch(() => {});
  }
  function bindCanvas(cv) {
    cv.addEventListener("pointerdown", e => {
      if (!amDrawer() || S.phase !== "draw") return;
      e.preventDefault(); cv.setPointerCapture(e.pointerId);
      const [x, y] = board.at(e);
      if (tool.fill) { cur = { k: nextKey(), c: tool.c, f: 1, p: [x, y] }; flush(true); cur = null; board.set(DrawBoard.parse(STROKES, dec)); return; }   // 🪣 one tap
      cur = { k: nextKey(), c: tool.c, w: tool.w, p: [x, y] }; board.live(cur); flushT = 0; flush(false);
    });
    cv.addEventListener("pointermove", e => {
      if (!cur) return; e.preventDefault();
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      evs.forEach(ev => { const [x, y] = board.at(ev), p = cur.p, lx = p[p.length - 2], ly = p[p.length - 1]; if (Math.abs(x - lx) + Math.abs(y - ly) >= 4) p.push(x, y); });
      board.live(cur); flush(false);
    });
    const end = () => { if (!cur) return; flush(true); cur = null; board.live(null); };
    cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  }

  /* ---------------- views ---------------- */
  function standings(deltas) {
    const ids = Object.keys(S.scores || {}).sort((a, b) => (S.scores[b] || 0) - (S.scores[a] || 0));
    return `<table><thead><tr><th>اللاعب</th>${deltas ? `<th class="n">هالدور</th>` : ""}<th class="n">النقاط</th></tr></thead><tbody>${ids.map(id => `<tr><td>${esc(nameOf(id))}${id === ME.pid ? " (أنت)" : ""}</td>${deltas ? `<td class="n ${deltas[id] ? "plus" : ""}">${deltas[id] ? "+" + deltas[id] : "0"}</td>` : ""}<td class="n">${S.scores[id] || 0}</td></tr>`).join("")}</tbody></table>`;
  }
  const hintHTML = h => h ? `<div class="hint" dir="rtl">${h.map(c => c === " " ? `<i class="sp"></i>` : `<i>${esc(c)}</i>`).join("")}</div>` : "";
  const chatHTML = () => `<ul class="chat">${(S.chat || []).filter(m => !m.c || m.p === ME.pid).slice().reverse().map(m => `<li><b>${esc(nameOf(m.p))}:</b> ${m.c ? `<span class="close">🔥 قريب! (لك بس)</span>` : esc(m.t)}</li>`).join("")}</ul>`;
  const playersHTML = () => `<ul class="plist">${(S.order || []).map(id => `<li class="${id === ME.pid ? "me" : ""} ${(S.correct || {})[id] ? "done" : ""}">${id === S.drawer ? "✏️ " : ""}${esc(nameOf(id))}</li>`).join("")}</ul>`;
  const turnHead = () => `<p class="note center">الدور ${S.turn + 1} من ${S.total} · الرسّام: <b>${esc(nameOf(S.drawer))}</b></p>`;
  const timerBar = () => `<div class="tbar"><i id="tb" style="width:100%"></i></div>`;
  function startTimer(sec) {
    const upd = () => { const left = Math.max(0, sec * 1000 - (Date.now() - stepStart)); const b = document.getElementById("tb"); if (b) b.style.width = (left / (sec * 1000) * 100) + "%"; const n = document.getElementById("tn"); if (n) n.textContent = Math.ceil(left / 1000); };
    upd(); tick = setInterval(upd, 250);
  }
  // the draw phase keeps its canvas; only the parts around it are refreshed
  function drawFrame() {
    const me = amDrawer();
    const k = "draw:" + S.tid + ":" + (me ? "d" : "g");
    if (frame !== k || !document.getElementById("cv")) {
      if (frame.split(":")[1] !== String(S.tid)) tool.fill = false;   // a new turn starts with the pen
      frame = k;
      app.innerHTML = `<div class="card drawcard">${turnHead()}<div class="topline"><span id="topw"></span><span class="secs" id="tn"></span></div>${timerBar()}
        <canvas id="cv" class="board ${me ? "mine" : ""}" aria-label="لوحة الرسم"></canvas>
        ${me ? `<div class="tools"><div class="colors">${COLORS.map(c => `<button type="button" data-color="${c}" style="--c:${c}" aria-label="لون"></button>`).join("")}<button type="button" data-color="#ffffff" class="eraser" aria-label="ممحاة">🧽</button></div>
          <div class="sizes">${SIZES.map(w => `<button type="button" data-size="${w}" aria-label="حجم"><i style="width:${Math.max(6, w / 1.4)}px;height:${Math.max(6, w / 1.4)}px"></i></button>`).join("")}<button type="button" data-act="fill" class="fillb">🪣 تعبئة</button><button type="button" data-act="undo">↩️ تراجع</button><button type="button" data-act="clear">🗑️ امسح</button></div></div>`
          : `<div class="guess" id="gbox"></div>`}
        <div id="side"></div></div>`;
      const cv = document.getElementById("cv");
      board = DrawBoard.Board(cv); board.set(DrawBoard.parse(STROKES, dec)); bindCanvas(cv);
      if (!me) {
        const gb = document.getElementById("gbox");
        gb.innerHTML = `<div class="grow"><input id="fGuess" class="inp" maxlength="30" placeholder="وش يرسم؟ اكتب تخمينك…" autocomplete="off"><button type="button" class="btn" data-act="guess">أرسل</button></div><p class="note center" id="gmsg"></p>`;
      }
    }
    // refresh the bits around the canvas
    document.getElementById("topw").innerHTML = me ? `ارسم: <b class="word">${esc(DWORD && DWORD.tid === S.tid ? DWORD.w : "…")}</b>` : hintHTML(S.hint);
    document.querySelectorAll("[data-color]").forEach(b => b.classList.toggle("on", b.dataset.color === tool.c));
    document.querySelectorAll("[data-size]").forEach(b => b.classList.toggle("on", !tool.fill && +b.dataset.size === tool.w));
    document.querySelectorAll("[data-act=fill]").forEach(b => b.classList.toggle("on", !!tool.fill));
    if (!me) {
      const ok = (S.correct || {})[ME.pid], inp = document.getElementById("fGuess"), grow = inp && inp.parentElement;
      if (grow) grow.hidden = !!ok;
      if (ok && self.FA) FA.once("dr-ok-" + S.tid, () => FA.right("عرفتها! +" + ok));
      const gm = document.getElementById("gmsg"); if (gm) gm.innerHTML = ok ? `<span class="big-msg">عرفتها! 🎉 <span class="word">+${ok}</span></span>` : "";
    }
    document.getElementById("side").innerHTML = `${chatHTML()}${playersHTML()}${isHost() ? `<button type="button" class="btn alt mt" data-act="hreveal">خلّص الدور</button>` : ""}`;
    clearInterval(tick); startTimer(drawS());
  }
  // gallery pictures (media/<id>), fetched once
  const MEDIA = {};
  function pic(id) {
    if (!id) return "";
    if (MEDIA[id] === undefined && db) { MEDIA[id] = null; db.ref("media/" + id).get().then(v => { const o = v.val(); MEDIA[id] = o && typeof o.d === "string" && /^data:image\/(jpeg|png);/.test(o.d) ? o.d : ""; render(); }).catch(() => { MEDIA[id] = ""; }); }
    return MEDIA[id] ? `<img class="galimg" src="${MEDIA[id]}" alt="الرسمة">` : `<div class="galimg wait">⏳</div>`;
  }
  let galI = 0, myVote = { g: null, b: null, w: null };
  async function sendVote() {
    const gal = S.gal || [], mine = gal.map((g, i) => g.d !== ME.pid ? i : -1).filter(i => i >= 0);
    const done = myVote.b != null && (myVote.w != null || mine.length < 2);
    await writeMe({ v: { g: S.game, s: await FNC.seal(S.hk, { b: myVote.b, w: myVote.w }), done } });
  }
  let lastSeenW = null;
  function render() {
    if (view !== "room") return;
    if (!S) { app.innerHTML = `<div class="card center"><p class="big-msg">جاري الاتصال…</p></div>`; frame = ""; return; }
    chip.hidden = false; chip.innerHTML = `الغرفة <b dir="ltr">${esc(ME.code)}</b> · ${esc(ME.name)}${isHost() ? " 👑" : ""}`;
    if (S.phase === "draw" && (S.order || []).includes(ME.pid)) { drawFrame(); return; }
    frame = ""; board = null; clearInterval(tick); tick = null;
    if (!P[ME.pid] && Object.keys(P).length) { app.innerHTML = `<div class="card center"><p class="big-msg">انشلت من الغرفة</p></div>`; return; }
    const inGame = (S.order || []).includes(ME.pid);
    const leave = `<button type="button" class="btn alt mt" data-act="leave">اطلع من الغرفة</button>`;

    if (S.phase === "lobby" || (!inGame && S.phase !== "end")) {
      const ids = pids();
      let qr = "";
      try { if (typeof QRCode !== "undefined") { const d = document.createElement("div"); new QRCode(d, { text: joinURL(ME.code), width: 240, height: 240, colorDark: "#2b1745", colorLight: "#ffffff" }); const c = d.querySelector("canvas"); qr = c ? c.toDataURL() : ""; } } catch (e) {}
      const waiting = S.phase !== "lobby";
      app.innerHTML = `${waiting ? `<div class="card center"><p class="big-msg">اللعبة شغالة، تدخل معهم في اللعبة الجاية ⏳</p></div>` : ""}
        <div class="card center"><span class="lbl">رمز الغرفة</span><div class="code">${esc(ME.code)}</div>${qr ? `<img class="qr" src="${qr}" alt="باركود الدخول">` : ""}
          <p class="note">خلّ البقية يصوّرون الباركود أو يدخلون الرمز.</p><button type="button" class="ghost mt" data-act="copy">انسخ رابط الدخول</button>
          <p class="note">📺 للعرض على التلفزيون: <b dir="ltr">${esc(tvURL().replace(/^https?:\/\//, ""))}</b></p></div>
        <div class="card"><h2>اللاعبين (${ids.length})</h2><ul class="plist">${ids.map(id => `<li class="${id === ME.pid ? "me" : ""}">${esc(P[id].name)}${id === S.host ? " 👑" : ""}${isHost() && id !== ME.pid && !waiting ? ` <button type="button" data-kick="${id}" aria-label="شيل">✕</button>` : ""}</li>`).join("")}</ul></div>
        ${waiting ? "" : isHost() ? `<div class="card"><div class="field"><span class="lbl">كم مرة يرسم كل واحد؟</span><div class="seg">${[1, 2, 3].map(n => `<button type="button" data-rounds="${n}" class="${(S.rounds || 1) === n ? "on" : ""}">${n}</button>`).join("")}</div></div>
          <div class="field"><span class="lbl">وقت الرسم</span><div class="seg">${DRAW_TIMES.map(n => `<button type="button" data-dt="${n}" class="${drawS() === n ? "on" : ""}">${n} ثانية</button>`).join("")}</div></div>
          <p class="err" id="herr"></p><button type="button" class="btn" data-act="hstart" ${ids.length < MIN_P ? "disabled" : ""}>ابدأ اللعبة</button>${ids.length < MIN_P ? `<p class="note center">ننتظر لاعب ثاني على الأقل.</p>` : ""}</div>`
          : `<div class="card center"><p class="note">ننتظر 👑 ${esc(nameOf(S.host))} يبدأ اللعبة…</p></div>`}
        ${leave}`;
      return;
    }
    if (S.phase === "choose") {
      const me = amDrawer(), offer = OFFER && OFFER.tid === S.tid ? OFFER.opts : null, picked = myEntry().pick && myEntry().pick.t === S.tid;
      app.innerHTML = `<div class="card center">${turnHead()}${timerBar()}
        ${me ? (picked ? `<p class="big-msg">لحظة… ✏️</p>` : `<h2>دورك ترسم! اختار كلمة</h2>${offer ? `<div class="opts mt">${offer.map(w => `<button type="button" data-word="${esc(w)}">${esc(w)}</button>`).join("")}</div>` : `<p class="note">لحظة…</p>`}<p class="note mt">إذا ما اخترت، تنختار لك الأولى.</p>`)
          : `<p class="big-msg">✏️ ${esc(nameOf(S.drawer))} يختار كلمة…</p><p class="note">جهّز نفسك تخمّن!</p>`}</div>
        <div class="card"><h2>الترتيب</h2>${standings()}</div>`;
      startTimer(CHOOSE_S); return;
    }
    if (S.phase === "reveal") {
      if (S.word && lastSeenW !== S.tid) { lastSeenW = S.tid; noteSeen(S.word); }
      const d = Object.assign({}, S.correct || {}); d[S.drawer] = (d[S.drawer] || 0) + (S.dpts || 0);
      const n = Object.keys(S.correct || {}).length;
      if (self.FA) FA.once("dr-rv-" + S.tid, () => { FA.play("reveal", [60, 60]); FA.slam("الكلمة كانت: " + (S.word || ""), n ? `عرفها ${n} 🎉` : "محد عرفها 😅", n ? "#ff7a1a" : "#7c3aed"); });
      app.innerHTML = `<div class="card center">${turnHead()}<p class="note">الكلمة كانت</p><p class="big-msg"><span class="word">${esc(S.word || "")}</span></p>
        <p class="note">${n ? `عرفها ${n} ${n > 1 ? "لاعبين" : "لاعب"} 🎉` : "محد عرفها 😅"}</p>
        <canvas id="cvr" class="board" aria-label="الرسمة"></canvas></div>
        <div class="card"><h2>الترتيب</h2>${standings(d)}${isHost() ? `<button type="button" class="btn mt" data-act="hnext">${S.turn + 1 >= S.total ? "النتيجة النهائية 🏆" : "الدور اللي بعده"}</button>` : ""}</div>`;
      const b = DrawBoard.Board(document.getElementById("cvr")); b.set(DrawBoard.parse(STROKES, dec));
      return;
    }
    if (S.phase === "vote") {
      const gal = S.gal || [], voters = (S.order || []).filter(id => P[id]);
      if (myVote.g !== S.game) myVote = { g: S.game, b: null, w: null };
      galI = Math.max(0, Math.min(gal.length - 1, galI));
      const g = gal[galI] || {}, own = g.d === ME.pid, ndone = voters.filter(voteDone).length;
      if (self.FA) FA.once("dr-gal-" + ME.code + "-" + S.game, () => FA.slam("🖼️ معرض الرسمات", "صوّتوا لأحلى وأسوأ رسمة", "#ff7a1a"));
      app.innerHTML = `<div class="card center"><h2>🖼️ معرض الرسمات</h2>${timerBar()}
        <p class="dots">${gal.map((x, i) => `<button type="button" data-gal="${i}" class="${i === galI ? "on" : ""} ${myVote.b === i ? "b" : ""} ${myVote.w === i ? "w" : ""}" aria-label="رسمة ${i + 1}"></button>`).join("")}</p>
        ${pic(g.m)}
        <p class="galcap">${esc(g.w)} · رسمة ${esc(nameOf(g.d))}</p><p class="note">${g.n ? `عرفها ${g.n}` : "محد عرفها 😅"}</p>
        <div class="galnav"><button type="button" class="ghost" data-act="gprev" ${galI ? "" : "disabled"}>→ اللي قبل</button><button type="button" class="ghost" data-act="gnext" ${galI < gal.length - 1 ? "" : "disabled"}>اللي بعد ←</button></div>
        ${own ? `<p class="note">هذي رسمتك، ما تقدر تصوّت لها 😄</p>` : `<div class="vb"><button type="button" class="best ${myVote.b === galI ? "on" : ""}" data-vote="b">🏆 أحلى رسمة</button><button type="button" class="worst ${myVote.w === galI ? "on" : ""}" data-vote="w">😂 أسوأ رسمة</button></div>`}
        <p class="note">${myVote.b != null ? "🏆 " + esc(gal[myVote.b].w) : "🏆 ما اخترت"} · ${myVote.w != null ? "😂 " + esc(gal[myVote.w].w) : "😂 ما اخترت"}</p></div>
        <div class="card center"><p class="big-msg">صوّت ${ndone} من ${voters.length} ⏳</p>${isHost() ? `<button type="button" class="btn alt mt" data-act="haward">اعرض النتيجة الحين</button>` : ""}</div>`;
      startTimer(VOTE_S); return;
    }
    if (S.phase === "award") {
      const gal = S.gal || [], a = S.award || { b: [], w: [] }, names = l => l.map(i => nameOf(gal[i].d)).filter((x, i, arr) => arr.indexOf(x) === i).join(" و");
      if (self.FA) FA.once("dr-aw-" + ME.code + "-" + S.game, () => { FA.play("party"); if (a.b.length) FA.slam("🏆 أحلى رسمة: " + names(a.b), "+" + BEST_PTS + " نقاط", "#ffb21e"); });
      const block = (l, cls, title, c) => l.length ? `<div class="card center ${cls}"><h2>${title}: ${esc(names(l))}${cls === "bestc" ? ` <span class="plus">+${BEST_PTS}</span>` : ""}</h2>${l.map(i => `${pic(gal[i].m)}<p class="note">${esc(gal[i].w)} · ${c} ${c === 1 ? "صوت" : "أصوات"}</p>`).join("")}</div>` : "";
      app.innerHTML = `${block(a.b, "bestc", "🏆 أحلى رسمة", a.bc)}${block(a.w, "worstc", "😂 أسوأ رسمة", a.wc)}${!a.b.length && !a.w.length ? `<div class="card center"><p class="big-msg">محد صوّت 😅</p></div>` : ""}
        <div class="card">${isHost() ? `<button type="button" class="btn" data-act="hend">النتيجة النهائية 🏆</button>` : `<p class="note center">ننتظر 👑 ${esc(nameOf(S.host))}…</p>`}</div>`;
      return;
    }
    if (S.phase === "end") {
      if (self.FA) FA.once("dr-end-" + ME.code + "-" + S.game, () => { const ids = Object.keys(S.scores || {}).sort((a, b) => (S.scores[b] || 0) - (S.scores[a] || 0)); if (ids.length) FA.winner(nameOf(ids[0]), ids.map(id => [nameOf(id), S.scores[id] || 0])); });
      const ids = Object.keys(S.scores || {}).sort((a, b) => (S.scores[b] || 0) - (S.scores[a] || 0));
      const medal = ["🥇", "🥈", "🥉"];
      app.innerHTML = `<div class="card"><h2 class="center">النتيجة النهائية 🏆</h2><div class="podium mt">${ids.map((id, i) => `<div><span>${medal[i] || i + 1 + "."} ${esc(nameOf(id))}</span><span>${S.scores[id] || 0}</span></div>`).join("")}</div>
        ${isHost() ? `<button type="button" class="btn mt" data-act="hlobby">لعبة جديدة بنفس الغرفة</button>` : `<p class="note center mt">ننتظر 👑 ${esc(nameOf(S.host))} يبدأ لعبة جديدة…</p>`}</div>${leave}`;
      return;
    }
    // draw phase but not in the game: wait in the lobby view
    app.innerHTML = `<div class="card center"><p class="big-msg">اللعبة شغالة، تدخل معهم في اللعبة الجاية ⏳</p></div>${leave}`;
  }
  async function sendGuess() {
    const inp = document.getElementById("fGuess"); if (!inp) return;
    const t = inp.value.trim(); if (!t || !S.hk || S.phase !== "draw") return;
    inp.value = ""; inp.focus();
    const prev = myEntry().g; gn = Math.max(gn, prev && prev.t === S.tid ? prev.n : 0) + 1;
    await writeMe({ g: { t: S.tid, n: gn, s: await FNC.seal(S.hk, t) } });
  }
  async function roomClick(b) {
    const a = b.dataset.act;
    try {
      if (b.dataset.color) { tool.c = b.dataset.color; if (tool.c === "#ffffff" && tool.w < SIZES[2]) tool.w = SIZES[2]; drawFrame(); return; }
      if (b.dataset.size) { tool.w = +b.dataset.size; tool.fill = false; drawFrame(); return; }
      if (b.dataset.gal != null) { galI = +b.dataset.gal; render(); return; }
      if (a === "gprev") { galI--; render(); return; }
      if (a === "gnext") { galI++; render(); return; }
      if (b.dataset.vote && S.phase === "vote" && S.hk) {
        const k = b.dataset.vote, o = k === "b" ? "w" : "b";
        myVote[k] = myVote[k] === galI ? null : galI; if (myVote[o] === galI && myVote[k] === galI) myVote[o] = null;
        render(); await sendVote(); render();
        return;
      }
      if (a === "haward" && isHost()) { await hostAward(); return; }
      if (a === "hend" && isHost()) { await writeState({ phase: "end" }); return; }
      if (a === "fill" && amDrawer()) { tool.fill = !tool.fill; drawFrame(); return; }
      if (a === "undo" && amDrawer()) { const ks = strokeKeys(); if (ks.length) await ref("strokes/" + ks[ks.length - 1]).remove(); return; }
      if (a === "clear" && amDrawer()) { if (!b.classList.contains("warn")) { b.classList.add("warn"); b.textContent = "متأكد؟"; setTimeout(() => { b.classList.remove("warn"); b.textContent = "🗑️ امسح"; }, 2500); return; } await ref("strokes").remove(); return; }
      if (b.dataset.word && amDrawer() && S.phase === "choose" && S.hk) { await writeMe({ pick: { t: S.tid, s: await FNC.seal(S.hk, b.dataset.word) } }); render(); return; }
      if (a === "guess") { await sendGuess(); return; }
      if (a === "copy") { try { await navigator.clipboard.writeText(joinURL(ME.code)); b.textContent = "انتسخ ✓"; } catch (e) { b.textContent = joinURL(ME.code); } return; }
      if (a === "leave") { leaveRoom(); return; }
      if (!isHost()) return;
      if (b.dataset.kick) { await ref("players/" + b.dataset.kick).remove(); return; }
      if (b.dataset.dt) { await writeState({ dt: +b.dataset.dt }); return; }
      if (b.dataset.rounds) { await writeState({ rounds: +b.dataset.rounds }); return; }
      if (a === "hstart") { b.disabled = true; const m = await hostStart(); if (m) { document.getElementById("herr").textContent = m; b.disabled = false; } return; }
      if (a === "hreveal" && S.phase === "draw") { await hostReveal(); return; }
      if (a === "hnext") { b.disabled = true; await hostNext(); return; }
      if (a === "hlobby") { await ref("strokes").remove(); await writeState({ phase: "lobby", word: null, correct: {}, chat: [] }); return; }
    } catch (e) { console.error(e); alert("ما قدرت أتصل. تأكد من النت وجرّب مرة ثانية."); }
  }

  /* ---------------- home ---------------- */
  function goHome() { view = "home"; chip.hidden = true; clearInterval(tick); frame = ""; renderHome(); }
  function renderHome() {
    app.innerHTML = `<div class="hero"><h1>ارسم وخمّن 🎨</h1><p>واحد يرسم من جواله، والباقين يتسابقون مين يعرف أول!</p></div>
      <div class="modes">
        <button type="button" class="mode" data-act="ocreate"><span class="ic">📡</span><span><b>افتح غرفة</b><span>كل واحد يلعب من جواله (لاعبين وأكثر)</span></span></button>
        <button type="button" class="mode" data-act="ojoin"><span class="ic">🔑</span><span><b>ادخل غرفة</b><span>عندك رمز من صاحبك</span></span></button>
      </div>
      <div class="card mt"><h3>طريقة اللعب</h3><ul class="note"><li>كل دور واحد يرسم: يختار كلمة من 3، ويرسمها بإصبعه (بدون كتابة حروف!).</li><li>الباقين يكتبون تخميناتهم. التخمين الغلط يطلع للكل، والصحيح محد يشوفه.</li><li>كل ما عرفت أسرع، أخذت نقاط أكثر (3 إلى 10)، والرسّام ياخذ نفس نقاط أسرع واحد عرفها، وفوقها <b>+1</b> عن كل واحد ثاني عرفها.</li><li>مع الوقت تنكشف بعض حروف الكلمة كمساعدة.</li></ul>
      <p class="note">📺 أحلى شي تعرضونها على التلفزيون من صفحة «شاشة العرض».</p></div>`;
  }
  function renderForm(kind, code, msg) {
    const nm = (ME && ME.name) || "";
    if (!db) { app.innerHTML = `<div class="card"><h2>الأونلاين مو شغال</h2><p class="note">ما قدرت أتصل بقاعدة البيانات. حدّث الصفحة.</p><button type="button" class="btn mt" data-act="home">رجوع</button></div>`; return; }
    view = kind;
    app.innerHTML = `<div class="card"><h2>${kind === "create" ? "📡 افتح غرفة" : "🔑 ادخل غرفة"}</h2>
      ${kind === "join" ? `<div class="field"><label for="fCode">رمز الغرفة</label><input id="fCode" class="inp codein" maxlength="4" autocomplete="off" value="${esc(code || "")}" placeholder="ABCD"></div>` : ""}
      <div class="field"><label for="fName">اسمك</label><input id="fName" class="inp" maxlength="18" value="${esc(nm)}" placeholder="مثلاً: فيصل"></div>
      <p class="err" id="ferr">${esc(msg || "")}</p>
      <button type="button" class="btn" data-act="${kind === "create" ? "docreate" : "dojoin"}">${kind === "create" ? "افتح الغرفة" : "دخول"}</button>
      <button type="button" class="btn alt mt" data-act="home">رجوع</button></div>`;
  }
  async function homeClick(b) {
    const a = b.dataset.act, err = m => { const e = document.getElementById("ferr"); if (e) e.textContent = m; };
    if (a === "home") { goHome(); return; }
    if (a === "ocreate") { renderForm("create"); return; }
    if (a === "ojoin") { renderForm("join"); return; }
    if (a === "docreate" || a === "dojoin") {
      const name = document.getElementById("fName").value.trim();
      if (!name) { err("اكتب اسمك."); return; }
      b.disabled = true;
      try {
        if (a === "docreate") await createRoom(name);
        else {
          const code = document.getElementById("fCode").value.trim().toUpperCase();
          if (!/^[A-Z]{4}$/.test(code)) { err("الرمز 4 حروف إنجليزية."); b.disabled = false; return; }
          await joinRoom(code, name);
        }
      } catch (e) { b.disabled = false; err(e.message === "nocode" ? "ما لقيت غرفة بهالرمز." : e.message === "taken" ? "الاسم مستخدم في الغرفة، اختار اسم ثاني." : "ما قدرت أتصل. تأكد من النت."); }
    }
  }

  /* ---------------- events / boot ---------------- */
  app.addEventListener("click", e => { const b = e.target.closest("button"); if (!b || b.disabled) return; if (view === "room") roomClick(b); else homeClick(b); });
  app.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "fGuess") { e.preventDefault(); sendGuess(); } });
  const newBtn = document.getElementById("newBtn");
  if (newBtn) {
    let arm = null;
    setInterval(() => { newBtn.hidden = view === "home"; }, 300);
    newBtn.onclick = () => {
      if (!newBtn.classList.contains("warn")) { newBtn.classList.add("warn"); newBtn.textContent = "اضغط مرة ثانية للتأكيد"; arm = setTimeout(() => { newBtn.classList.remove("warn"); newBtn.textContent = "🏠 لعبة جديدة"; }, 3000); return; }
      clearTimeout(arm); newBtn.classList.remove("warn"); newBtn.textContent = "🏠 لعبة جديدة";
      if (view === "room") leaveRoom(); else { history.replaceState(null, "", location.pathname); goHome(); }
    };
  }
  // the host's phone drives the timers: keep its screen awake, catch up when it comes back,
  // and tell everyone else when the host is late to move on
  const LATE = { choose: CHOOSE_S, draw: DRAW_S, reveal: REVEAL_S, vote: VOTE_S, award: AWARD_S };
  Object.defineProperty(LATE, "draw", { get: drawS });
  setInterval(() => {
    if (!self.FNW) return;
    FNW.hold(view === "room" && isHost());
    const lim = view === "room" && S && !isHost() && LATE[S.phase];
    FNW.late(lim && (Date.now() - stepStart) / 1000 > lim + 6 ? nameOf(S.host) : null);
  }, 1000);
  if (self.FNW) FNW.onVisible(() => hostTick());
  fetch("words.json", { cache: "no-cache" }).then(r => r.json()).then(d => {
    WORDS = d.categories;
    const h = (location.hash || "").replace("#", "").toUpperCase();
    // سهرة: the night's host opens this game's room (or comes back to it after a reload)
    if (self.FNN && FNN.host && FNN.room === h && db) db.ref("draw/" + h + "/state").get().then(s => { const o = s.exists() && dec(s.val()); return o && o.host === FNN.pid && o.nt === FNN.n ? joinRoom(h, FNN.name) : createRoom(FNN.name); }).catch(() => renderForm("join", h, "ما قدرت أتصل. تأكد من النت."));
    else if (/^[A-Z]{4}$/.test(h)) {
      if (ME && ME.code === h && ME.name && db) joinRoom(h, ME.name).catch(() => renderForm("join", h, "ما لقيت غرفة بهالرمز."));
      else renderForm("join", h);
    } else if (ME && ME.code && db) joinRoom(ME.code, ME.name).catch(() => { ME.code = null; LS.set(MKEY, ME); goHome(); });
    else goHome();
  }).catch(() => { app.innerHTML = `<div class="card"><p class="big-msg">ما قدرت أحمّل الكلمات. حدّث الصفحة.</p></div>`; });
  self.DR = { pickWords, seenList, packSeen, unpackSeen, seenWeights, judge, norm, hintFor, guessPts, drawerPts };
})();
