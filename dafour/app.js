/* الدافور — quick general-knowledge quiz (online, Firebase).
   Each round: a question with 4 options in a new random order → everyone answers from their phone →
   right answers score 100 + up to 50 for speed. The fastest brain of the night is «دافور الشلة 🤓».
   Paths under df/<CODE>/:
     state          public state written by the host (the right option is only in it after the reveal)
     hidden         the game's questions with their right option, sealed to the host's own key
     players/<pid>  each player's own entry (name, key, answer sealed to the host)
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

  let QS = [];                                   // all questions (questions.json)
  const Q_S = 20, MIN_P = 2, BASE_PTS = 100, SPEED_PTS = 50;

  /* ---------------- engine ---------------- */
  // n questions not played yet in this room, easy first and hard last
  // Every phone remembers the questions it has seen (any room, any night). The host picks the ones
  // nobody in the room has seen; once everything was seen, the ones seen longest ago come back first.
  const SEEN_KEY = "df-seen-v1";
  const seenList = () => { const v = LS.get(SEEN_KEY, []); return Array.isArray(v) ? v : []; };
  function noteSeen(id) { if (!id) return; const l = seenList().filter(x => x !== id); l.push(id); LS.set(SEEN_KEY, l.slice(-2000)); }
  // sent in the player's record: the last 400 seen, two letters each (q0123 → "3f")
  const packSeen = () => seenList().filter(id => /^q\d{1,4}$/.test(id) && +id.slice(1) < 1296).slice(-400).map(id => (+id.slice(1)).toString(36).padStart(2, "0")).join("");
  const unpackSeen = s => (typeof s === "string" ? s.match(/[0-9a-z]{2}/g) || [] : []).map(x => "q" + String(parseInt(x, 36)).padStart(4, "0"));
  // lists ordered oldest → newest: seen at all counts 1, seen lately counts up to 2
  function seenWeights(lists) { const w = {}; lists.forEach(l => { const L = l.length || 1; l.forEach((id, p) => { w[id] = (w[id] || 0) + 1 + p / L; }); }); return w; }
  function pickQuestions(n, used, w) {
    w = w || {};
    const lv = { "سهل": 0, "متوسط": 1, "صعب": 2 };
    const picked = QS.map(q => ({ q, s: (used.includes(q.id) ? 1000 : 0) + (w[q.id] || 0) + rnd() * 0.3 })).sort((a, b) => a.s - b.s).slice(0, n).map(x => x.q);
    return picked.sort((a, b) => (lv[a.difficulty] ?? 1) - (lv[b.difficulty] ?? 1) || rnd() - .5);
  }
  // the options in a fresh random order; returns the texts and where the right one landed
  function deal(q) {
    const order = shuffle([0, 1, 2, 3]);
    return { opts: order.map(i => q.options[i]), correct: order.indexOf(q.answer) };
  }
  // answers {pid: {o, ms}} -> points: right = 100 + up to 50 for answering fast
  function scoreRound(order, answers, correct) {
    const deltas = {}, right = [];
    order.forEach(id => {
      const a = answers[id];
      if (a && a.o === correct) { right.push(id); deltas[id] = BASE_PTS + Math.round(SPEED_PTS * Math.max(0, 1 - (a.ms || 0) / (Q_S * 1000))); }
      else deltas[id] = 0;
    });
    return { deltas, right };
  }

  /* ---------------- firebase ---------------- */
  const CFG = self.FIREBASE_CONFIG;
  let db = null;
  try { if (CFG && CFG.databaseURL && self.firebase) { firebase.initializeApp(CFG); db = firebase.database(); } } catch (e) { console.error(e); }
  const enc = o => ({ j: JSON.stringify(o) });
  const dec = v => { try { return v && typeof v.j === "string" ? JSON.parse(v.j) : null; } catch (e) { return null; } };
  const MKEY = "df-me-v1";
  let ME = LS.get(MKEY, null);
  let S = null, P = {}, HID = null, subs = [], view = "home", lastStep = null, stepStart = 0, tick = null, myPick = null;
  let ADEC = {}, decSeq = 0, hidSeq = 0;
  const SEEN = {};                               // host: when each answer first arrived (ms after the question)
  const FIRST = {};                              // host: each player's first answer to each question is the one that counts
  const myKey = () => FNC.pub();
  const isHost = () => S && ME && S.host === ME.pid;
  const ref = p => db.ref("df/" + ME.code + (p ? "/" + p : ""));
  const nameOf = id => (P[id] && P[id].name) || (S && S.names && S.names[id]) || "؟";
  const myEntry = () => (P[ME.pid] || {});
  function writeMe(patch) { const cur = Object.assign({}, myEntry(), patch); P[ME.pid] = cur; return ref("players/" + ME.pid).set(enc(cur)); }
  function writeState(patch) { S = Object.assign({}, S, patch); return ref("state").set(enc(S)); }
  const tvURL = () => location.origin + location.pathname.replace(/dafour\/?(index\.html)?$/, "") + "tv/";
  const joinURL = c => location.origin + location.pathname + "#" + c;
  const pids = () => Object.keys(P).sort((a, b) => (P[a].at || 0) - (P[b].at || 0));
  const stepKey = () => S ? (S.phase + ":" + (S.q ? S.q.id : "")) : "";
  const answered = id => { const e = P[id]; return !!(e && e.ans && S.q && e.ans.q === S.q.id); };

  function unsubscribe() { subs.forEach(f => f()); subs = []; }
  function subscribe() {
    unsubscribe();
    const on = (r, cb) => { const h = s => cb(s.val()); r.on("value", h); subs.push(() => r.off("value", h)); };
    on(ref("state"), v => { S = dec(v); const k = stepKey(); if (k !== lastStep) { lastStep = k; stepStart = Date.now(); myPick = null; } render(); hostTick(); });
    on(ref("players"), v => { P = {}; Object.entries(v || {}).forEach(([k, x]) => { const d = dec(x); if (d) P[k] = d; }); render(); decAnswers(); });
    on(ref("hidden"), async v => { const n = ++hidSeq, o = await FNC.open(dec(v)); if (n !== hidSeq) return; HID = o || null; hostTick(); });
  }
  async function decAnswers() {
    if (!isHost()) return;
    const n = ++decSeq, out = {};
    await Promise.all(Object.entries(P).map(async ([id, e]) => {
      if (!(e && e.ans && e.ans.s && S && S.q && e.ans.q === S.q.id)) return;
      const k = S.q.id + ":" + id;
      if (SEEN[k] == null) SEEN[k] = Date.now() - stepStart;      // the host's clock decides how fast it was
      const t = await FNC.open(e.ans.s);
      if (t && typeof t.o === "number") { if (!FIRST[k]) FIRST[k] = { q: e.ans.q, o: t.o, ms: SEEN[k] }; out[id] = FIRST[k]; }
    }));
    if (n !== decSeq) return;
    ADEC = out; hostTick();
  }
  const genCode = () => { const L = "ABCDEFGHJKLMNPQRSTUVWXYZ"; return Array.from({ length: 4 }, () => L[rint(L.length)]).join(""); };
  async function createRoom(name) {
    let code = genCode();
    if (self.FNN && FNN.room) code = FNN.room;   // سهرة: the night already picked this room's code
    else for (let i = 0; i < 5; i++) { const s = await db.ref("df/" + code + "/state").get(); if (!s.exists()) break; code = genCode(); }
    ME = { pid: (self.FNN && FNN.pid) || "p" + rid(8), name, code }; LS.set(MKEY, ME);
    S = { v: 1, host: ME.pid, hk: await myKey(), phase: "lobby", rounds: 10, scores: {}, used: [], names: {}, at: Date.now() };
    if (self.FNN) S.nt = FNN.n;   // which step of the سهرة this room is
    await ref("state").set(enc(S));
    await writeMe({ name, at: Date.now(), key: await myKey(), sn: packSeen() });
    view = "room"; history.replaceState(null, "", "#" + code); subscribe();
  }
  async function joinRoom(code, name) {
    const s = await db.ref("df/" + code + "/state").get();
    if (!s.exists()) throw new Error("nocode");
    const same = ME && ME.code === code ? ME.pid : null;
    // two players with the same name make the rounds confusing: the name must be free in this room
    const mine = same || (self.FNN && FNN.pid) || null, nm = x => String(x || "").trim().toLowerCase();
    const others = (await db.ref("df/" + code + "/players").get()).val() || {};
    if (Object.entries(others).some(([id, x]) => id !== mine && nm((dec(x) || {}).name) === nm(name))) throw new Error("taken");
    ME = { pid: same || (self.FNN && FNN.pid) || "p" + rid(8), name, code }; LS.set(MKEY, ME);
    P = {};
    const cur = dec((await db.ref("df/" + code + "/players/" + ME.pid).get()).val()) || {};
    await db.ref("df/" + code + "/players/" + ME.pid).set(enc(Object.assign({}, cur, { name, key: await myKey(), sn: packSeen(), at: cur.at || Date.now() })));
    S = dec(s.val()); view = "room"; history.replaceState(null, "", "#" + code); subscribe();
  }
  function leaveRoom() { unsubscribe(); if (ME) { ME.code = null; LS.set(MKEY, ME); } S = null; P = {}; ADEC = {}; HID = null; history.replaceState(null, "", location.pathname); goHome(); }

  /* ---------------- host ---------------- */
  async function saveHidden(H) { HID = H; await ref("hidden").set(enc(await FNC.seal(await myKey(), H))); }
  // ♾️ (rounds 0): no end, the questions come in batches of INF_BATCH; HID.base = idx of the batch's first one
  const INF_BATCH = 20;
  const hq = i => HID.qs[i - (HID.base || 0)];
  const pub = (i, game) => { const h = hq(i); return { id: game + "-" + i + "-" + rid(3), i, text: h.text, opts: h.opts, diff: h.diff }; };
  async function hostStart() {
    const ids = pids();
    if (ids.length < MIN_P) return `تحتاجون ${MIN_P} لاعبين على الأقل.`;
    const noKey = ids.filter(id => !P[id].key);
    if (noKey.length) return "لازم " + noKey.map(id => P[id].name).join(" و") + " يحدّث الصفحة.";
    const inf = !S.rounds;
    let used = (S.used || []).slice();
    if (used.length + (inf ? INF_BATCH : S.rounds) > QS.length) used = [];   // everything was played in this room: the seen lists decide
    const qs = pickQuestions(inf ? INF_BATCH : S.rounds, used, roomWeights(ids));
    const game = (S.game || 0) + 1;
    await saveHidden({ game, base: 0, qs: hideQs(qs) });
    const names = {}; ids.forEach(id => names[id] = P[id].name);
    const scores = {}; ids.forEach(id => scores[id] = 0);
    await writeState({ game, hk: await myKey(), phase: "q", idx: 0, total: inf ? 0 : qs.length, inf, order: ids, names, scores, used: used.concat(qs.map(q => q.id)), q: pub(0, game), reveal: null, rightCount: {} });
    return "";
  }
  const roomWeights = ids => seenWeights([seenList()].concat(ids.filter(id => id !== ME.pid).map(id => unpackSeen(P[id].sn))));
  const hideQs = qs => qs.map(q => Object.assign({ qid: q.id, text: q.question, diff: q.difficulty, note: q.note || "" }, deal(q)));
  const answersNow = () => { const o = {}; (S.order || []).forEach(id => { const e = ADEC[id]; if (e && S.q && e.q === S.q.id && answered(id)) o[id] = e; }); return o; };
  let ticking = false;
  async function hostTick() {
    if (!isHost() || ticking || !S || S.phase !== "q" || !HID) return;
    ticking = true;
    try {
      const el = (Date.now() - stepStart) / 1000;
      const nAns = (S.order || []).filter(answered).length, nDec = Object.keys(answersNow()).length;
      if ((nAns >= S.order.length && nDec >= nAns) || el > Q_S + 1) await hostReveal();
    } finally { ticking = false; }
  }
  async function hostReveal() {
    if (S.phase !== "q" || !HID) return;
    const h = hq(S.idx), ans = answersNow(), r = scoreRound(S.order, ans, h.correct);
    const scores = Object.assign({}, S.scores); Object.entries(r.deltas).forEach(([id, d]) => scores[id] = (scores[id] || 0) + d);
    const rightCount = Object.assign({}, S.rightCount); r.right.forEach(id => rightCount[id] = (rightCount[id] || 0) + 1);
    const picks = {}; Object.entries(ans).forEach(([id, a]) => picks[id] = a.o);
    const fastest = r.right.slice().sort((a, b) => ans[a].ms - ans[b].ms)[0] || null;
    await writeState({ phase: "reveal", scores, rightCount, reveal: { correct: h.correct, picks, deltas: r.deltas, right: r.right, fastest, note: h.note || "" } });
  }
  async function hostNext() {
    const i = S.idx + 1;
    if (!S.inf && i >= S.total) { await writeState({ phase: "end" }); return; }
    let used = S.used || [];
    if (S.inf && !hq(i)) {   // ♾️: this batch is done, the next one
      if (used.length + INF_BATCH > QS.length) used = [];
      const qs = pickQuestions(INF_BATCH, used, roomWeights(S.order || []));
      await saveHidden({ game: S.game, base: i, qs: hideQs(qs) });
      used = used.concat(qs.map(q => q.id));
    }
    await writeState({ phase: "q", idx: i, q: pub(i, S.game), reveal: null, used });
  }
  // ♾️: the host ends it whenever; the count is the questions that were answered
  async function hostFinish() {
    if (!S || (S.phase !== "q" && S.phase !== "reveal")) return;
    await writeState({ phase: "end", total: S.phase === "reveal" ? S.idx + 1 : S.idx });
  }

  /* ---------------- views ---------------- */
  const LETTERS = ["أ", "ب", "ج", "د"];
  function standings(deltas) {
    const ids = Object.keys(S.scores || {}).sort((a, b) => (S.scores[b] || 0) - (S.scores[a] || 0));
    return `<table><thead><tr><th>اللاعب</th>${deltas ? `<th class="n">هالسؤال</th>` : ""}<th class="n">النقاط</th></tr></thead><tbody>${ids.map(id => `<tr><td>${esc(nameOf(id))}${id === ME.pid ? " (أنت)" : ""}</td>${deltas ? `<td class="n ${deltas[id] ? "plus" : ""}">${deltas[id] ? "+" + deltas[id] : "0"}</td>` : ""}<td class="n">${S.scores[id] || 0}</td></tr>`).join("")}</tbody></table>`;
  }
  const timerBar = () => `<div class="tbar"><i id="tb" style="width:100%"></i></div><p class="secs" id="secs">${Q_S}</p>`;
  function startTimer(sec) {
    const upd = () => {
      const left = Math.max(0, sec * 1000 - (Date.now() - stepStart));
      const b = document.getElementById("tb"); if (b) b.style.width = (left / (sec * 1000) * 100) + "%";
      const n = document.getElementById("secs"); if (n) n.textContent = Math.ceil(left / 1000);
      if (left <= 0) hostTick();
    };
    upd(); tick = setInterval(upd, 250);
  }
  // the four options: same size and look for all, letters only for reading them out loud
  function optsHTML(opts, mode) {
    return `<div class="opts4">${opts.map((t, i) => {
      let cls = "";
      if (mode && mode.reveal) cls = i === mode.correct ? "ok" : (i === mode.mine ? "bad" : "dim");
      else if (myPick === i) cls = "on";
      const who = mode && mode.reveal ? (mode.who[i] || []) : [];
      return `<button type="button" data-opt="${i}" class="${cls}" ${mode && (mode.reveal || mode.locked) ? "disabled" : ""}><b>${LETTERS[i]}</b><span>${esc(t)}</span>${who.length ? `<small>${who.map(id => esc(nameOf(id))).join("، ")}</small>` : ""}</button>`;
    }).join("")}</div>`;
  }
  const finishBtn = () => S.inf && isHost() ? `<button type="button" class="finish" data-act="hfinish">🏁 خلّصنا · اعرض النتيجة</button>` : "";
  let lastSeenQ = null;
  function render() {
    if (S && S.q && S.q.id !== lastSeenQ) { lastSeenQ = S.q.id; const q = QS.find(x => x.question === S.q.text); if (q) noteSeen(q.id); }
    if (view !== "room") return;
    if (!S) { app.innerHTML = `<div class="card center"><p class="big-msg">جاري الاتصال…</p></div>`; return; }
    chip.hidden = false; chip.innerHTML = `الغرفة <b dir="ltr">${esc(ME.code)}</b> · ${esc(ME.name)}${isHost() ? " 👑" : ""}`;
    clearInterval(tick); tick = null;
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
        ${waiting ? "" : isHost() ? `<div class="card"><div class="field"><span class="lbl">مدة اللعبة</span><div class="seg">${[10, 20, 30, 50].map(n => `<button type="button" data-rounds="${n}" class="${S.rounds === n ? "on" : ""}">${n}</button>`).join("")}<button type="button" data-rounds="inf" class="inf ${!S.rounds ? "on" : ""}">♾️ ما توقف</button></div></div>
          <p class="note">${S.rounds ? "الأسئلة تبدأ سهلة وتصعب شوي شوي 🤓" : "الأسئلة تكمل وحدة ورا الثانية لين تضغط «🏁 خلّصنا» 🤓"}</p>
          <p class="err" id="herr"></p><button type="button" class="btn" data-act="hstart" ${ids.length < MIN_P ? "disabled" : ""}>ابدأ اللعبة</button>${ids.length < MIN_P ? `<p class="note center">ننتظر لاعب ثاني على الأقل.</p>` : ""}</div>`
          : `<div class="card center"><p class="note">ننتظر 👑 ${esc(nameOf(S.host))} يبدأ اللعبة…</p></div>`}
        ${leave}`;
      return;
    }
    const head = S.q ? `<p class="note center">السؤال ${S.idx + 1} ${S.inf ? "· ♾️" : "من " + S.total}${S.q.diff ? ` · ${esc(S.q.diff)}` : ""}</p>` : "";
    const qtext = S.q ? `<p class="stmt">${esc(S.q.text)}</p>` : "";
    const order = S.order || [];
    if (S.phase === "q") {
      const done = order.filter(answered), me = answered(ME.pid);
      app.innerHTML = `<div class="card">${head}${qtext}${timerBar()}
        ${optsHTML(S.q.opts, me ? { locked: true } : null)}
        ${me ? `<p class="big-msg mt">جاوبت ✓</p><p class="note center">ننتظر الباقين… (${done.length}/${order.length})</p>` : `<p class="note center mt">اختار جوابك، وكل ما أسرع نقاطك أكثر ⚡</p>`}
        <ul class="plist mt">${order.map(id => `<li class="${id === ME.pid ? "me" : ""} ${done.includes(id) ? "done" : ""}">${esc(nameOf(id))}</li>`).join("")}</ul>
        ${isHost() ? `<button type="button" class="btn alt mt" data-act="hreveal">اكشف الجواب الحين</button>` : ""}</div>${finishBtn()}`;
      startTimer(Q_S);
      return;
    }
    if (S.phase === "reveal") {
      const r = S.reveal || { picks: {}, deltas: {}, right: [] };
      const who = {}; Object.entries(r.picks || {}).forEach(([id, o]) => (who[o] = who[o] || []).push(id));
      const mine = (r.picks || {})[ME.pid], amRight = r.right.includes(ME.pid);
      if (self.FA) FA.once("df-rv-" + S.q.id, () => { if (amRight) FA.right("صح! +" + r.deltas[ME.pid], r.fastest === ME.pid ? "أسرع واحد ⚡" : null); else if (mine != null) FA.wrong("غلط 😅"); else FA.play("reveal"); });
      app.innerHTML = `<div class="card">${head}${qtext}
        ${optsHTML(S.q.opts, { reveal: true, correct: r.correct, mine, who })}
        <p class="big-msg mt">${amRight ? `صح ✅ <span class="word">+${r.deltas[ME.pid]}</span>` : mine != null ? "غلط ❌" : "ما جاوبت ⏱️"}</p>
        ${r.fastest ? `<p class="note center">⚡ أسرع جواب صح: <b>${esc(nameOf(r.fastest))}</b></p>` : `<p class="note center">ما أحد جاوب صح 😅</p>`}
        ${r.note ? `<p class="fact">💡 ${esc(r.note)}</p>` : ""}</div>
        <div class="card"><h2>الترتيب</h2>${standings(r.deltas)}${isHost() ? `<button type="button" class="btn mt" data-act="hnext">${!S.inf && S.idx + 1 >= S.total ? "النتيجة النهائية 🏆" : "السؤال اللي بعده"}</button>` : `<p class="note center mt">ننتظر 👑 ${esc(nameOf(S.host))}…</p>`}</div>${finishBtn()}`;
      return;
    }
    if (S.phase === "end") {
      const ids = Object.keys(S.scores || {}).sort((a, b) => (S.scores[b] || 0) - (S.scores[a] || 0));
      if (self.FA) FA.once("df-end-" + ME.code + "-" + S.game, () => { if (ids.length) FA.winner(nameOf(ids[0]), ids.map(id => [nameOf(id), S.scores[id] || 0]), "دافور الشلة 🤓"); });
      const medal = ["🥇", "🥈", "🥉"], rc = S.rightCount || {};
      app.innerHTML = `<div class="card"><h2 class="center">النتيجة النهائية 🏆</h2><p class="note center">دافور الشلة 🤓: <b>${esc(ids.length ? nameOf(ids[0]) : "")}</b></p>
        <div class="podium mt">${ids.map((id, i) => `<div><span>${medal[i] || i + 1 + "."} ${esc(nameOf(id))} <small>(${rc[id] || 0} من ${S.total} صح)</small></span><span>${S.scores[id] || 0}</span></div>`).join("")}</div>
        ${isHost() ? `<button type="button" class="btn mt" data-act="hlobby">لعبة جديدة بنفس الغرفة</button>` : `<p class="note center mt">ننتظر 👑 ${esc(nameOf(S.host))} يبدأ لعبة جديدة…</p>`}</div>${leave}`;
    }
  }
  async function roomClick(b) {
    const a = b.dataset.act;
    try {
      if (b.dataset.opt !== undefined && S.phase === "q" && !answered(ME.pid) && S.hk) {
        myPick = +b.dataset.opt; render();
        await writeMe({ ans: { q: S.q.id, s: await FNC.seal(S.hk, { o: myPick }) } }); render(); return;
      }
      if (a === "copy") { try { await navigator.clipboard.writeText(joinURL(ME.code)); b.textContent = "انتسخ ✓"; } catch (e) { b.textContent = joinURL(ME.code); } return; }
      if (a === "leave") { leaveRoom(); return; }
      if (!isHost()) return;
      if (b.dataset.kick) { await ref("players/" + b.dataset.kick).remove(); return; }
      if (b.dataset.rounds) { await writeState({ rounds: b.dataset.rounds === "inf" ? 0 : +b.dataset.rounds }); return; }
      if (a === "hstart") { b.disabled = true; const m = await hostStart(); if (m) { document.getElementById("herr").textContent = m; b.disabled = false; } return; }
      if (a === "hreveal") { await hostReveal(); return; }
      if (a === "hfinish") { if (confirm("تخلّصون اللعبة وتطلع النتيجة؟")) await hostFinish(); return; }
      if (a === "hnext") { b.disabled = true; await hostNext(); return; }
      if (a === "hlobby") { await writeState({ phase: "lobby", q: null, reveal: null }); return; }
    } catch (e) { console.error(e); alert("ما قدرت أتصل. تأكد من النت وجرّب مرة ثانية."); }
  }

  /* ---------------- home ---------------- */
  function goHome() { view = "home"; chip.hidden = true; clearInterval(tick); renderHome(); }
  function renderHome() {
    app.innerHTML = `<div class="hero"><h1>الدافور 🤓</h1><p>أسئلة معلومات عامة… مين فيكم الدافور؟</p></div>
      <div class="modes">
        <button type="button" class="mode" data-act="ocreate"><span class="ic">📡</span><span><b>افتح غرفة</b><span>كل واحد يلعب من جواله (لاعبين وأكثر)</span></span></button>
        <button type="button" class="mode" data-act="ojoin"><span class="ic">🔑</span><span><b>ادخل غرفة</b><span>عندك رمز من صاحبك</span></span></button>
      </div>
      <div class="card mt"><h3>طريقة اللعب</h3><ul class="note"><li>يطلع سؤال مع ٤ خيارات، وكل واحد يختار من جواله.</li><li>عندك ${Q_S} ثانية. الجواب الصح ياخذ <b>${BASE_PTS}</b> نقطة، وكل ما جاوبت أسرع تاخذ لين <b>${SPEED_PTS}</b> زيادة ⚡</li><li>بعد كل سؤال ينكشف الجواب، ومين جاوب وش.</li><li>الأسئلة تبدأ سهلة وتصعب، وما تتكرر في نفس الغرفة.</li><li>الأول في الآخر ياخذ لقب <b>دافور الشلة 🤓</b>.</li></ul>
      <p class="note">فيها ${QS.length} سؤال · 📺 تقدرون تعرضونها على التلفزيون من «شاشة العرض».</p></div>`;
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
  const LATE = { q: Q_S };
  setInterval(() => {
    if (!self.FNW) return;
    FNW.hold(view === "room" && isHost());
    const lim = view === "room" && S && !isHost() && LATE[S.phase];
    FNW.late(lim && (Date.now() - stepStart) / 1000 > lim + 6 ? nameOf(S.host) : null);
  }, 1000);
  if (self.FNW) FNW.onVisible(() => hostTick());
  fetch("questions.json", { cache: "no-cache" }).then(r => r.json()).then(d => {
    // the right option is not written plainly in questions.json (so nobody reads it there mid-game): k hides it
    const code = id => [...String(id)].reduce((n, c) => n + c.codePointAt(0), 0) * 7;
    QS = d.questions.map(q => (q && q.k != null && q.answer == null ? Object.assign({}, q, { answer: (((q.k - code(q.id)) % 4) + 4) % 4 }) : q))
      .filter(q => q && q.question && Array.isArray(q.options) && q.options.length === 4 && q.answer >= 0 && q.answer < 4);
    const h = (location.hash || "").replace("#", "").toUpperCase();
    // سهرة: the night's host opens this game's room (or comes back to it after a reload)
    if (self.FNN && FNN.host && FNN.room === h && db) db.ref("df/" + h + "/state").get().then(s => { const o = s.exists() && dec(s.val()); return o && o.host === FNN.pid && o.nt === FNN.n ? joinRoom(h, FNN.name) : createRoom(FNN.name); }).catch(() => renderForm("join", h, "ما قدرت أتصل. تأكد من النت."));
    else if (/^[A-Z]{4}$/.test(h)) {
      if (ME && ME.code === h && ME.name && db) joinRoom(h, ME.name).catch(() => renderForm("join", h, "ما لقيت غرفة بهالرمز."));
      else renderForm("join", h);
    } else if (ME && ME.code && db) joinRoom(ME.code, ME.name).catch(() => { ME.code = null; LS.set(MKEY, ME); goHome(); });
    else goHome();
  }).catch(() => { app.innerHTML = `<div class="card"><p class="big-msg">ما قدرت أحمّل الأسئلة. حدّث الصفحة.</p></div>`; });
  self.DF = { pickQuestions, seenList, packSeen, unpackSeen, seenWeights, deal, scoreRound, get QS() { return QS; } };
})();
