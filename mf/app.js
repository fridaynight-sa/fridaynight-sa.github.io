/* مين فينا؟ — group voting game (online, Firebase).
   Each round: a question "مين فينا أكثر واحد…؟" → everyone votes secretly for a player (themselves too) →
   the one with the most votes takes the title. +1 for every player who voted for the winner.
   Paths under mf/<CODE>/:
     state          public state written by the host
     players/<pid>  each player's own entry (name, key, pack votes, vote sealed to the host)
   Votes are sealed with fncrypto.js so only the host's device can read them; nobody sees who voted for whom.
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

  let CATS = [];
  const catById = id => CATS.find(c => c.id === id);
  const VOTE_S = 30, MIN_P = 3;

  /* ---------------- engine ---------------- */
  function pickQuestions(catIds, n, used) {
    const all = id => catById(id).items.map((it, i) => ({ key: id + ":" + i, cat: id, ...it }));
    let pool = shuffle(catIds.flatMap(all).filter(q => !used.includes(q.key)));
    if (pool.length < n) pool = pool.concat(shuffle(catIds.flatMap(all).filter(q => !pool.includes(q))));
    return pool.slice(0, n);
  }
  // votes: {voter: target}. winners = most votes; right = voters who picked a winner.
  // A vote for yourself never earns a point, and when everyone ties nobody takes the title.
  function scoreRound(order, votes) {
    const counts = {}; order.forEach(id => counts[id] = 0);
    Object.values(votes).forEach(t => { if (t in counts) counts[t]++; });
    const max = Math.max(0, ...Object.values(counts));
    const tie = max > 0 && order.length > 1 && order.every(id => counts[id] === max);
    const winners = max && !tie ? order.filter(id => counts[id] === max) : [];
    const right = Object.keys(votes).filter(v => winners.includes(votes[v]) && votes[v] !== v);
    const deltas = {}; order.forEach(id => deltas[id] = right.includes(id) ? 1 : 0);
    return { counts, winners, right, deltas, tie };
  }

  /* ---------------- firebase ---------------- */
  const CFG = self.FIREBASE_CONFIG;
  let db = null;
  try { if (CFG && CFG.databaseURL && self.firebase) { firebase.initializeApp(CFG); db = firebase.database(); } } catch (e) { console.error(e); }
  const enc = o => ({ j: JSON.stringify(o) });
  const dec = v => { try { return v && typeof v.j === "string" ? JSON.parse(v.j) : null; } catch (e) { return null; } };
  const MKEY = "mf-me-v1";
  let ME = LS.get(MKEY, null);
  let S = null, P = {}, subs = [], view = "home", lastStep = null, stepStart = 0, tick = null, myPick = null;
  let VDEC = {}, decSeq = 0;
  const myKey = () => FNC.pub();
  const isHost = () => S && ME && S.host === ME.pid;
  const ref = p => db.ref("mf/" + ME.code + (p ? "/" + p : ""));
  const nameOf = id => (P[id] && P[id].name) || (S && S.names && S.names[id]) || "؟";
  const myEntry = () => (P[ME.pid] || {});
  function writeMe(patch) { const cur = Object.assign({}, myEntry(), patch); P[ME.pid] = cur; return ref("players/" + ME.pid).set(enc(cur)); }
  function writeState(patch) { S = Object.assign({}, S, patch); return ref("state").set(enc(S)); }
  const tvURL = () => location.origin + location.pathname.replace(/mf\/?(index\.html)?$/, "") + "tv/";
  const joinURL = c => location.origin + location.pathname + "#" + c;
  const pids = () => Object.keys(P).sort((a, b) => (P[a].at || 0) - (P[b].at || 0));
  const stepKey = () => S ? (S.phase + ":" + (S.q ? S.q.id : "")) : "";
  const voted = id => { const e = P[id]; return !!(e && e.vote && S.q && e.vote.q === S.q.id); };

  function unsubscribe() { subs.forEach(f => f()); subs = []; }
  function subscribe() {
    unsubscribe();
    const on = (r, cb) => { const h = s => cb(s.val()); r.on("value", h); subs.push(() => r.off("value", h)); };
    on(ref("state"), v => { S = dec(v); const k = stepKey(); if (k !== lastStep) { lastStep = k; stepStart = Date.now(); myPick = null; } render(); hostTick(); });
    on(ref("players"), v => { P = {}; Object.entries(v || {}).forEach(([k, x]) => { const d = dec(x); if (d) P[k] = d; }); render(); decVotes(); });
  }
  async function decVotes() {
    if (!isHost()) return;
    const n = ++decSeq, out = {};
    await Promise.all(Object.entries(P).map(async ([id, e]) => { if (e && e.vote && e.vote.s) { const t = await FNC.open(e.vote.s); if (typeof t === "string") out[id] = { q: e.vote.q, t }; } }));
    if (n !== decSeq) return;
    VDEC = out; hostTick();
  }
  const genCode = () => { const L = "ABCDEFGHJKLMNPQRSTUVWXYZ"; return Array.from({ length: 4 }, () => L[rint(L.length)]).join(""); };
  async function createRoom(name) {
    let code = genCode();
    if (self.FNN && FNN.room) code = FNN.room;   // سهرة: the night already picked this room's code
    else for (let i = 0; i < 5; i++) { const s = await db.ref("mf/" + code + "/state").get(); if (!s.exists()) break; code = genCode(); }
    ME = { pid: (self.FNN && FNN.pid) || "p" + rid(8), name, code }; LS.set(MKEY, ME);
    S = { v: 1, host: ME.pid, hk: await myKey(), phase: "lobby", rounds: 8, scores: {}, used: [], names: {}, titles: [], at: Date.now() };
    await ref("state").set(enc(S));
    await writeMe({ name, at: Date.now(), cats: [], key: await myKey() });
    view = "room"; history.replaceState(null, "", "#" + code); subscribe();
  }
  async function joinRoom(code, name) {
    const s = await db.ref("mf/" + code + "/state").get();
    if (!s.exists()) throw new Error("nocode");
    const same = ME && ME.code === code ? ME.pid : null;
    ME = { pid: same || (self.FNN && FNN.pid) || "p" + rid(8), name, code }; LS.set(MKEY, ME);
    P = {};
    const cur = dec((await db.ref("mf/" + code + "/players/" + ME.pid).get()).val()) || {};
    await db.ref("mf/" + code + "/players/" + ME.pid).set(enc(Object.assign({ cats: [] }, cur, { name, key: await myKey(), at: cur.at || Date.now() })));
    S = dec(s.val()); view = "room"; history.replaceState(null, "", "#" + code); subscribe();
  }
  function leaveRoom() { unsubscribe(); if (ME) { ME.code = null; LS.set(MKEY, ME); } S = null; P = {}; VDEC = {}; history.replaceState(null, "", location.pathname); goHome(); }

  /* ---------------- host ---------------- */
  function packVotes() { const v = {}; CATS.forEach(c => v[c.id] = 0); pids().forEach(id => (P[id].cats || []).forEach(c => { if (c in v) v[c]++; })); return v; }
  const votesNow = () => { const o = {}; (S.order || []).forEach(id => { const e = VDEC[id]; if (e && S.q && e.q === S.q.id && voted(id)) o[id] = e.t; }); return o; };
  async function hostStart() {
    const ids = pids();
    if (ids.length < MIN_P) return `تحتاجون ${MIN_P} لاعبين على الأقل.`;
    const noKey = ids.filter(id => !P[id].key);
    if (noKey.length) return "لازم " + noKey.map(id => P[id].name).join(" و") + " يحدّث الصفحة.";
    const v = packVotes();
    let chosen = CATS.map(c => c.id).filter(id => v[id] > 0);
    if (!chosen.length) chosen = CATS.map(c => c.id);
    const used = (S.used || []).slice();
    const qs = pickQuestions(chosen, S.rounds, used);
    const names = {}; ids.forEach(id => names[id] = P[id].name);
    const scores = {}; ids.forEach(id => scores[id] = 0);
    const game = (S.game || 0) + 1;
    await writeState({ game, hk: await myKey(), phase: "vote", idx: 0, total: qs.length, qs: qs.map(q => ({ text: q.q, cat: q.cat })), order: ids, names, scores, titles: [], used: used.concat(qs.map(q => q.key)), q: pub(qs[0].q, qs[0].cat, 0, game), reveal: null });
    return "";
  }
  const pub = (text, cat, i, game) => ({ id: game + "-" + i + "-" + rid(3), i, text, cat });
  let ticking = false;
  async function hostTick() {
    if (!isHost() || ticking || !S || S.phase !== "vote") return;
    ticking = true;
    try {
      const el = (Date.now() - stepStart) / 1000;
      const nVoted = (S.order || []).filter(voted).length, nDec = Object.keys(votesNow()).length;
      if ((nVoted >= S.order.length && nDec >= nVoted) || el > VOTE_S + 1) await hostReveal();
    } finally { ticking = false; }
  }
  async function hostReveal() {
    if (S.phase !== "vote") return;
    const r = scoreRound(S.order, votesNow());
    const scores = Object.assign({}, S.scores); Object.entries(r.deltas).forEach(([id, d]) => scores[id] = (scores[id] || 0) + d);
    const titles = (S.titles || []).concat(r.winners.length ? [{ q: S.q.text, w: r.winners, n: r.counts[r.winners[0]] }] : []);
    await writeState({ phase: "reveal", scores, titles, reveal: { counts: r.counts, winners: r.winners, right: r.right, deltas: r.deltas, tie: r.tie, n: Object.keys(votesNow()).length } });
  }
  async function hostNext() {
    const i = S.idx + 1;
    if (i >= S.total) { await writeState({ phase: "end" }); return; }
    const q = S.qs[i];
    await writeState({ phase: "vote", idx: i, q: pub(q.text, q.cat, i, S.game), reveal: null });
  }

  /* ---------------- views ---------------- */
  const short = t => String(t).replace(/^مين فينا\s*/, "").replace(/؟$/, "");
  function standings(deltas) {
    const ids = Object.keys(S.scores || {}).sort((a, b) => (S.scores[b] || 0) - (S.scores[a] || 0));
    return `<table><thead><tr><th>اللاعب</th>${deltas ? `<th class="n">هالجولة</th>` : ""}<th class="n">النقاط</th></tr></thead><tbody>${ids.map(id => `<tr><td>${esc(nameOf(id))}${id === ME.pid ? " (أنت)" : ""}</td>${deltas ? `<td class="n ${deltas[id] ? "plus" : ""}">${deltas[id] ? "+" + deltas[id] : "0"}</td>` : ""}<td class="n">${S.scores[id] || 0}</td></tr>`).join("")}</tbody></table>`;
  }
  function bars(order, counts, winners) {
    const max = Math.max(1, ...order.map(id => counts[id] || 0));
    return `<div class="bars">${order.slice().sort((a, b) => (counts[b] || 0) - (counts[a] || 0)).map(id => `<div class="bar ${winners.includes(id) ? "win" : ""}"><span>${esc(nameOf(id))}</span><span class="tr"><i style="width:${((counts[id] || 0) / max) * 100}%"></i></span><span>${counts[id] || 0}</span></div>`).join("")}</div>`;
  }
  const timerBar = () => `<div class="tbar"><i id="tb" style="width:100%"></i></div>`;
  function startTimer(sec) {
    const upd = () => { const left = Math.max(0, sec * 1000 - (Date.now() - stepStart)); const b = document.getElementById("tb"); if (b) b.style.width = (left / (sec * 1000) * 100) + "%"; if (left <= 0) hostTick(); };
    upd(); tick = setInterval(upd, 300);
  }
  function titlesHTML() {
    const t = S.titles || [];
    if (!t.length) return "";
    return `<div class="card"><h2>الألقاب 👑</h2><ul class="titles">${t.map(x => `<li><b>${esc(x.w.map(nameOf).join(" و"))}</b><span>${esc(short(x.q))}</span></li>`).join("")}</ul></div>`;
  }
  function render() {
    if (view !== "room") return;
    if (!S) { app.innerHTML = `<div class="card center"><p class="big-msg">جاري الاتصال…</p></div>`; return; }
    chip.hidden = false; chip.innerHTML = `الغرفة <b dir="ltr">${esc(ME.code)}</b> · ${esc(ME.name)}${isHost() ? " 👑" : ""}`;
    clearInterval(tick); tick = null;
    if (!P[ME.pid] && Object.keys(P).length) { app.innerHTML = `<div class="card center"><p class="big-msg">انشلت من الغرفة</p></div>`; return; }
    const inGame = (S.order || []).includes(ME.pid);
    const cat = S.q && catById(S.q.cat);
    const leave = `<button type="button" class="btn alt mt" data-act="leave">اطلع من الغرفة</button>`;

    if (S.phase === "lobby" || (!inGame && S.phase !== "end")) {
      const ids = pids(), v = packVotes(), mine = myEntry().cats || [];
      let qr = "";
      try { if (typeof QRCode !== "undefined") { const d = document.createElement("div"); new QRCode(d, { text: joinURL(ME.code), width: 240, height: 240, colorDark: "#2b1745", colorLight: "#ffffff" }); const c = d.querySelector("canvas"); qr = c ? c.toDataURL() : ""; } } catch (e) {}
      const waiting = S.phase !== "lobby";
      app.innerHTML = `${waiting ? `<div class="card center"><p class="big-msg">اللعبة شغالة، تدخل معهم في اللعبة الجاية ⏳</p></div>` : ""}
        <div class="card center"><span class="lbl">رمز الغرفة</span><div class="code">${esc(ME.code)}</div>${qr ? `<img class="qr" src="${qr}" alt="باركود الدخول">` : ""}
          <p class="note">خلّ البقية يصوّرون الباركود أو يدخلون الرمز.</p><button type="button" class="ghost mt" data-act="copy">انسخ رابط الدخول</button>
          <p class="note">📺 للعرض على التلفزيون: <b dir="ltr">${esc(tvURL().replace(/^https?:\/\//, ""))}</b></p></div>
        <div class="card"><h2>اللاعبين (${ids.length})</h2><ul class="plist">${ids.map(id => `<li class="${id === ME.pid ? "me" : ""}">${esc(P[id].name)}${id === S.host ? " 👑" : ""}${isHost() && id !== ME.pid && !waiting ? ` <button type="button" data-kick="${id}" aria-label="شيل">✕</button>` : ""}</li>`).join("")}</ul></div>
        ${waiting ? "" : `<div class="card"><h2>نوع الأسئلة</h2><p class="note">صوّت للي تبيه. إذا ما أحد صوّت، تجي الأسئلة من الكل.</p>
          <div class="catv mt">${CATS.map(c => `<button type="button" data-vcat="${c.id}" class="${mine.includes(c.id) ? "on" : ""}"><span>${esc(c.emoji)} ${esc(c.name)}</span><small>${v[c.id] || ""}</small></button>`).join("")}</div></div>
        ${isHost() ? `<div class="card"><div class="field"><span class="lbl">عدد الأسئلة</span><div class="seg">${[6, 8, 10, 12, 15].map(n => `<button type="button" data-rounds="${n}" class="${S.rounds === n ? "on" : ""}">${n}</button>`).join("")}</div></div>
          <p class="err" id="herr"></p><button type="button" class="btn" data-act="hstart" ${ids.length < MIN_P ? "disabled" : ""}>ابدأ اللعبة</button>${ids.length < MIN_P ? `<p class="note center">ننتظر ${MIN_P - ids.length} لاعب${MIN_P - ids.length > 1 ? "ين" : ""} بعد.</p>` : ""}</div>`
          : `<div class="card center"><p class="note">ننتظر 👑 ${esc(nameOf(S.host))} يبدأ اللعبة…</p></div>`}`}
        ${leave}`;
      return;
    }
    const head = S.q ? `<p class="note center">السؤال ${S.idx + 1} من ${S.total} · ${cat ? esc(cat.emoji + " " + cat.name) : ""}</p>` : "";
    const qtext = S.q ? `<p class="stmt">${esc(S.q.text)}</p>` : "";
    const order = S.order || [];
    if (S.phase === "vote") {
      const done = order.filter(voted), me = voted(ME.pid);
      app.innerHTML = `<div class="card">${head}${qtext}${timerBar()}
        ${me ? `<p class="big-msg">صوّتت ✓</p><p class="note center">ننتظر الباقين… محد بيعرف مين صوّت لمين 🤫</p>`
          : `<p class="note center">اختار واحد (تقدر تختار نفسك 😄)</p><div class="vote mt">${order.map(t => `<button type="button" data-vote="${t}" class="${myPick === t ? "on" : ""}">${esc(nameOf(t))}${t === ME.pid ? " (أنت)" : ""}</button>`).join("")}</div>
            <button type="button" class="btn mt" data-act="dovote" ${myPick ? "" : "disabled"}>تأكيد التصويت</button>`}
        <ul class="plist mt">${order.map(id => `<li class="${id === ME.pid ? "me" : ""} ${done.includes(id) ? "done" : ""}">${esc(nameOf(id))}</li>`).join("")}</ul>
        ${isHost() ? `<button type="button" class="btn alt mt" data-act="hreveal">اكشف الحين</button>` : ""}</div>`;
      startTimer(VOTE_S);
      return;
    }
    if (S.phase === "reveal") {
      const r = S.reveal || { counts: {}, winners: [], right: [], deltas: {} };
      const amWin = r.winners.includes(ME.pid), amRight = r.right.includes(ME.pid);
      if (self.FA) FA.once("mf-rv-" + S.q.id, () => { if (r.winners.length) { FA.play("party", [40, 40, 40]); FA.confetti(); FA.slam("👑 " + r.winners.map(nameOf).join(" و"), amRight ? "توقعت مع الأغلبية +1" : null, "#ffb21e"); } else if (r.tie) FA.slam("تعادل كامل 🤝", null, "#7c3aed"); });
      app.innerHTML = `<div class="card">${head}${qtext}
        ${r.winners.length ? `<p class="big-msg">👑 ${esc(r.winners.map(nameOf).join(" و"))}</p><p class="note center">${amWin ? "هذا أنت 😂" : ""}${amRight ? " توقعت مع الأغلبية <b class=\"word\">+1</b>" : ""}</p>` : r.tie ? `<p class="big-msg">تعادل كامل 🤝</p><p class="note center">ما أحد ياخذ اللقب ولا نقاط هالمرة</p>` : `<p class="big-msg">ما أحد صوّت ⏱️</p>`}
        ${bars(order, r.counts, r.winners)}</div>
        <div class="card"><h2>الترتيب</h2>${standings(r.deltas)}${isHost() ? `<button type="button" class="btn mt" data-act="hnext">${S.idx + 1 >= S.total ? "النتيجة النهائية 🏆" : "السؤال اللي بعده"}</button>` : `<p class="note center mt">ننتظر 👑 ${esc(nameOf(S.host))}…</p>`}</div>`;
      return;
    }
    if (S.phase === "end") {
      if (self.FA) FA.once("mf-end-" + ME.code + "-" + S.game, () => { const ids = Object.keys(S.scores || {}).sort((a, b) => (S.scores[b] || 0) - (S.scores[a] || 0)); if (ids.length) FA.winner(nameOf(ids[0]), ids.map(id => [nameOf(id), S.scores[id] || 0])); });
      const ids = Object.keys(S.scores || {}).sort((a, b) => (S.scores[b] || 0) - (S.scores[a] || 0));
      const medal = ["🥇", "🥈", "🥉"];
      app.innerHTML = `<div class="card"><h2 class="center">النتيجة النهائية 🏆</h2><p class="note center">أكثر واحد توقّع مع الأغلبية</p><div class="podium mt">${ids.map((id, i) => `<div><span>${medal[i] || i + 1 + "."} ${esc(nameOf(id))}</span><span>${S.scores[id] || 0}</span></div>`).join("")}</div>
        ${isHost() ? `<button type="button" class="btn mt" data-act="hlobby">لعبة جديدة بنفس الغرفة</button>` : `<p class="note center mt">ننتظر 👑 ${esc(nameOf(S.host))} يبدأ لعبة جديدة…</p>`}</div>
        ${titlesHTML()}${leave}`;
    }
  }
  async function roomClick(b) {
    const a = b.dataset.act;
    try {
      if (b.dataset.vcat) { const cur = myEntry().cats || []; const id = b.dataset.vcat; await writeMe({ cats: cur.includes(id) ? cur.filter(x => x !== id) : cur.concat(id) }); render(); return; }
      if (b.dataset.vote) { myPick = b.dataset.vote; render(); return; }
      if (a === "dovote" && myPick && S.phase === "vote" && S.hk) { const t = myPick; await writeMe({ vote: { q: S.q.id, s: await FNC.seal(S.hk, t) } }); myPick = null; render(); return; }
      if (a === "copy") { try { await navigator.clipboard.writeText(joinURL(ME.code)); b.textContent = "انتسخ ✓"; } catch (e) { b.textContent = joinURL(ME.code); } return; }
      if (a === "leave") { leaveRoom(); return; }
      if (!isHost()) return;
      if (b.dataset.kick) { await ref("players/" + b.dataset.kick).remove(); return; }
      if (b.dataset.rounds) { await writeState({ rounds: +b.dataset.rounds }); return; }
      if (a === "hstart") { b.disabled = true; const m = await hostStart(); if (m) { document.getElementById("herr").textContent = m; b.disabled = false; } return; }
      if (a === "hreveal") { await hostReveal(); return; }
      if (a === "hnext") { b.disabled = true; await hostNext(); return; }
      if (a === "hlobby") { await writeState({ phase: "lobby", q: null, reveal: null }); return; }
    } catch (e) { console.error(e); alert("ما قدرت أتصل. تأكد من النت وجرّب مرة ثانية."); }
  }

  /* ---------------- home ---------------- */
  function goHome() { view = "home"; chip.hidden = true; clearInterval(tick); renderHome(); }
  function renderHome() {
    app.innerHTML = `<div class="hero"><h1>مين فينا؟ 👀</h1><p>سؤال، وكل واحد يصوّت سري… ونشوف مين ياخذ اللقب!</p></div>
      <div class="modes">
        <button type="button" class="mode" data-act="ocreate"><span class="ic">📡</span><span><b>افتح غرفة</b><span>كل واحد يلعب من جواله (3 لاعبين وأكثر)</span></span></button>
        <button type="button" class="mode" data-act="ojoin"><span class="ic">🔑</span><span><b>ادخل غرفة</b><span>عندك رمز من صاحبك</span></span></button>
      </div>
      <div class="card mt"><h3>طريقة اللعب</h3><ul class="note"><li>يطلع سؤال مثل «مين فينا أكثر واحد يتأخر؟».</li><li>كل واحد يصوّت من جواله لواحد من الموجودين، حتى نفسه.</li><li>التصويت سري: محد يعرف مين صوّت لمين، بس نشوف كم صوت أخذ كل واحد.</li><li>اللي ياخذ أكثر أصوات ياخذ اللقب 👑، وكل واحد صوّت له ياخذ <b>+1</b> (إلا إذا صوّت لنفسه).</li><li>إذا تعادل الكل، ما أحد ياخذ اللقب ولا نقاط.</li></ul>
      <p class="note">نوع الأسئلة: ${CATS.map(c => esc(c.emoji + " " + c.name)).join(" · ")}</p><p class="note">📺 تقدرون تعرضونها على التلفزيون من صفحة «شاشة العرض».</p></div>`;
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
  const LATE = { vote: VOTE_S };
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
    // سهرة: the night's host opens this room (or comes back to it)
    if (self.FNN && FNN.host && FNN.room === h && db) db.ref("mf/" + h + "/state").get().then(s => s.exists() ? joinRoom(h, FNN.name) : createRoom(FNN.name)).catch(() => renderForm("join", h, "ما قدرت أتصل. تأكد من النت."));
    else if (/^[A-Z]{4}$/.test(h)) {
      if (ME && ME.code === h && ME.name && db) joinRoom(h, ME.name).catch(() => renderForm("join", h, "ما لقيت غرفة بهالرمز."));
      else renderForm("join", h);
    } else if (ME && ME.code && db) joinRoom(ME.code, ME.name).catch(() => { ME.code = null; LS.set(MKEY, ME); goHome(); });
    else goHome();
  }).catch(() => { app.innerHTML = `<div class="card"><p class="big-msg">ما قدرت أحمّل الأسئلة. حدّث الصفحة.</p></div>`; });
  self.MF = { pickQuestions, scoreRound, get CATS() { return CATS; } };
})();
