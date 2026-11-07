/* جماد حيوان إنسان — online (Firebase), every phone plays.
   A round: the wheel picks a letter (the host's phone picks it with crypto randomness, every phone watches the same
   spin) → everyone writes a word for each category → «🛑 ستوب!» (the others get 5 seconds) or a fixed time →
   the host's phone checks every word (the letter, the dictionary words.json, small typos, words the group accepted
   before) → words it doesn't know go to «الحكم الجماعي» → the reveal, category by category.
   Points per category: the only one with a word 15 · a word nobody else wrote 10 · the same as someone else 5 ·
   nothing or wrong 0 · «ستوب» +5 when all the stopper's words are right.
   Paths under jh/<CODE>/: state (host), players/<pid> (each player: name, key, answers sealed to the host's key, votes).
   jhw/<cat>/<word> = words the group accepted in a vote (any room): accepted on their own next time.
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
  const AR = n => String(n).replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[d]);

  /* ---------------- the game's words ---------------- */
  const CATS = [
    { id: "insan", n: "إنسان", c: "#f03e7a" }, { id: "hayawan", n: "حيوان", c: "#f08c00" }, { id: "nabat", n: "نبات", c: "#12a874" },
    { id: "jamad", n: "جماد", c: "#1c7ed6" }, { id: "bilad", n: "بلاد", c: "#7c3aed" }, { id: "akla", n: "أكلة", c: "#e8590c" },
    { id: "mihna", n: "مهنة", c: "#0c8599" }, { id: "sayyara", n: "سيارة", c: "#495057" }, { id: "musalsal", n: "مسلسل", c: "#ae3ec9" },
    { id: "laeb", n: "لاعب كرة", c: "#2b8a3e" }, { id: "marka", n: "ماركة", c: "#c2255c" }];
  const CAT = Object.fromEntries(CATS.map(c => [c.id, c]));
  const BASE_CATS = ["insan", "hayawan", "nabat", "jamad", "bilad"], MAX_CATS = 8, MIN_CATS = 3;
  const LETTERS = [..."ابتثجحخدذرزسشصضطظعغفقكلمنهوي"], HARD = "ثذضظغ";
  const LNAME = { ا: "الألف", ب: "الباء", ت: "التاء", ث: "الثاء", ج: "الجيم", ح: "الحاء", خ: "الخاء", د: "الدال", ذ: "الذال", ر: "الراء", ز: "الزاي", س: "السين", ش: "الشين", ص: "الصاد", ض: "الضاد", ط: "الطاء", ظ: "الظاء", ع: "العين", غ: "الغين", ف: "الفاء", ق: "القاف", ك: "الكاف", ل: "اللام", م: "الميم", ن: "النون", ه: "الهاء", و: "الواو", ي: "الياء" };
  const showL = l => l === "ا" ? "أ" : l;
  const MIN_P = 2, STOP_S = 5, GRACE = 1500, AFTER_SPIN = 2600, PTS = { only: 15, uniq: 10, same: 5, stop: 5 };

  // the same word however it's written: no vowel marks, one hamza, ة=ه, ى=ي, no «ال», no letters held down (بطططة)
  function norm(s) {
    return String(s || "").replace(/[ً-ٰٟـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
      .replace(/ؤ/g, "و").replace(/ئ/g, "ي").replace(/[^ء-ي\s]/g, " ").replace(/\s+/g, " ").trim().replace(/(.)\1{2,}/g, "$1");
  }
  const keyOf = s => norm(s).replace(/ /g, "");
  const noAl = k => k.length > 3 && k.startsWith("ال") ? k.slice(2) : null;
  // for «the same word»: بطة = بط, بطات = بط
  const dupKey = k => k.length > 4 && k.endsWith("ات") ? k.slice(0, -2) : k.length > 2 && k.endsWith("ه") ? k.slice(0, -1) : k;
  let DICT = {}, ORIG = {}, ANY = new Map(), BYL = {};
  function loadWords(d) {
    DICT = {}; ORIG = {}; ANY = new Map(); BYL = {};
    Object.entries(d.cats || {}).forEach(([c, ws]) => {
      const set = DICT[c] = new Set(), o = ORIG[c] = {}, by = BYL[c] = {};
      ws.forEach(w => {
        const k = keyOf(w); if (!k) return;
        [k, noAl(k)].filter(Boolean).forEach(x => { set.add(x); if (!o[x]) o[x] = w; (by[x[0]] = by[x[0]] || []).push(x); if (!ANY.has(x)) ANY.set(x, new Set()); ANY.get(x).add(c); });
      });
    });
  }
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let p = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const q = [i]; let lo = i;
      for (let j = 1; j <= b.length; j++) { q[j] = Math.min(p[j] + 1, q[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); lo = Math.min(lo, q[j]); }
      if (lo > max) return max + 1; p = q;
    }
    return p[b.length];
  }
  // one word → {st: "none"|"ok"|"bad"|"vote", k, dk, fix, why, hint}
  function check(cat, word, L, learned) {
    const w = String(word || "").trim().slice(0, 30), k = keyOf(w);
    if (!k) return { st: "none" };
    const own = DICT[cat] || new Set(), lr = learned || new Set(), has = x => own.has(x) || lr.has(x);
    const ok = (x, fix) => ({ st: "ok", k: x, dk: dupKey(x), fix: fix || "" });
    if (has(k) && k[0] === L) return ok(k);
    const b = noAl(k) || k;
    if (b[0] !== L) return { st: "bad", k: b, dk: dupKey(b), why: "ما تبدأ بحرف " + LNAME[L] };
    if (has(b)) return ok(b);
    if (b.length >= 4) {                                           // a small slip: one letter off (بطاطص → بطاطس)
      const near = ((BYL[cat] || {})[L] || []).find(x => lev(b, x, 1) <= 1);
      if (near) return ok(near, (ORIG[cat] || {})[near] || near);
    }
    const other = ANY.get(b);
    let hint = "";
    if (other && !other.has(cat)) hint = "القاموس يعرفها: " + [...other].map(c => CAT[c] ? CAT[c].n : c).join(" و");
    else if (b.length >= 4 && (!/[اوي]/.test(b.slice(1)) || /(.)\1/.test(b) && new Set(b).size <= 2)) hint = "شكلها حروف لخبطة";
    return { st: "vote", k: b, dk: dupKey(b), hint };
  }
  // the points of one category: rows [{p, st, dk}] (st "ok" = accepted)
  function scoreCat(rows) {
    const okRows = rows.filter(r => r.st === "ok"), cnt = {};
    okRows.forEach(r => cnt[r.dk] = (cnt[r.dk] || 0) + 1);
    const out = {};
    rows.forEach(r => { out[r.p] = r.st !== "ok" ? 0 : okRows.length === 1 ? PTS.only : cnt[r.dk] === 1 ? PTS.uniq : PTS.same; });
    return out;
  }

  /* ---------------- firebase ---------------- */
  const CFG = self.FIREBASE_CONFIG;
  let db = null;
  try { if (CFG && CFG.databaseURL && self.firebase) { firebase.initializeApp(CFG); db = firebase.database(); } } catch (e) { console.error(e); }
  const enc = o => ({ j: JSON.stringify(o) });
  const dec = v => { try { return v && typeof v.j === "string" ? JSON.parse(v.j) : null; } catch (e) { return null; } };
  const MKEY = "jh-me-v1";
  let ME = LS.get(MKEY, null);
  let S = null, P = {}, subs = [], view = "home", lastStep = null, stepStart = 0, tick = null;
  const myKey = () => FNC.pub();
  const isHost = () => S && ME && S.host === ME.pid;
  const ref = p => db.ref("jh/" + ME.code + (p ? "/" + p : ""));
  const nameOf = id => (P[id] && P[id].name) || (S && S.names && S.names[id]) || "؟";
  const myEntry = () => (P[ME.pid] || {});
  function writeMe(patch) { const cur = Object.assign({}, myEntry(), patch); P[ME.pid] = cur; return ref("players/" + ME.pid).set(enc(cur)); }
  function writeState(patch) { S = Object.assign({}, S, patch); return ref("state").set(enc(S)); }
  const tvURL = () => location.origin + location.pathname.replace(/jhi\/?(index\.html)?$/, "") + "tv/";
  const joinURL = c => location.origin + location.pathname + "#" + c;
  const pids = () => Object.keys(P).sort((a, b) => (P[a].at || 0) - (P[b].at || 0));
  const stepKey = () => S ? (S.phase + ":" + (S.game || 0) + ":" + (S.r || 0)) : "";
  const cur = (e, k) => e && e[k] && S && e[k].r === S.r && e[k].g === S.game ? e[k] : null;   // this round's entry part

  function unsubscribe() { subs.forEach(f => f()); subs = []; }
  const touchMe = () => { if (ME && ME.code && Date.now() - (ME.t || 0) > 20000) { ME.t = Date.now(); LS.set(MKEY, ME); } };
  const BACK_MS = 15 * 60e3;
  function backToRoom() {
    db.ref("jh/" + ME.code + "/state").get().then(s => {
      const o = s.exists() && dec(s.val());
      if (o && o.phase !== "end" && Date.now() - (ME.t || 0) < BACK_MS) return joinRoom(ME.code, ME.name);
      if (!o) { ME.code = null; LS.set(MKEY, ME); }
      goHome();
    }).catch(() => { ME.code = null; LS.set(MKEY, ME); goHome(); });
  }
  function subscribe() {
    unsubscribe();
    const on = (r, cb) => { const h = s => cb(s.val()); r.on("value", h); subs.push(() => r.off("value", h)); };
    on(ref("state"), v => { touchMe(); S = dec(v); const k = stepKey(); if (k !== lastStep) { lastStep = k; stepStart = Date.now(); } render(); hostTick(); });
    on(ref("players"), v => { P = {}; Object.entries(v || {}).forEach(([k, x]) => { const d = dec(x); if (d) P[k] = d; }); render(); hostTick(); });
  }
  const genCode = () => { const L = "ABCDEFGHJKLMNPQRSTUVWXYZ"; return Array.from({ length: 4 }, () => L[rint(L.length)]).join(""); };
  async function createRoom(name) {
    let code = genCode();
    for (let i = 0; i < 5; i++) { const s = await db.ref("jh/" + code + "/state").get(); if (!s.exists()) break; code = genCode(); }
    ME = { pid: "p" + rid(8), name, code }; LS.set(MKEY, ME);
    S = { v: 1, host: ME.pid, hk: await myKey(), phase: "lobby", cats: BASE_CATS.slice(), rounds: 5, mode: "stop", hard: false, scores: {}, names: {}, at: Date.now() };
    await ref("state").set(enc(S));
    await writeMe({ name, at: Date.now(), key: await myKey() });
    view = "room"; history.replaceState(null, "", "#" + code); subscribe();
  }
  async function joinRoom(code, name) {
    const s = await db.ref("jh/" + code + "/state").get();
    if (!s.exists()) throw new Error("nocode");
    const same = ME && ME.code === code ? ME.pid : null, nm = x => String(x || "").replace(/[⁠-⁤]/g, "").trim().toLowerCase();
    const others = (await db.ref("jh/" + code + "/players").get()).val() || {};
    if (Object.entries(others).some(([id, x]) => id !== same && nm((dec(x) || {}).name) === nm(name))) throw new Error("taken");
    ME = { pid: same || "p" + rid(8), name, code }; LS.set(MKEY, ME);
    P = {};
    const c0 = dec((await db.ref("jh/" + code + "/players/" + ME.pid).get()).val()) || {};
    await db.ref("jh/" + code + "/players/" + ME.pid).set(enc(Object.assign({}, c0, { name, key: await myKey(), at: c0.at || Date.now() })));
    S = dec(s.val()); view = "room"; history.replaceState(null, "", "#" + code); subscribe();
  }
  function leaveRoom() { unsubscribe(); if (ME) { ME.code = null; LS.set(MKEY, ME); } S = null; P = {}; history.replaceState(null, "", location.pathname); goHome(); }

  /* ---------------- host ---------------- */
  const allowed = () => LETTERS.filter(l => S.hard || !HARD.includes(l));
  async function hostStart() {
    const ids = pids();
    if (ids.length < MIN_P) return `تحتاجون ${MIN_P} لاعبين على الأقل.`;
    const noKey = ids.filter(id => !P[id].key);
    if (noKey.length) return "لازم " + noKey.map(id => P[id].name).join(" و") + " يحدّث الصفحة.";
    const names = {}, scores = {}; ids.forEach(id => { names[id] = P[id].name; scores[id] = 0; });
    const game = (S.game || 0) + 1, wl = shuffle(allowed());      // the letters sit in a new order on the wheel every game
    await writeState({ game, hk: await myKey(), order: ids, names, scores, used: [], wl, r: 0, total: Math.min(S.rounds, wl.length), res: null, vote: null });
    await hostSpin();
    return "";
  }
  async function hostSpin() {
    const left = S.wl.filter(l => !(S.used || []).includes(l));
    const L = left[rint(left.length)];                            // the letter: crypto randomness, any letter not played yet
    const spin = { idx: S.wl.indexOf(L), turns: 5 + rint(4), off: (rnd() - .5) * .76, dur: 4200 + rint(2400) };
    await writeState({ phase: "spin", r: (S.r || 0) + 1, L, spin, used: (S.used || []).concat(L), stopBy: null, vote: null, res: null, results: null });
  }
  let learned = {}, learnedFor = null;                                                // jhw/<cat>: words this group (or another) accepted before
  async function loadLearned() {
    await Promise.all((S.cats || []).map(c => db.ref("jhw/" + c).get().then(s => { learned[c] = new Set(Object.keys(s.val() || {})); }).catch(() => { learned[c] = learned[c] || new Set(); })));
  }
  let busy = false;
  async function hostTick() {
    if (!isHost() || busy || !S || view !== "room") return;
    busy = true;
    try {
      const el = Date.now() - stepStart, order = S.order || [];
      if (S.phase === "spin" && S.spin && el > S.spin.dur + AFTER_SPIN) await writeState({ phase: "write", wt: Date.now() });
      else if (S.phase === "write") {
        if (S.mode === "stop") {
          const by = order.find(id => cur(P[id], "stop"));
          if (by) await writeState({ phase: "stop", stopBy: by });
        } else if (el > S.mode * 1000 + GRACE || order.every(id => cur(P[id], "fin"))) await hostCheck();
      }
      else if (S.phase === "stop" && el > STOP_S * 1000 + GRACE) await hostCheck();
      else if (S.phase === "vote" && S.vote && order.every(id => { const v = cur(P[id], "vote"); return v && v.v && v.v.length === S.vote.items.length; })) await hostTally();
    } finally { busy = false; }
  }
  // every player's words for this round (sealed to the host's key)
  async function answersNow() {
    const out = {};
    await Promise.all((S.order || []).map(async id => { const a = cur(P[id], "ans"); if (!a || !a.s) return; const o = await FNC.open(a.s); if (o && o.a) out[id] = o.a; }));
    return out;
  }
  async function hostCheck() {
    if (S.phase !== "write" && S.phase !== "stop") return;
    await loadLearned();
    const A = await answersNow(), rows = {};
    (S.cats || []).forEach(c => {
      rows[c] = (S.order || []).map(p => { const w = String((A[p] || {})[c] || "").trim().slice(0, 30); return Object.assign({ p, w }, check(c, w, S.L, learned[c])); });
    });
    // the words nobody's dictionary knows: one card each (two players with the same word share it)
    const items = [];
    (S.cats || []).forEach(c => rows[c].forEach(r => {
      if (r.st !== "vote") return;
      let it = items.find(x => x.c === c && x.k === r.k);
      if (!it) { it = { c, k: r.k, w: r.w, hint: r.hint || "", by: [] }; items.push(it); }
      it.by.push(r.p);
    }));
    await writeState({ phase: items.length ? "vote" : "reveal", results: rows, vote: items.length ? { items } : null, res: items.length ? null : finish(rows) });
  }
  async function hostTally() {
    if (S.phase !== "vote" || !S.vote) return;
    const items = S.vote.items, rows = JSON.parse(JSON.stringify(S.results || {}));
    const verdict = items.map((it, i) => {
      let y = 0, n = 0, hv = null;
      (S.order || []).forEach(id => { const v = cur(P[id], "vote"); const x = v && v.v ? v.v[i] : null; if (x === 1) y++; else if (x === 0) n++; if (id === S.host) hv = x; });
      return y > n || (y === n && hv === 1) ? 1 : 0;              // a tie: the host's vote decides
    });
    items.forEach((it, i) => {
      (rows[it.c] || []).forEach(r => { if (r.st === "vote" && r.k === it.k) { r.st = verdict[i] ? "ok" : "bad"; r.vt = verdict[i] ? "+" : "-"; } });
      if (verdict[i]) db.ref("jhw/" + it.c + "/" + it.k).set(String(it.w).slice(0, 30)).catch(() => {});   // learned for next time
    });
    await writeState({ phase: "reveal", results: rows, vote: Object.assign({}, S.vote, { verdict }), res: finish(rows) });
  }
  // the points of the round: per category, plus «ستوب» when all the stopper's words are right
  function finish(rows) {
    const d = {}; (S.order || []).forEach(id => d[id] = 0);
    const cats = (S.cats || []).map(c => {
      const pts = scoreCat(rows[c]);
      return { c, rows: rows[c].map(r => { d[r.p] = (d[r.p] || 0) + (pts[r.p] || 0); return { p: r.p, w: r.w, st: r.st, pts: pts[r.p] || 0, fix: r.fix || "", why: r.why || "", vt: r.vt || "" }; }) };
    });
    let sb = null;
    if (S.stopBy && (S.cats || []).every(c => (rows[c].find(r => r.p === S.stopBy) || {}).st === "ok")) { sb = S.stopBy; d[sb] += PTS.stop; }
    const scores = Object.assign({}, S.scores); Object.entries(d).forEach(([id, x]) => scores[id] = (scores[id] || 0) + x);
    S.scores = scores;
    return { L: S.L, cats, d, sb };
  }
  async function hostNext() { if ((S.r || 0) >= S.total) await writeState({ phase: "end" }); else await hostSpin(); }

  /* ---------------- player: words ---------------- */
  const draftKey = () => "jh-draft-" + ME.code + "-" + S.game + "-" + S.r;
  let draft = {}, draftFor = "", saving = null, again = false;
  function loadDraft() { const k = draftKey(); if (draftFor !== k) { draftFor = k; draft = LS.get(k, {}) || {}; } }
  const filled = () => (S.cats || []).filter(c => keyOf(draft[c] || "")).length;
  async function saveWords() {
    if (saving) { again = true; return saving; }
    saving = (async () => {
      do {
        again = false;
        LS.set(draftKey(), draft);
        const a = {}; (S.cats || []).forEach(c => a[c] = String(draft[c] || "").slice(0, 30));
        const n = filled();
        await writeMe({ ans: { g: S.game, r: S.r, s: await FNC.seal(S.hk, { a }), n, done: n === (S.cats || []).length } });
      } while (again);
    })().finally(() => { saving = null; });
    return saving;
  }
  let saveT = null;
  const saveSoon = () => { clearTimeout(saveT); saveT = setTimeout(() => saveWords().catch(() => {}), 350); };
  const canWrite = () => S && (S.phase === "write" || S.phase === "stop") && (S.order || []).includes(ME.pid);
  // a little sign next to the box while writing: wrong letter, or a word the dictionary knows
  function mark(c) {
    const el = document.getElementById("st_" + c); if (!el) return;
    const v = draft[c] || "", k = keyOf(v);
    if (!k) { el.textContent = ""; el.parentNode.className = "cf"; return; }
    const r = check(c, v, S.L, learned[c]);
    el.textContent = r.st === "ok" ? "✅" : r.st === "bad" ? "⚠️" : "";
    el.parentNode.className = "cf" + (r.st === "ok" ? " ok" : r.st === "bad" ? " no" : "");
  }

  /* ---------------- views ---------------- */
  const catChip = c => `<span class="vcat" style="background:${CAT[c] ? CAT[c].c : "#888"}">${esc(CAT[c] ? CAT[c].n : c)}</span>`;
  function standings(d) {
    const ids = Object.keys(S.scores || {}).sort((a, b) => (S.scores[b] || 0) - (S.scores[a] || 0));
    return `<table><thead><tr><th>اللاعب</th>${d ? `<th class="n">هالجولة</th>` : ""}<th class="n">النقاط</th></tr></thead><tbody>${ids.map(id => `<tr><td>${esc(nameOf(id))}${id === ME.pid ? " (أنت)" : ""}</td>${d ? `<td class="n ${d[id] ? "plus" : ""}">${d[id] ? "+" + d[id] : "0"}</td>` : ""}<td class="n">${S.scores[id] || 0}</td></tr>`).join("")}</tbody></table>`;
  }
  const roundTag = () => `الجولة ${AR(S.r)} من ${AR(S.total)}`;
  let wheelFor = "", rvI = 0, rvFor = "";
  function render() {
    if (view !== "room") return;
    if (!S) { app.innerHTML = `<div class="card center"><p class="big-msg">جاري الاتصال…</p></div>`; return; }
    chip.hidden = false; chip.innerHTML = `الغرفة <b dir="ltr">${esc(ME.code)}</b> · ${esc(ME.name)}${isHost() ? " 👑" : ""}`;
    if (!P[ME.pid] && Object.keys(P).length) { app.innerHTML = `<div class="card center"><p class="big-msg">انشلت من الغرفة</p></div>`; return; }
    const inGame = (S.order || []).includes(ME.pid);
    const leave = `<button type="button" class="btn alt mt" data-act="leave">اطلع من الغرفة</button>`;
    if (S.phase !== "write" && S.phase !== "stop") { clearInterval(tick); tick = null; }
    document.body.classList.toggle("stopping", S.phase === "stop");
    if (S.phase !== "stop") { const o = document.getElementById("stopov"); if (o) o.remove(); clearInterval(stopT); }

    if (S.phase === "lobby" || (!inGame && S.phase !== "end")) {
      wheelFor = "";
      const ids = pids(), waiting = S.phase !== "lobby";
      let qr = "";
      try { if (typeof QRCode !== "undefined") { const d = document.createElement("div"); new QRCode(d, { text: joinURL(ME.code), width: 240, height: 240, colorDark: "#2b1745", colorLight: "#ffffff" }); const c = d.querySelector("canvas"); qr = c ? c.toDataURL() : ""; } } catch (e) {}
      const set = isHost() && !waiting ? `<div class="card"><h2>⚙️ إعدادات اللعبة</h2>
          <div class="field"><span class="lbl">الخانات (من ${AR(MIN_CATS)} لين ${AR(MAX_CATS)})</span><div class="cats">${CATS.map(c => { const on = (S.cats || []).includes(c.id); return `<button type="button" data-cat="${c.id}" class="${on ? "on" : ""}" style="${on ? "background:" + c.c : ""}">${esc(c.n)}</button>`; }).join("")}</div></div>
          <div class="field"><span class="lbl">عدد الجولات</span><div class="seg">${[5, 10].map(n => `<button type="button" data-rounds="${n}" class="${S.rounds === n ? "on" : ""}">${AR(n)}</button>`).join("")}</div></div>
          <div class="field"><span class="lbl">الوقت</span><div class="seg"><button type="button" data-mode="stop" class="${S.mode === "stop" ? "on" : ""}">🛑 ستوب! (أول واحد يخلص)</button><button type="button" data-mode="60" class="${S.mode === 60 ? "on" : ""}">${AR(60)} ثانية</button><button type="button" data-mode="90" class="${S.mode === 90 ? "on" : ""}">${AR(90)} ثانية</button></div></div>
          <button type="button" class="tog" data-act="hard" aria-pressed="${!!S.hard}"><span>الحروف الصعبة (ض ظ ث ذ غ)</span><span class="sw${S.hard ? " on" : ""}"></span></button>
          <p class="err" id="herr"></p><button type="button" class="btn mt" data-act="hstart" ${ids.length < MIN_P ? "disabled" : ""}>ابدأ اللعبة ←</button>${ids.length < MIN_P ? `<p class="note center">ننتظر لاعب ثاني على الأقل.</p>` : ""}</div>`
        : !waiting ? `<div class="card"><p class="note">الخانات: ${(S.cats || []).map(catChip).join(" ")}</p><p class="note">${AR(S.rounds)} جولات · ${S.mode === "stop" ? "🛑 ستوب" : AR(S.mode) + " ثانية"}</p><p class="note center mt">ننتظر 👑 ${esc(nameOf(S.host))} يبدأ اللعبة…</p></div>` : "";
      app.innerHTML = `${waiting ? `<div class="card center"><p class="big-msg">اللعبة شغالة، تدخل معهم في اللعبة الجاية ⏳</p></div>` : ""}
        <div class="card center"><span class="lbl">رمز الغرفة</span><div class="code">${esc(ME.code)}</div>${qr ? `<img class="qr" src="${qr}" alt="باركود الدخول">` : ""}
          <p class="note">خلّ البقية يصوّرون الباركود أو يدخلون الرمز.</p><button type="button" class="ghost mt" data-act="copy">انسخ رابط الدخول</button>
          <p class="note">📺 للعرض على التلفزيون: <b dir="ltr">${esc(tvURL().replace(/^https?:\/\//, ""))}</b></p></div>
        <div class="card"><h2>اللاعبين (${AR(ids.length)})</h2><ul class="plist">${ids.map(id => `<li class="${id === ME.pid ? "me" : ""}">${esc(P[id].name)}${id === S.host ? " 👑" : ""}${isHost() && id !== ME.pid && !waiting ? ` <button type="button" data-kick="${id}" aria-label="شيل">✕</button>` : ""}</li>`).join("")}</ul></div>
        ${set}${leave}`;
      return;
    }

    if (S.phase === "spin") {
      const k = S.game + ":" + S.r;
      if (wheelFor === k && document.getElementById("wheel")) return;
      wheelFor = k;
      app.innerHTML = `<div class="stage"><span class="rd">${roundTag()}</span><div id="wheel" class="wbox">${JHW.html(S.wl || [], "")}</div>
        <div class="plq" id="plq" hidden><b>${showL(S.L)}</b>حرف ${LNAME[S.L]}</div><p class="cap2" id="cap2">🎰 العجلة تدور…</p></div>`;
      const w = document.getElementById("wheel"), used = (S.used || []).slice(0, -1);
      used.forEach(l => { const i = (S.wl || []).indexOf(l); w.querySelectorAll(`.sl[data-i="${i}"],.lt[data-i="${i}"]`).forEach(x => x.classList.add("used")); });
      let lastT = 0;
      JHW.spin(w, S.spin, (S.wl || []).length, () => { const t = performance.now(); if (t - lastT > 40 && self.FX) { lastT = t; FX.play("tick"); } }, Math.max(0, Date.now() - stepStart)).then(() => {
        if (!S || S.phase !== "spin" || wheelFor !== k) return;
        const p = document.getElementById("plq"), c = document.getElementById("cap2");
        if (p) p.hidden = false; if (c) c.textContent = "جهّزوا أصابعكم… تبدأ الكتابة";
        if (self.FX) FX.play("reveal", [60, 40, 120]);
      });
      return;
    }
    wheelFor = "";

    if (S.phase === "write" || S.phase === "stop") {
      loadDraft();
      const order = S.order || [], done = order.filter(id => { const a = cur(P[id], "ans"); return a && a.done; });
      const k = "w:" + S.game + ":" + S.r;
      if (document.getElementById("wform") && app.dataset.k === k) { paintProgress(done.length, order.length); paintStop(); stopLayer(); return; }
      app.dataset.k = k;
      const cats = S.cats || [], timed = S.mode !== "stop";
      app.innerHTML = `<div class="card" id="wform"><div class="lt2"><div class="t">${showL(S.L)}</div><div class="i"><b>كلمة تبدأ بحرف ${LNAME[S.L]}</b><span id="prog">${AR(done.length)} من ${AR(order.length)} خلّصوا · ${roundTag()}</span><div class="prog2" id="bars">${order.map((id, i) => `<i class="${i < done.length ? "d" : ""}"></i>`).join("")}</div></div>${timed ? `<div class="tm" id="tm">${AR(S.mode)}</div>` : ""}</div>
        ${cats.map(c => `<div class="cf"><label for="f_${c}" style="background:${CAT[c].c}">${esc(CAT[c].n)}</label><input id="f_${c}" data-c="${c}" maxlength="30" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(draft[c] || "")}" placeholder="${showL(S.L)}…"><span class="st" id="st_${c}"></span></div>`).join("")}
        ${timed ? `<button type="button" class="btn mt" data-act="fin" id="finb">خلّصت ✓</button><p class="note center">الوقت يخلص لحاله، أو لما الكل يضغط «خلّصت»</p>`
          : `<button type="button" class="stop mt" data-act="stop" id="stopb">🛑 ستوب!</button><p class="note center" id="stopn">يشتغل لما تعبّي كل الخانات</p>`}</div>${isHost() ? `<button type="button" class="finish" data-act="hcheck">👑 وقّف الجولة الحين</button>` : ""}`;
      cats.forEach(mark); paintStop(); stopLayer();
      if (learnedFor !== S.game) { learnedFor = S.game; loadLearned().then(() => (S.cats || []).forEach(mark)).catch(() => {}); }
      if (timed) {
        clearInterval(tick);
        const up = () => { const left = Math.max(0, S.mode * 1000 - (Date.now() - stepStart)), t = document.getElementById("tm"); if (t) { t.textContent = AR(Math.ceil(left / 1000)); t.classList.toggle("hot", left < 10000); } if (left <= 0) { lockInputs(); saveWords().catch(() => {}); clearInterval(tick); hostTick(); } };
        up(); tick = setInterval(up, 250);
      }
      if (self.FA) FA.once("jh-w-" + k, () => FX && FX.play("whoosh"));
      return;
    }

    if (S.phase === "vote") {
      const items = (S.vote || {}).items || [], mine = cur(myEntry(), "vote"), mv = (mine && mine.v) || [];
      const voted = (S.order || []).filter(id => { const v = cur(P[id], "vote"); return v && v.v && v.v.length === items.length; });
      const tally = i => { let y = 0, n = 0; (S.order || []).forEach(id => { const v = cur(P[id], "vote"); const x = v && v.v ? v.v[i] : null; if (x === 1) y++; else if (x === 0) n++; }); return [y, n]; };
      const sel = LS.get("jh-vsel-" + ME.code + "-" + S.game + "-" + S.r, []) || [];
      const sent = mv.length === items.length;
      app.innerHTML = `<div class="card"><h2 class="center">⚖️ الحكم الجماعي</h2><p class="note center">هالكلمات مو في القاموس. تنقبل؟ (حرف ${LNAME[S.L]})</p></div>
        ${items.map((it, i) => { const [y, n] = tally(i), v = sent ? mv[i] : sel[i]; return `<div class="card vcard">${catChip(it.c)}<div class="vword">${esc(it.w)}</div><div class="vby">كتبها ${it.by.map(id => esc(nameOf(id))).join(" و")}</div>${it.hint ? `<p class="vhint">💡 ${esc(it.hint)}</p>` : ""}
          <div class="vbtn"><button type="button" class="y${v === 1 ? " on" : ""}" data-vote="${i}" data-v="1" ${sent ? "disabled" : ""}>✅ تنقبل</button><button type="button" class="n${v === 0 ? " on" : ""}" data-vote="${i}" data-v="0" ${sent ? "disabled" : ""}>❌ لا</button></div>
          <div class="tally"><span style="color:#12a874">✅ ${AR(y)}</span><span style="color:#e03131">❌ ${AR(n)}</span></div></div>`; }).join("")}
        <div class="card">${sent ? `<p class="big-msg">صوّتت ✓</p>` : `<button type="button" class="btn" data-act="vsend" ${sel.filter(x => x === 0 || x === 1).length === items.length ? "" : "disabled"}>أرسل تصويتي</button>`}
          <p class="note center">صوّت ${AR(voted.length)} من ${AR((S.order || []).length)} · إذا تعادلت يحسمها 👑</p>
          ${isHost() ? `<button type="button" class="btn alt mt" data-act="htally">👑 احسمها الحين</button>` : ""}</div>`;
      return;
    }

    if (S.phase === "reveal" && S.res) {
      const res = S.res, k = S.game + ":" + S.r;
      if (rvFor !== k) { rvFor = k; rvI = 0; }
      const cats = res.cats || [], cc = cats[Math.min(rvI, cats.length - 1)] || { rows: [] };
      if (self.FA) FA.once("jh-rv-" + k, () => { const m = res.d[ME.pid] || 0; FX && FX.play(m ? "right" : "reveal"); if (res.sb === ME.pid) FA.right("ستوب صح! +" + PTS.stop); });
      const rows = cc.rows.slice().sort((a, b) => b.pts - a.pts);
      const tag = r => r.st === "none" ? "" : r.st === "bad" ? `<span class="tag2 bad">${esc(r.vt === "-" ? "رفضتوها بالتصويت" : r.why || "مرفوضة")}</span>`
        : r.pts === PTS.only ? `<span class="tag2 only">الوحيد اللي كتب! 🔥</span>` : r.pts === PTS.uniq ? `<span class="tag2 uniq">ما أحد جابها غيرك!</span>` : `<span class="tag2 same">مكررة</span>`;
      const star = rows.find(r => r.pts === PTS.only) || rows.find(r => r.pts === PTS.uniq);
      app.innerHTML = `<div class="card rv"><div class="rvh">${catChip(cc.c)}<span>حرف ${LNAME[res.L]} · ${roundTag()}</span></div>
        <ul class="rvl">${rows.map(r => `<li class="${r.st === "ok" ? r.pts === PTS.same ? "s" : "u" : "z"}"><span class="w">${esc(r.w || "—")}<small>${esc(nameOf(r.p))}${r.fix ? ` · يقصد «${esc(r.fix)}»` : ""}${r.vt === "+" ? " · قبلتوها ⚖️" : ""}</small></span>${tag(r)}<span class="p">${r.pts ? "+" + AR(r.pts) : AR(0)}</span></li>`).join("")}</ul>
        ${star ? `<p class="fire">🔥 ${esc(nameOf(star.p))} جاب «${esc(star.w)}»</p>` : ""}
        <div class="pager"><button type="button" class="ghost" data-rv="-1" ${rvI <= 0 ? "disabled" : ""}>→ السابقة</button><div class="dots">${cats.map((_, i) => `<i class="${i === rvI ? "on" : ""}"></i>`).join("")}</div><button type="button" class="ghost" data-rv="1" ${rvI >= cats.length - 1 ? "disabled" : ""}>التالية ←</button></div></div>
        ${res.sb ? `<div class="card center"><p class="note">🛑 ${esc(nameOf(res.sb))} قال ستوب وكل كلماته صحيحة: <b>+${AR(PTS.stop)}</b></p></div>` : S.stopBy ? `<div class="card center"><p class="note">🛑 ${esc(nameOf(S.stopBy))} قال ستوب، بس مو كل كلماته صحيحة، فما أخذ الزيادة</p></div>` : ""}
        <div class="card"><h2>النقاط</h2>${standings(res.d)}${isHost() ? `<button type="button" class="btn mt" data-act="hnext">${S.r >= S.total ? "النتيجة النهائية 🏁" : "الجولة اللي بعدها ←"}</button>` : `<p class="note center mt">ننتظر 👑 ${esc(nameOf(S.host))}…</p>`}</div>`;
      return;
    }

    if (S.phase === "end") {
      const ids = Object.keys(S.scores || {}).sort((a, b) => (S.scores[b] || 0) - (S.scores[a] || 0));
      if (self.FA) FA.once("jh-end-" + ME.code + "-" + S.game, () => { FX && FX.play("party"); FA.confetti && FA.confetti(); });
      app.innerHTML = `<div class="card"><h2 class="center">🏁 خلصت اللعبة</h2>${standings(null)}
        ${isHost() ? `<div class="row mt"><button type="button" class="btn" data-act="hlobby">العبوا مرة ثانية</button></div>` : `<p class="note center mt">ننتظر 👑 ${esc(nameOf(S.host))} يبدأ لعبة جديدة…</p>`}</div>${leave}`;
    }
  }
  function paintProgress(n, of) {
    const p = document.getElementById("prog"); if (p) p.textContent = `${AR(n)} من ${AR(of)} خلّصوا · ${roundTag()}`;
    const b = document.getElementById("bars"); if (b) [...b.children].forEach((x, i) => x.classList.toggle("d", i < n));
  }
  function paintStop() {
    const b = document.getElementById("stopb"), all = filled() === (S.cats || []).length;
    if (b) b.disabled = !all || S.phase !== "write";
    const n = document.getElementById("stopn"); if (n) n.textContent = all ? "كل الخانات معبّاة. اضغطها وخلّ الباقين يركضون!" : "يشتغل لما تعبّي كل الخانات";
  }
  const lockInputs = () => document.querySelectorAll("#wform input").forEach(i => { i.disabled = true; });
  // «ستوب!»: red over everything, five seconds that run out on every phone
  let stopT = null;
  function stopLayer() {
    const old = document.getElementById("stopov");
    if (S.phase !== "stop") { if (old) old.remove(); clearInterval(stopT); return; }
    if (old) return;
    const mine = S.stopBy === ME.pid;
    const d = document.createElement("div"); d.className = "stopov" + (mine ? " mine" : ""); d.id = "stopov";
    d.innerHTML = `<div class="sign"><i>قف</i></div><div class="who">${mine ? "قلت ستوب!" : esc(nameOf(S.stopBy)) + " قال ستوب!"}</div><div class="ring" id="sring"><b id="sn">${AR(STOP_S)}</b></div><p>${mine ? "الباقين عندهم ٥ ثواني…" : "بسرعة! كمّل اللي باقي قبل ما يخلص الوقت"}</p>${mine ? "" : `<button type="button" class="back" data-act="hideov">رجوع للخانات ↓</button>`}`;
    document.body.appendChild(d);
    if (self.FX) FX.play("whoosh", [80, 40, 80]);
    clearInterval(stopT);
    const up = () => {
      const left = Math.max(0, STOP_S * 1000 - (Date.now() - stepStart)), s = document.getElementById("sn"), r = document.getElementById("sring");
      if (s) s.textContent = AR(Math.ceil(left / 1000)); if (r) r.style.setProperty("--p", (left / (STOP_S * 1000) * 100) + "%");
      const mini = document.getElementById("stopmini"); if (mini) mini.textContent = "🛑 " + AR(Math.ceil(left / 1000));
      if (left <= 0) { clearInterval(stopT); lockInputs(); saveWords().catch(() => {}); if (s) s.textContent = "٠"; hostTick(); }
    };
    up(); stopT = setInterval(up, 200);
  }
  async function roomClick(b) {
    const a = b.dataset.act;
    try {
      if (a === "copy") { try { await navigator.clipboard.writeText(joinURL(ME.code)); b.textContent = "انتسخ ✓"; } catch (e) { b.textContent = joinURL(ME.code); } return; }
      if (a === "leave") { leaveRoom(); return; }
      if (a === "hideov") { const o = document.getElementById("stopov"); if (o) { o.classList.add("mini"); o.innerHTML = `<b id="stopmini">🛑</b>`; } return; }
      if (a === "stop" && canWrite() && S.phase === "write" && filled() === (S.cats || []).length) {
        b.disabled = true; await saveWords(); await writeMe({ stop: { g: S.game, r: S.r, at: Date.now() } }); return;
      }
      if (a === "fin" && canWrite()) { b.disabled = true; b.textContent = "خلّصت ✓ ننتظر الباقين"; await saveWords(); await writeMe({ fin: { g: S.game, r: S.r } }); hostTick(); return; }
      if (b.dataset.rv) { const n = ((S.res || {}).cats || []).length; rvI = Math.max(0, Math.min(n - 1, rvI + +b.dataset.rv)); render(); return; }
      if (b.dataset.vote !== undefined) {
        const k = "jh-vsel-" + ME.code + "-" + S.game + "-" + S.r, sel = LS.get(k, []) || [];
        sel[+b.dataset.vote] = +b.dataset.v; LS.set(k, sel); render(); return;
      }
      if (a === "vsend") {
        const items = ((S.vote || {}).items || []), sel = LS.get("jh-vsel-" + ME.code + "-" + S.game + "-" + S.r, []) || [];
        if (sel.filter(x => x === 0 || x === 1).length !== items.length) return;
        b.disabled = true; await writeMe({ vote: { g: S.game, r: S.r, v: items.map((_, i) => sel[i]) } }); return;
      }
      if (!isHost()) return;
      if (b.dataset.kick) { await ref("players/" + b.dataset.kick).remove(); return; }
      if (b.dataset.cat) {
        const c = b.dataset.cat, cs = (S.cats || []).slice(), i = cs.indexOf(c);
        if (i >= 0) { if (cs.length <= MIN_CATS) return; cs.splice(i, 1); } else { if (cs.length >= MAX_CATS) return; cs.push(c); }
        await writeState({ cats: CATS.map(x => x.id).filter(x => cs.includes(x)) }); return;
      }
      if (b.dataset.rounds) { await writeState({ rounds: +b.dataset.rounds }); return; }
      if (b.dataset.mode) { await writeState({ mode: b.dataset.mode === "stop" ? "stop" : +b.dataset.mode }); return; }
      if (a === "hard") { await writeState({ hard: !S.hard }); return; }
      if (a === "hstart") { b.disabled = true; const m = await hostStart(); if (m) { document.getElementById("herr").textContent = m; b.disabled = false; } return; }
      if (a === "hcheck") { if (confirm("توقف الجولة الحين ويبدأ التصحيح؟")) { b.disabled = true; await hostCheck(); } return; }
      if (a === "htally") { b.disabled = true; await hostTally(); return; }
      if (a === "hnext") { b.disabled = true; await hostNext(); return; }
      if (a === "hlobby") { await writeState({ phase: "lobby", res: null, vote: null, results: null, r: 0 }); return; }
    } catch (e) { console.error(e); alert("ما قدرت أتصل. تأكد من النت وجرّب مرة ثانية."); }
  }

  /* ---------------- home ---------------- */
  function goHome() { view = "home"; chip.hidden = true; clearInterval(tick); document.body.classList.remove("stopping"); const o = document.getElementById("stopov"); if (o) o.remove(); renderHome(); }
  function renderHome() {
    app.innerHTML = `<div class="hero"><h1>جماد حيوان إنسان</h1><p>تدور العجلة على حرف… وأسرع واحد يقول ستوب!</p></div>
      <div class="modes">
        <button type="button" class="mode" data-act="ocreate"><span class="ic">📡</span><span><b>افتح غرفة</b><span>كل واحد يلعب من جواله (لاعبين وأكثر)</span></span></button>
        <button type="button" class="mode" data-act="ojoin"><span class="ic">🔑</span><span><b>ادخل غرفة</b><span>عندك رمز من صاحبك</span></span></button>
      </div>
      <div class="card mt"><h3>طريقة اللعب</h3><ul class="note">
        <li>العجلة تدور وتوقف على حرف، وكل واحد يكتب كلمة تبدأ فيه في كل خانة: إنسان، حيوان، نبات، جماد، بلاد… (وتقدرون تضيفون خانات).</li>
        <li>🛑 أول واحد يعبّي كل الخانات يضغط «ستوب»، والباقين عندهم ٥ ثواني بس. أو تختارون وقت ثابت.</li>
        <li>النقاط في كل خانة: الوحيد اللي كتب <b>${AR(PTS.only)}</b> · كلمة ما كتبها غيرك <b>${AR(PTS.uniq)}</b> · نفس كلمة غيرك <b>${AR(PTS.same)}</b>. واللي قال ستوب وكل كلماته صحيحة ياخذ <b>+${AR(PTS.stop)}</b>.</li>
        <li>الكلمات تتصحح لحالها من قاموس فيه آلاف الكلمات، والكلمة اللي ما يعرفها تصوّتون عليها ⚖️، ويتعلمها للمرة الجاية.</li></ul>
      <p class="note">📺 تقدرون تعرضونها على التلفزيون من «شاشة العرض».</p></div>`;
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
  document.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    if (!app.contains(b) && !b.closest("#stopov")) return;
    if (view === "room") roomClick(b); else homeClick(b);
  });
  app.addEventListener("input", e => {
    const t = e.target; if (!t || !t.dataset.c || !canWrite()) return;
    loadDraft(); draft[t.dataset.c] = t.value; LS.set(draftKey(), draft); mark(t.dataset.c); paintStop(); saveSoon();
  });
  app.addEventListener("keydown", e => {                         // «Enter» goes to the next box
    if (e.key !== "Enter" || !e.target.dataset || !e.target.dataset.c) return;
    e.preventDefault(); const all = [...document.querySelectorAll("#wform input")], i = all.indexOf(e.target);
    if (all[i + 1]) all[i + 1].focus(); else e.target.blur();
  });
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
  // the host's phone moves the game on: keep it awake, and catch up when it comes back
  setInterval(() => {
    if (self.FNW) FNW.hold(view === "room" && isHost());
    if (view === "room" && isHost()) hostTick();
  }, 500);
  if (self.FNW) FNW.onVisible(() => hostTick());
  fetch("words.json", { cache: "no-cache" }).then(r => r.json()).then(d => {
    loadWords(d);
    const h = (location.hash || "").replace("#", "").toUpperCase();
    if (/^[A-Z]{4}$/.test(h)) {
      if (ME && ME.code === h && ME.name && db) joinRoom(h, ME.name).catch(() => renderForm("join", h, "ما لقيت غرفة بهالرمز."));
      else renderForm("join", h);
    } else if (ME && ME.code && db) backToRoom();
    else goHome();
  }).catch(() => { app.innerHTML = `<div class="card"><p class="big-msg">ما قدرت أحمّل الكلمات. حدّث الصفحة.</p></div>`; });
  self.JH = { norm, keyOf, check, scoreCat, loadWords, lev, dupKey, get S() { return S; }, get P() { return P; }, get ME() { return ME; } };
})();
