/* صدق ولا كذب — bluffing quiz (online, Firebase).
   Each round: a question → every player writes a convincing LIE → all lies + the truth are shuffled →
   everyone picks what they think is true. +2 for picking the truth, +1 to a liar for every player fooled.
   Paths under sq/<CODE>/:
     state          public state written by the host
     players/<pid>  each player's own entry (name, category votes, lie, pick)
     hidden         host-only: picked questions with answers, option→author map (for host reload)
   Values are stored as {j: JSON string}. */
(function () {
  "use strict";
  const app = document.getElementById("app");
  const chip = document.getElementById("hdrChip");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rint = n => Math.floor(Math.random() * n);
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rint(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const rid = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, "0")).join("");
  const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  // compare answers loosely: no diacritics/tatweel, unify alef/yaa/taa marbuta, drop "ال" and spaces/punctuation
  const norm = s => String(s || "").toLowerCase().replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .replace(/(^|\s)ال/g, "$1").replace(/[^\p{L}\p{N}]+/gu, "");

  let CATS = [];
  const catById = id => CATS.find(c => c.id === id);
  const WRITE_S = 60, PICK_S = 30;

  /* ---------------- engine ---------------- */
  function pickQuestions(catIds, n, used) {
    const all = id => catById(id).items.map((it, i) => ({ key: id + ":" + i, cat: id, ...it }));
    const pools = catIds.map(id => { const p = shuffle(all(id).filter(q => !used.includes(q.key))); return p.length ? p : shuffle(all(id)); });
    const out = []; let k = rint(pools.length), guard = 0;
    while (out.length < n && guard++ < 2000) { const p = pools[k % pools.length]; if (p.length) out.push(p.shift()); k++; if (pools.every(x => !x.length)) break; }
    return shuffle(out);
  }
  // Every option (truth + lies) is shown in the same style, so the real answer can't be spotted
  // by how it's written (e.g. "1938م" vs "1990", "13 منطقة" vs "15", tashkeel, ١٢٣ vs 123).
  // Only the on-screen text changes; questions.json stays as is.
  const NUM = "\\d+(?:[.,]\\d+)?";
  const style = s => String(s || "")
    .replace(/[\u0660-\u0669]/g, d => d.charCodeAt(0) - 0x660).replace(/[\u06F0-\u06F9]/g, d => d.charCodeAt(0) - 0x6F0)
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")                      // tashkeel + tatweel
    .replace(new RegExp("(" + NUM + ")\\s*(?:م|هـ|ه)(?=$|\\s)", "g"), "$1") // year marker
    .replace(/[.!؟?،,]+$/, "").replace(/\s+/g, " ").trim();
  const numUnit = s => { const m = s.match(new RegExp("^(" + NUM + ")(?:\\s+(.+))?$")); return m ? { n: m[1], unit: m[2] || "" } : null; };
  // a lie gets the same shape as the truth: bare number <-> number + the truth's unit
  function shapeLie(lie, truthShown) {
    const l = style(lie), t = numUnit(truthShown), x = numUnit(l);
    if (t && x && !t.unit) return x.n;                       // truth "206", lie "300 عظمة" -> "300"
    if (t && x && t.unit && !x.unit) return x.n + " " + t.unit; // truth "13 منطقة", lie "15" -> "15 منطقة"
    return l;
  }
  const lieKey = (lie, truth) => norm(shapeLie(lie, style(truth)));
  const isTruth = (lie, truth) => lieKey(lie, truth) === norm(style(truth));
  // lies: {pid: text}. returns options [{id,text}] and owners {optId: "truth" | [pids]}
  function buildOptions(truth, lies) {
    const T = style(truth);
    const groups = new Map(); // norm -> {text, pids}
    Object.entries(lies).forEach(([pid, text]) => { const shown = shapeLie(text, T), k = norm(shown); if (!k || k === norm(T)) return; if (!groups.has(k)) groups.set(k, { text: shown, pids: [] }); groups.get(k).pids.push(pid); });
    const items = [{ text: T, own: "truth" }].concat([...groups.values()].map(g => ({ text: g.text, own: g.pids })));
    const opts = [], owners = {};
    shuffle(items).forEach((it, i) => { const id = "o" + i; opts.push({ id, text: it.text }); owners[id] = it.own; });
    return { opts, owners };
  }
  function scoreRound(order, owners, picks) {
    const d = {}; order.forEach(id => d[id] = 0);
    const fooled = {}; // optId -> [pickers]
    Object.entries(picks).forEach(([pid, opt]) => {
      const own = owners[opt]; if (!own) return;
      if (own === "truth") d[pid] += 2;
      else if (!own.includes(pid)) { own.forEach(a => d[a] = (d[a] || 0) + 1); (fooled[opt] = fooled[opt] || []).push(pid); }
    });
    return { deltas: d, fooled };
  }

  /* ---------------- firebase ---------------- */
  const CFG = self.FIREBASE_CONFIG;
  let db = null;
  try { if (CFG && CFG.databaseURL && self.firebase) { firebase.initializeApp(CFG); db = firebase.database(); } } catch (e) { console.error(e); }
  const enc = o => ({ j: JSON.stringify(o) });
  const dec = v => { try { return v && typeof v.j === "string" ? JSON.parse(v.j) : null; } catch (e) { return null; } };
  const MKEY = "sq-me-v1";
  let ME = LS.get(MKEY, null);
  let S = null, P = {}, HID = null, subs = [], view = "home", lastStep = null, stepStart = 0, tick = null, draft = "";
  // secrets are sealed (see fncrypto.js): lies + picks go to the host only (plus a copy for the writer),
  // "which option is my lie" goes to each player, hidden (answers) to the host.
  let DEC = {}, MYOPT = null, decSeq = 0, hidSeq = 0, optSeq = 0;
  const myKey = () => FNC.pub();
  const BOX = new Map(); // decrypt cache
  const openC = async box => { if (!box || !box.c) return undefined; if (BOX.has(box.c)) return BOX.get(box.c); const v = await FNC.open(box); if (v !== undefined) BOX.set(box.c, v); return v; };
  async function decAll() {
    const n = ++decSeq, out = {}, host = isHost();
    await Promise.all(Object.entries(P).map(async ([id, e]) => {
      const o = {}, mine = ME && id === ME.pid;
      if (e.lie) { const t = await openC(host ? e.lie.s : mine ? e.lie.m : null) ?? (host && mine ? await openC(e.lie.m) : undefined); if (typeof t === "string") o.lie = { q: e.lie.q, n: e.lie.n, text: t }; }
      if (e.pick) { const t = await openC(host ? e.pick.s : mine ? e.pick.m : null) ?? (host && mine ? await openC(e.pick.m) : undefined); if (typeof t === "string") o.pick = { q: e.pick.q, opt: t }; }
      out[id] = o;
    }));
    if (n !== decSeq) return;
    DEC = out; render(); hostTick();
  }
  async function decMine() {
    const n = ++optSeq, q = S && S.q && S.q.id, box = S && S.mine && ME && S.mine[ME.pid];
    const v = box ? await openC(box) : undefined;
    if (n !== optSeq) return;
    const next = typeof v === "string" ? { q, opt: v } : null;
    if (JSON.stringify(next) !== JSON.stringify(MYOPT)) { MYOPT = next; render(); }
  }
  async function saveHidden(H) { HID = H; await ref("hidden").set(enc(await FNC.seal(await myKey(), H))); }
  const isHost = () => S && ME && S.host === ME.pid;
  const ref = p => db.ref("sq/" + ME.code + (p ? "/" + p : ""));
  const nameOf = id => (P[id] && P[id].name) || (S && S.names && S.names[id]) || "؟";
  const myEntry = () => (P[ME.pid] || {});
  function writeMe(patch) { const cur = Object.assign({}, myEntry(), patch); P[ME.pid] = cur; return ref("players/" + ME.pid).set(enc(cur)); }
  function writeState(patch) { S = Object.assign({}, S, patch); return ref("state").set(enc(S)); }
  const tvURL = () => location.origin + location.pathname.replace(/sedq\/?(index\.html)?$/, "") + "tv/";
  const joinURL = c => location.origin + location.pathname + "#" + c;
  const pids = () => Object.keys(P).sort((a, b) => (P[a].at || 0) - (P[b].at || 0));
  const stepKey = () => S ? (S.phase + ":" + (S.q ? S.q.id : "")) : "";

  function unsubscribe() { subs.forEach(f => f()); subs = []; }
  function subscribe() {
    unsubscribe();
    const on = (r, cb) => { const h = s => cb(s.val()); r.on("value", h); subs.push(() => r.off("value", h)); };
    on(ref("state"), v => { S = dec(v); const k = stepKey(); if (k !== lastStep) { lastStep = k; stepStart = Date.now(); draft = ""; } render(); decMine(); hostTick(); });
    on(ref("players"), v => { P = {}; Object.entries(v || {}).forEach(([k, x]) => { const d = dec(x); if (d) P[k] = d; }); render(); decAll(); });
    on(ref("hidden"), async v => { const n = ++hidSeq, o = await FNC.open(dec(v)); if (n !== hidSeq) return; HID = o || null; hostTick(); });
  }
  const genCode = () => { const L = "ABCDEFGHJKLMNPQRSTUVWXYZ"; return Array.from({ length: 4 }, () => L[rint(L.length)]).join(""); };
  async function createRoom(name) {
    let code = genCode();
    if (self.FNN && FNN.room) code = FNN.room;   // سهرة: the night already picked this room's code
    else for (let i = 0; i < 5; i++) { const s = await db.ref("sq/" + code + "/state").get(); if (!s.exists()) break; code = genCode(); }
    ME = { pid: (self.FNN && FNN.pid) || "p" + rid(8), name, code }; LS.set(MKEY, ME);
    S = { v: 2, host: ME.pid, hk: await myKey(), phase: "lobby", rounds: 8, scores: {}, used: [], names: {}, at: Date.now() };
    if (self.FNN) S.nt = FNN.n;   // which step of the سهرة this room is
    await ref("state").set(enc(S));
    await writeMe({ name, at: Date.now(), cats: [], key: await myKey() });
    view = "room"; history.replaceState(null, "", "#" + code); subscribe();
  }
  async function joinRoom(code, name) {
    const s = await db.ref("sq/" + code + "/state").get();
    if (!s.exists()) throw new Error("nocode");
    const same = ME && ME.code === code ? ME.pid : null;
    ME = { pid: same || (self.FNN && FNN.pid) || "p" + rid(8), name, code }; LS.set(MKEY, ME);
    P = {};
    const cur = dec((await db.ref("sq/" + code + "/players/" + ME.pid).get()).val()) || {};
    await db.ref("sq/" + code + "/players/" + ME.pid).set(enc(Object.assign({ cats: [] }, cur, { name, key: await myKey(), at: cur.at || Date.now() })));
    S = dec(s.val()); view = "room"; history.replaceState(null, "", "#" + code); subscribe();
  }
  function leaveRoom() { unsubscribe(); if (ME) { ME.code = null; LS.set(MKEY, ME); } S = null; P = {}; HID = null; history.replaceState(null, "", location.pathname); goHome(); }

  /* ---------------- host ---------------- */
  function votes() { const v = {}; CATS.forEach(c => v[c.id] = 0); pids().forEach(id => (P[id].cats || []).forEach(c => { if (c in v) v[c]++; })); return v; }
  // host only: the decrypted lies / picks for the current question
  const liesNow = () => { const o = {}; (S.order || []).forEach(id => { const e = DEC[id] && DEC[id].lie; if (e && e.q === S.q.id && !(S.redo || []).includes(id + ":" + e.n)) o[id] = e; }); return o; };
  const picksNow = () => { const o = {}; (S.order || []).forEach(id => { const e = DEC[id] && DEC[id].pick; if (e && e.q === S.q.id) o[id] = e.opt; }); return o; };
  async function hostStart() {
    const ids = pids();
    if (ids.length < 2) return "تحتاجون لاعبين على الأقل.";
    const noKey = ids.filter(id => !P[id].key);
    if (noKey.length) return "لازم " + noKey.map(id => P[id].name).join(" و") + " يحدّث الصفحة.";
    const v = votes();
    let chosen = CATS.map(c => c.id).filter(id => v[id] > 0);
    if (!chosen.length) chosen = CATS.map(c => c.id);
    const used = (S.used || []).slice();
    const qs = pickQuestions(chosen, S.rounds, used);
    const names = {}; ids.forEach(id => names[id] = P[id].name);
    const scores = {}; ids.forEach(id => scores[id] = 0);
    const game = (S.game || 0) + 1;
    await saveHidden({ game, qs, owners: null });
    await writeState({ game, hk: await myKey(), phase: "write", idx: 0, total: qs.length, order: ids, names, scores, used: used.concat(qs.map(q => q.key)), q: pub(qs[0], 0, game), redo: [], opts: null, reveal: null });
    return "";
  }
  function pub(q, i, game) { return { id: game + "-" + i + "-" + rid(3), i, text: q.q, img: q.img || null, cat: q.cat }; }
  let ticking = false;
  async function hostTick() {
    if (!isHost() || ticking || !S || !HID || HID.game !== S.game) return;
    ticking = true;
    try {
      const el = (Date.now() - stepStart) / 1000;
      if (S.phase === "write") {
        // a lie that equals the truth must be rewritten
        const q = HID.qs[S.idx], redo = (S.redo || []).slice(); let ch = false;
        (S.order || []).forEach(id => { const e = DEC[id] && DEC[id].lie; if (e && e.q === S.q.id && isTruth(e.text, q.a) && !redo.includes(id + ":" + e.n)) { redo.push(id + ":" + e.n); ch = true; } });
        if (ch) { await writeState({ redo }); return; }
        if (Object.keys(liesNow()).length >= S.order.length || el > WRITE_S + 1) await hostToPick();
      } else if (S.phase === "pick") {
        if (Object.keys(picksNow()).length >= S.order.length || el > PICK_S + 1) await hostReveal();
      }
    } finally { ticking = false; }
  }
  async function hostToPick() {
    const q = HID.qs[S.idx]; const lies = {}; Object.entries(liesNow()).forEach(([id, l]) => lies[id] = l.text);
    const { opts, owners } = buildOptions(q.a, lies);
    await saveHidden(Object.assign({}, HID, { owners, ownersFor: S.q.id }));
    // each liar learns which option is theirs (sealed to them), nobody else does
    const mine = {};
    await Promise.all(Object.entries(owners).flatMap(([o, own]) => own === "truth" ? [] : own.filter(p => P[p] && P[p].key).map(async p => { mine[p] = await FNC.seal(P[p].key, o); })));
    await writeState({ phase: "pick", opts, mine });
  }
  async function hostReveal() {
    const owners = HID.owners || {}; const picks = picksNow();
    const { deltas, fooled } = scoreRound(S.order, owners, picks);
    const scores = Object.assign({}, S.scores); Object.entries(deltas).forEach(([id, d]) => scores[id] = (scores[id] || 0) + d);
    const truthId = Object.keys(owners).find(o => owners[o] === "truth");
    await writeState({ phase: "reveal", scores, reveal: { truth: truthId, owners, picks, deltas, fooled } });
  }
  async function hostNext() {
    const i = S.idx + 1;
    if (i >= HID.qs.length) { await writeState({ phase: "end" }); return; }
    await writeState({ phase: "write", idx: i, q: pub(HID.qs[i], i, S.game), redo: [], opts: null, mine: null, reveal: null });
  }

  /* ---------------- views ---------------- */
  function standings(deltas) {
    const ids = Object.keys(S.scores || {}).sort((a, b) => (S.scores[b] || 0) - (S.scores[a] || 0));
    return `<table><thead><tr><th>اللاعب</th>${deltas ? `<th class="n">هالجولة</th>` : ""}<th class="n">النقاط</th></tr></thead><tbody>${ids.map(id => `<tr><td>${esc(nameOf(id))}${id === ME.pid ? " (أنت)" : ""}</td>${deltas ? `<td class="n ${deltas[id] ? "plus" : ""}">${deltas[id] ? "+" + deltas[id] : "0"}</td>` : ""}<td class="n">${S.scores[id] || 0}</td></tr>`).join("")}</tbody></table>`;
  }
  const timerBar = () => `<div class="tbar"><i id="tb" style="width:100%"></i></div>`;
  function startTimer(sec) {
    const upd = () => { const left = Math.max(0, sec * 1000 - (Date.now() - stepStart)); const b = document.getElementById("tb"); if (b) b.style.width = (left / (sec * 1000) * 100) + "%"; if (left <= 0) hostTick(); };
    upd(); tick = setInterval(upd, 300);
  }
  function render() {
    if (view !== "room") return;
    if (!S) { app.innerHTML = `<div class="card center"><p class="big-msg">جاري الاتصال…</p></div>`; return; }
    chip.hidden = false; chip.innerHTML = `الغرفة <b dir="ltr">${esc(ME.code)}</b> · ${esc(ME.name)}${isHost() ? " 👑" : ""}`;
    const focusLie = document.activeElement && document.activeElement.id === "fLie";
    const lieEl = document.getElementById("fLie"); if (lieEl) draft = lieEl.value;
    clearInterval(tick); tick = null;
    if (!P[ME.pid] && Object.keys(P).length) { app.innerHTML = `<div class="card center"><p class="big-msg">انشلت من الغرفة</p></div>`; return; }
    const inGame = (S.order || []).includes(ME.pid);
    const cat = S.q && catById(S.q.cat);

    if (S.phase === "lobby" || (!inGame && S.phase !== "end")) {
      const ids = pids(), v = votes(), mine = myEntry().cats || [];
      let qr = "";
      try { if (typeof QRCode !== "undefined") { const d = document.createElement("div"); new QRCode(d, { text: joinURL(ME.code), width: 240, height: 240, colorDark: "#2b1745", colorLight: "#ffffff" }); const c = d.querySelector("canvas"); qr = c ? c.toDataURL() : ""; } } catch (e) {}
      const waiting = S.phase !== "lobby";
      app.innerHTML = `${waiting ? `<div class="card center"><p class="big-msg">اللعبة شغالة، تدخل معهم في اللعبة الجاية ⏳</p></div>` : ""}
        <div class="card center"><span class="lbl">رمز الغرفة</span><div class="code">${esc(ME.code)}</div>${qr ? `<img class="qr" src="${qr}" alt="باركود الدخول">` : ""}
          <p class="note">خلّ البقية يصوّرون الباركود أو يدخلون الرمز.</p><button type="button" class="ghost mt" data-act="copy">انسخ رابط الدخول</button>
          <p class="note">📺 للعرض على التلفزيون: <b dir="ltr">${esc(tvURL().replace(/^https?:\/\//, ""))}</b></p></div>
        <div class="card"><h2>اللاعبين (${ids.length})</h2><ul class="plist">${ids.map(id => `<li class="${id === ME.pid ? "me" : ""}">${esc(P[id].name)}${id === S.host ? " 👑" : ""}${isHost() && id !== ME.pid && !waiting ? ` <button type="button" data-kick="${id}" aria-label="شيل">✕</button>` : ""}</li>`).join("")}</ul></div>
        ${waiting ? "" : `<div class="card"><h2>الفئات</h2><p class="note">صوّت للفئات اللي تبيها. إذا ما أحد صوّت، تجي الأسئلة من كل الفئات.</p>
          <div class="catv mt">${CATS.map(c => `<button type="button" data-vcat="${c.id}" class="${mine.includes(c.id) ? "on" : ""}"><span>${esc(c.emoji)} ${esc(c.name)}</span><small>${v[c.id] || ""}</small></button>`).join("")}</div></div>
        ${isHost() ? `<div class="card"><div class="field"><span class="lbl">عدد الجولات</span><div class="seg">${[4, 6, 8, 10, 12].map(n => `<button type="button" data-rounds="${n}" class="${S.rounds === n ? "on" : ""}">${n}</button>`).join("")}</div></div>
          <p class="err" id="herr"></p><button type="button" class="btn" data-act="hstart" ${ids.length < 2 ? "disabled" : ""}>ابدأ اللعبة</button>${ids.length < 2 ? `<p class="note center">ننتظر لاعب ثاني على الأقل.</p>` : ""}</div>`
          : `<div class="card center"><p class="note">ننتظر 👑 ${esc(nameOf(S.host))} يبدأ اللعبة…</p></div>`}`}
        <button type="button" class="btn alt mt" data-act="leave">اطلع من الغرفة</button>`;
      return;
    }
    const head = S.q ? `<p class="note center">الجولة ${S.idx + 1} من ${S.total} · ${cat ? esc(cat.emoji + " " + cat.name) : ""}</p>` : "";
    const img = S.q && S.q.img ? `<img class="qimg" src="${esc(S.q.img)}" alt="" onerror="this.remove()">` : "";
    const qtext = S.q ? `<p class="stmt">${esc(S.q.text)}</p>` : "";
    if (S.phase === "write") {
      const e = myEntry().lie, mine = e && e.q === S.q.id ? Object.assign({}, e, { text: DEC[ME.pid] && DEC[ME.pid].lie && DEC[ME.pid].lie.n === e.n ? DEC[ME.pid].lie.text : "…" }) : null;
      const redo = mine && (S.redo || []).includes(ME.pid + ":" + mine.n);
      const done = (S.order || []).filter(id => { const x = P[id] && P[id].lie; return x && x.q === S.q.id && !(S.redo || []).includes(id + ":" + x.n); });
      app.innerHTML = `<div class="card">${head}${img}${qtext}${timerBar()}
        ${mine && !redo ? `<p class="big-msg">كذبتك: «${esc(mine.text)}» ✓</p><p class="note center">ننتظر الباقين يكتبون…</p>`
          : `${redo ? `<p class="err center">كتبت الجواب الصحيح 😄 اكتب كذبة ثانية!</p>` : `<p class="note center">اكتب جواب <b>غلط</b> يبان صحيح عشان تخدع أصحابك 😏</p>`}
            <div class="field mt"><input id="fLie" class="inp" maxlength="40" placeholder="كذبتك…" autocomplete="off" value="${esc(draft)}"></div><button type="button" class="btn" data-act="lie">أرسل الكذبة</button>`}
        <ul class="plist mt">${(S.order || []).map(id => `<li class="${id === ME.pid ? "me" : ""} ${done.includes(id) ? "done" : ""}">${esc(nameOf(id))}</li>`).join("")}</ul>
        ${isHost() ? `<button type="button" class="btn alt mt" data-act="hpick">كمّل للاختيار الحين</button>` : ""}</div>`;
      const inp = document.getElementById("fLie"); if (inp && focusLie) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
      startTimer(WRITE_S); return;
    }
    if (S.phase === "pick") {
      const p = myEntry().pick, mp = DEC[ME.pid] && DEC[ME.pid].pick, mine = p && p.q === S.q.id ? (mp && mp.q === S.q.id ? mp.opt : "?") : null, myOpt = MYOPT && MYOPT.q === S.q.id ? MYOPT.opt : null;
      const done = (S.order || []).filter(id => P[id] && P[id].pick && P[id].pick.q === S.q.id);
      app.innerHTML = `<div class="card">${head}${img}${qtext}${timerBar()}
        <p class="note center">${mine ? "اخترت ✓ ننتظر الباقين…" : "وش الجواب الصحيح؟"}</p>
        <div class="opts mt">${(S.opts || []).map(o => `<button type="button" data-pick="${o.id}" class="${mine === o.id ? "on" : ""}" ${o.id === myOpt || mine ? "disabled" : ""}>${esc(o.text)}${o.id === myOpt ? " (كذبتك)" : ""}</button>`).join("")}</div>
        <ul class="plist mt">${(S.order || []).map(id => `<li class="${id === ME.pid ? "me" : ""} ${done.includes(id) ? "done" : ""}">${esc(nameOf(id))}</li>`).join("")}</ul>
        ${isHost() ? `<button type="button" class="btn alt mt" data-act="hreveal">اكشف الحين</button>` : ""}</div>`;
      startTimer(PICK_S); return;
    }
    if (S.phase === "reveal") {
      const r = S.reveal;
      const rows = (S.opts || []).slice().sort((a, b) => (a.id === r.truth ? -1 : b.id === r.truth ? 1 : 0)).map(o => {
        const own = r.owners[o.id], pickers = Object.keys(r.picks).filter(p => r.picks[p] === o.id);
        const who = own === "truth" ? "✅ الجواب الصحيح" : "🤥 كذبة " + own.map(nameOf).join(" و");
        return `<li class="${own === "truth" ? "truth" : ""}"><div><b>${esc(o.text)}</b><small>${esc(who)}</small></div><span>${pickers.length ? pickers.map(p => esc(nameOf(p))).join("، ") : "ما أحد اختارها"}</span></li>`;
      }).join("");
      const d = r.deltas[ME.pid] || 0, myPick = r.picks[ME.pid];
      if (self.FA) FA.once("sq-rv-" + S.q.id, () => { if (myPick === r.truth) FA.right("عرفت الصح! +2"); else if (d > 0) FA.right("خدعتهم 😏 +" + d); else if (myPick) FA.wrong("انخدعت 😅"); });
      app.innerHTML = `<div class="card">${head}${img}${qtext}
        <p class="big-msg">${myPick === r.truth ? `عرفت الصح! 🎉` : myPick ? "انخدعت 😅" : "ما اخترت ⏱️"}${d ? ` <span class="word">+${d}</span>` : ""}</p>
        <ul class="answers mt">${rows}</ul></div>
        <div class="card"><h2>الترتيب</h2>${standings(r.deltas)}${isHost() ? `<button type="button" class="btn mt" data-act="hnext">${S.idx + 1 >= S.total ? "النتيجة النهائية 🏆" : "الجولة اللي بعدها"}</button>` : `<p class="note center mt">ننتظر 👑 ${esc(nameOf(S.host))}…</p>`}</div>`;
      return;
    }
    if (S.phase === "end") {
      if (self.FA) FA.once("sq-end-" + ME.code + "-" + S.game, () => { const ids = Object.keys(S.scores || {}).sort((a, b) => (S.scores[b] || 0) - (S.scores[a] || 0)); if (ids.length) FA.winner(nameOf(ids[0]), ids.map(id => [nameOf(id), S.scores[id] || 0])); });
      const ids = Object.keys(S.scores || {}).sort((a, b) => (S.scores[b] || 0) - (S.scores[a] || 0));
      const medal = ["🥇", "🥈", "🥉"];
      app.innerHTML = `<div class="card"><h2 class="center">النتيجة النهائية 🏆</h2><div class="podium mt">${ids.map((id, i) => `<div><span>${medal[i] || i + 1 + "."} ${esc(nameOf(id))}</span><span>${S.scores[id] || 0}</span></div>`).join("")}</div>
        ${isHost() ? `<button type="button" class="btn mt" data-act="hlobby">لعبة جديدة بنفس الغرفة</button>` : `<p class="note center mt">ننتظر 👑 ${esc(nameOf(S.host))} يبدأ لعبة جديدة…</p>`}</div>
        <button type="button" class="btn alt" data-act="leave">اطلع من الغرفة</button>`;
    }
  }
  async function roomClick(b) {
    const a = b.dataset.act;
    try {
      if (b.dataset.vcat) { const cur = myEntry().cats || []; const id = b.dataset.vcat; await writeMe({ cats: cur.includes(id) ? cur.filter(x => x !== id) : cur.concat(id) }); render(); return; }
      if (a === "lie" && S.phase === "write") {
        const t = (document.getElementById("fLie").value || "").trim();
        if (!t) return;
        const prev = myEntry().lie; const n = prev && prev.q === S.q.id ? (prev.n || 0) + 1 : 1;
        if (!S.hk) return;
        draft = ""; await writeMe({ lie: { q: S.q.id, n, s: await FNC.seal(S.hk, t), m: await FNC.seal(await myKey(), t) } }); render(); return;
      }
      if (b.dataset.pick && S.phase === "pick") { if (!S.hk) return; const o = b.dataset.pick; await writeMe({ pick: { q: S.q.id, s: await FNC.seal(S.hk, o), m: await FNC.seal(await myKey(), o) } }); render(); return; }
      if (a === "copy") { try { await navigator.clipboard.writeText(joinURL(ME.code)); b.textContent = "انتسخ ✓"; } catch (e) { b.textContent = joinURL(ME.code); } return; }
      if (a === "leave") { leaveRoom(); return; }
      if (!isHost()) return;
      if (b.dataset.kick) { await ref("players/" + b.dataset.kick).remove(); return; }
      if (b.dataset.rounds) { await writeState({ rounds: +b.dataset.rounds }); return; }
      if (a === "hstart") { b.disabled = true; const m = await hostStart(); if (m) { document.getElementById("herr").textContent = m; b.disabled = false; } return; }
      if (a === "hpick") { await hostToPick(); return; }
      if (a === "hreveal") { await hostReveal(); return; }
      if (a === "hnext") { b.disabled = true; await hostNext(); return; }
      if (a === "hlobby") { await writeState({ phase: "lobby", q: null, opts: null, reveal: null }); return; }
    } catch (e) { console.error(e); alert("ما قدرت أتصل. تأكد من النت وجرّب مرة ثانية."); }
  }

  /* ---------------- home ---------------- */
  function goHome() { view = "home"; chip.hidden = true; clearInterval(tick); renderHome(); }
  function renderHome() {
    app.innerHTML = `<div class="hero"><h1>صدق ولا كذب 🤥</h1><p>اخدع أصحابك بجواب يبان صحيح… وحاول تعرف الصح من بين كذباتهم!</p></div>
      <div class="modes">
        <button type="button" class="mode" data-act="ocreate"><span class="ic">📡</span><span><b>افتح غرفة</b><span>كل واحد يلعب من جواله (2–8 لاعبين)</span></span></button>
        <button type="button" class="mode" data-act="ojoin"><span class="ic">🔑</span><span><b>ادخل غرفة</b><span>عندك رمز من صاحبك</span></span></button>
      </div>
      <div class="card mt"><h3>طريقة اللعب</h3><ul class="note"><li><b>اكتب كذبة:</b> يطلع سؤال، وكل واحد يكتب جواب غلط يبان صحيح.</li><li><b>اختر الصحيحة:</b> تختلط الكذبات مع الجواب الصحيح، وكل واحد يختار اللي يظنه صح.</li><li><b>النقاط:</b> نقطتين لمن يختار الصحيح، ونقطة لك عن كل واحد اختار كذبتك.</li><li>إذا كتبت الجواب الصحيح بالغلط، تطلب منك اللعبة كذبة ثانية.</li></ul>
      <p class="note">الفئات: ${CATS.map(c => esc(c.emoji + " " + c.name)).join(" · ")}</p><p class="note">📺 تقدرون تعرضونها على التلفزيون من صفحة «شاشة العرض».</p></div>`;
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
      } catch (e) { b.disabled = false; err(e.message === "nocode" ? "ما لقيت غرفة بهالرمز." : "ما قدرت أتصل. تأكد من النت."); }
    }
  }

  /* ---------------- events / boot ---------------- */
  app.addEventListener("click", e => { const b = e.target.closest("button"); if (!b || b.disabled) return; if (view === "room") roomClick(b); else homeClick(b); });
  app.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "fLie") { const b = app.querySelector('[data-act="lie"]'); if (b) b.click(); } });
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
  const LATE = { write: WRITE_S, pick: PICK_S };
  setInterval(() => {
    if (!self.FNW) return;
    FNW.hold(view === "room" && isHost());
    const lim = view === "room" && S && !isHost() && LATE[S.phase];
    FNW.late(lim && (Date.now() - stepStart) / 1000 > lim + 6 ? nameOf(S.host) : null);
  }, 1000);
  if (self.FNW) FNW.onVisible(() => hostTick());
  fetch("questions.json", { cache: "no-cache" }).then(r => r.json()).then(d => {
    CATS = d.categories;
    const h = (location.hash || "").replace("#", "").toUpperCase();
    // سهرة: the night's host opens this game's room (or comes back to it after a reload)
    if (self.FNN && FNN.host && FNN.room === h && db) db.ref("sq/" + h + "/state").get().then(s => { const o = s.exists() && dec(s.val()); return o && o.host === FNN.pid && o.nt === FNN.n ? joinRoom(h, FNN.name) : createRoom(FNN.name); }).catch(() => renderForm("join", h, "ما قدرت أتصل. تأكد من النت."));
    else if (/^[A-Z]{4}$/.test(h)) {
      if (ME && ME.code === h && ME.name && db) joinRoom(h, ME.name).catch(() => renderForm("join", h, "ما لقيت غرفة بهالرمز."));
      else renderForm("join", h);
    } else if (ME && ME.code && db) joinRoom(ME.code, ME.name).catch(() => { ME.code = null; LS.set(MKEY, ME); goHome(); });
    else goHome();
  }).catch(() => { app.innerHTML = `<div class="card"><p class="big-msg">ما قدرت أحمّل الأسئلة. حدّث الصفحة.</p></div>`; });
  self.SQ = { pickQuestions, buildOptions, scoreRound, norm, style, shapeLie, isTruth, get CATS() { return CATS; } };
})();
