/* خلية الحروف — two teams race to join their two sides of a board of letters.
   The host is the presenter (مقدّم): he sees the answer, the players don't.
   A team picks a letter → a question whose answer starts with it → the fastest 🔔 on a phone answers out loud →
   the presenter taps ✅ (the cell takes that team's colour) or ❌ (the other team gets a go).
   🟢 joins top↔bottom, 🟠 joins right↔left; the first to join wins the round.
   Paths under hr/<CODE>/:  state (written by the host)   players/<pid> (each player's own: name, team, buzz, pick)
   Values are stored as {j: JSON string}. The answers live only in questions.json, hidden (x), opened on the host's phone. */
(function () {
  "use strict";
  const app = document.getElementById("app");
  const chip = document.getElementById("hdrChip");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rnd = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
  const rint = n => Math.floor(rnd() * n);
  const rid = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, "0")).join("");
  const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const play = (k, v) => { if (self.FX) FX.play(k, v); };

  const TEAM = { 1: { name: "الأخضر", ic: "🟢", c: "#12a874" }, 2: { name: "البرتقالي", ic: "🟠", c: "#ff7a1a" } };
  const LEVEL = { 0: "منوّع", 1: "سهل", 2: "متوسط", 3: "صعب" };
  const other = t => (t === 1 ? 2 : 1);

  /* ---------------- questions ---------------- */
  let QS = [];
  const key = i => Array.from({ length: 64 }, (_, k) => ([...i].reduce((n, c) => n + c.codePointAt(0), 0) * (k + 7) + 31 * k) % 251);
  function answerOf(q) {
    try { const k = key(q.id), b = Uint8Array.from(atob(q.x), (x, n) => x.charCodeAt(0) ^ k[n % 64]); return new TextDecoder().decode(b); } catch (e) { return "؟"; }
  }
  const SEEN_KEY = "hr-seen-v1";
  const seenList = () => { const v = LS.get(SEEN_KEY, []); return Array.isArray(v) ? v : []; };
  function noteSeen(id) { const l = seenList().filter(x => x !== id); l.push(id); LS.set(SEEN_KEY, l.slice(-1500)); }
  // a question for this letter: the level asked for if there is one, nothing used in this room, nothing this phone saw lately
  function pickQ(letter, level, used, not) {
    const all = QS.filter(q => q.l === letter && q.id !== not), seen = seenList(), u = new Set(used || []);
    const tiers = [
      q => !u.has(q.id) && !seen.includes(q.id) && (!level || q.d === level),
      q => !u.has(q.id) && !seen.includes(q.id),
      q => !u.has(q.id) && (!level || q.d === level),
      q => !u.has(q.id),
      () => true,
    ];
    for (const f of tiers) {
      const c = all.filter(f);
      if (!c.length) continue;
      if (f === tiers[4]) return c.slice().sort((a, b) => seen.indexOf(a.id) - seen.indexOf(b.id))[0];   // all used: the one seen longest ago
      return c[rint(c.length)];
    }
    return null;
  }
  const haveCount = () => { const o = {}; QS.forEach(q => o[q.l] = (o[q.l] || 0) + 1); return o; };

  /* ---------------- firebase ---------------- */
  const CFG = self.FIREBASE_CONFIG;
  let db = null;
  try { if (CFG && CFG.databaseURL && self.firebase) { firebase.initializeApp(CFG); db = firebase.database(); } } catch (e) { console.error(e); }
  const enc = o => ({ j: JSON.stringify(o) });
  const dec = v => { try { return v && typeof v.j === "string" ? JSON.parse(v.j) : null; } catch (e) { return null; } };
  const MKEY = "hr-me-v1";
  let ME = LS.get(MKEY, null);
  let S = null, P = {}, subs = [], view = "home", lastStep = "", stepStart = 0;
  const ARR = {};                                  // host: when each buzz first reached this phone
  const isHost = () => S && ME && S.host === ME.pid;
  const ref = p => db.ref("hr/" + ME.code + (p ? "/" + p : ""));
  const nameOf = id => (P[id] && P[id].name) || (S && S.names && S.names[id]) || "؟";
  const teamOf = id => (S && S.teams && S.teams[id]) || (P[id] && P[id].team) || 0;
  const myEntry = () => (P[ME.pid] || {});
  function writeMe(patch) { const cur = Object.assign({}, myEntry(), patch); P[ME.pid] = cur; return ref("players/" + ME.pid).set(enc(cur)); }
  function writeState(patch) { S = Object.assign({}, S, patch); return ref("state").set(enc(S)); }
  const tvURL = () => location.origin + location.pathname.replace(/hroof\/?(index\.html)?$/, "") + "tv/";
  const joinURL = c => location.origin + location.pathname + "#" + c;
  const pids = () => Object.keys(P).sort((a, b) => (P[a].at || 0) - (P[b].at || 0));
  const stepKey = () => S ? S.phase + ":" + (S.q ? S.q.id : "") + ":" + (S.buzz || "") + ":" + (S.locked || []).join("") : "";

  function unsubscribe() { subs.forEach(f => f()); subs = []; }
  const touchMe = () => { if (ME && ME.code && Date.now() - (ME.t || 0) > 20000) { ME.t = Date.now(); LS.set(MKEY, ME); } };
  const BACK_MS = 15 * 60e3;
  function backToRoom() {
    db.ref("hr/" + ME.code + "/state").get().then(s => {
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
    if (self.FNN && FNN.room) code = FNN.room;
    else for (let i = 0; i < 5; i++) { const s = await db.ref("hr/" + code + "/state").get(); if (!s.exists()) break; code = genCode(); }
    ME = { pid: (self.FNN && FNN.pid) || "p" + rid(8), name, code }; LS.set(MKEY, ME);
    S = { v: 1, host: ME.pid, phase: "lobby", target: 2, level: 0, names: {}, wins: { 1: 0, 2: 0 }, used: [], at: Date.now() };
    if (self.FNN) S.nt = FNN.n;
    await ref("state").set(enc(S));
    await writeMe({ name, at: Date.now(), team: 0 });
    view = "room"; history.replaceState(null, "", "#" + code); subscribe();
  }
  async function joinRoom(code, name) {
    const s = await db.ref("hr/" + code + "/state").get();
    if (!s.exists()) throw new Error("nocode");
    const same = ME && ME.code === code ? ME.pid : self.FNN && FNN.room === code && FNN.pid || null, nm = x => String(x || "").trim().toLowerCase();
    const others = (await db.ref("hr/" + code + "/players").get()).val() || {};
    if (Object.entries(others).some(([id, x]) => id !== same && nm((dec(x) || {}).name) === nm(name))) throw new Error("taken");
    ME = { pid: same || "p" + rid(8), name, code }; LS.set(MKEY, ME);
    P = {};
    const cur = dec((await db.ref("hr/" + code + "/players/" + ME.pid).get()).val()) || {};
    await db.ref("hr/" + code + "/players/" + ME.pid).set(enc(Object.assign({ team: 0 }, cur, { name, at: cur.at || Date.now() })));
    S = dec(s.val()); view = "room"; history.replaceState(null, "", "#" + code); subscribe();
  }
  function leaveRoom() { unsubscribe(); if (ME) { ME.code = null; LS.set(MKEY, ME); } S = null; P = {}; history.replaceState(null, "", location.pathname); goHome(); }

  /* ---------------- host ---------------- */
  const players = () => pids().filter(id => id !== (S && S.host));
  const inTeam = t => players().filter(id => (P[id].team || 0) === t);
  async function hostStart() {
    const a = inTeam(1), b = inTeam(2);
    if (!a.length || !b.length) return "لازم يكون في كل فريق لاعب واحد على الأقل.";
    const teams = {}, names = {};
    a.forEach(id => teams[id] = 1); b.forEach(id => teams[id] = 2);
    pids().forEach(id => names[id] = P[id].name);
    await writeState({ phase: "pick", teams, names, wins: { 1: 0, 2: 0 }, round: 1, board: HRB.newBoard(haveCount(), rnd), turn: 1 + rint(2), sel: null, q: null, buzz: null, locked: [], win: null, last: null, pickAt: Date.now(), game: (S.game || 0) + 1 });
    return "";
  }
  async function hostSelect(i, not) {
    if (!S.board || S.board.own[i]) return;
    const q = pickQ(S.board.L[i], S.level, S.used, not);
    if (!q) { alert("ما فيه أسئلة لهالحرف."); return; }
    noteSeen(q.id);
    await writeState({ phase: "q", sel: i, q: { id: q.id, text: q.q, l: q.l, d: q.d }, locked: [], buzz: null, used: (S.used || []).concat(q.id).slice(-600), last: null });
  }
  async function hostJudge(ok, team) {
    const t = team || teamOf(S.buzz);
    if (!t || S.sel == null) return;
    if (!ok) {
      const locked = (S.locked || []).concat(t);
      await writeState({ phase: "q", buzz: null, locked, last: { pid: S.buzz, t, ok: false } });
      return;
    }
    const own = S.board.own.slice(); own[S.sel] = t;
    const board = Object.assign({}, S.board, { own }), w = HRB.winner(own), last = { pid: S.buzz, t, ok: true, cell: S.sel, a: curAnswer() };
    if (w) {
      const wins = Object.assign({ 1: 0, 2: 0 }, S.wins); wins[w.t]++;
      await writeState({ phase: wins[w.t] >= S.target ? "end" : "won", board, wins, win: w, buzz: null, q: null, last, sel: null });
      return;
    }
    // the board is full and nobody joined (rare): the team with more cells takes the round
    if (own.every(x => x)) {
      const n1 = own.filter(x => x === 1).length, wt = n1 * 2 >= own.length ? 1 : 2, wins = Object.assign({ 1: 0, 2: 0 }, S.wins); wins[wt]++;
      await writeState({ phase: wins[wt] >= S.target ? "end" : "won", board, wins, win: { t: wt, path: [] }, buzz: null, q: null, last, sel: null });
      return;
    }
    await writeState({ phase: "pick", board, turn: t, sel: null, q: null, buzz: null, locked: [], last, pickAt: Date.now() });
  }
  async function hostSkip() { await writeState({ phase: "pick", sel: null, q: null, buzz: null, locked: [], last: { skip: true, a: curAnswer() }, pickAt: Date.now() }); }
  async function hostNextRound() {
    const loser = S.win ? other(S.win.t) : 1 + rint(2);
    await writeState({ phase: "pick", round: (S.round || 1) + 1, board: HRB.newBoard(haveCount(), rnd), turn: loser, sel: null, q: null, buzz: null, locked: [], win: null, last: null, pickAt: Date.now() });
  }
  const curAnswer = () => { const q = S && S.q && QS.find(x => x.id === S.q.id); return q ? answerOf(q) : ""; };
  let ticking = false;
  async function hostTick() {
    if (!isHost() || ticking || !S) return;
    ticking = true;
    try {
      // a player of the team whose turn it is tapped a letter
      if (S.phase === "pick") {
        const req = players().filter(id => teamOf(id) === S.turn && P[id].pick && P[id].pick.t > (S.pickAt || 0) - 30000 && P[id].pick.r === S.pickAt)
          .map(id => P[id].pick).sort((a, b) => a.t - b.t)[0];
        if (req && S.board && !S.board.own[req.i]) await hostSelect(req.i);
      }
      // 🔔: the first buzz to reach the host's phone answers (a team that already missed this question can't buzz)
      if (S.phase === "q" && S.q) {
        const locked = S.locked || [], now = Date.now();
        const cand = players().filter(id => { const b = P[id].buzz, t = teamOf(id); return b && b.q === S.q.id && t && !locked.includes(t); });
        cand.forEach(id => { const k = S.q.id + ":" + id + ":" + locked.length; if (ARR[k] == null) ARR[k] = now; });
        const first = cand.sort((a, b) => (ARR[S.q.id + ":" + a + ":" + locked.length] - ARR[S.q.id + ":" + b + ":" + locked.length]) || (P[a].buzz.t - P[b].buzz.t))[0];
        if (first) await writeState({ phase: "buzz", buzz: first, buzzAt: Date.now() });
      }
    } finally { ticking = false; }
  }

  /* ---------------- views ---------------- */
  const teamTag = t => t ? `<span class="tt t${t}">${TEAM[t].ic} ${TEAM[t].name}</span>` : "";
  function scoreBar() {
    const w = S.wins || { 1: 0, 2: 0 }, need = S.target || 2;
    return `<div class="sbar"><div class="sb t1"><b>${w[1] || 0}</b><span>${TEAM[1].ic} ${TEAM[1].name}</span><i>فوق ↕ تحت</i></div>
      <div class="sbm">الجولة ${S.round || 1}<small>${need > 1 ? `اللي يفوز بـ${need} يكسب` : "جولة وحدة"}</small></div>
      <div class="sb t2"><b>${w[2] || 0}</b><span>${TEAM[2].ic} ${TEAM[2].name}</span><i>يمين ↔ يسار</i></div></div>`;
  }
  const boardHTML = tap => `<div class="bwrap">${HRB.svg(S.board, { sel: S.sel, win: S.win && S.win.path, tap })}</div>${S.phase === "won" || S.phase === "end" ? "" : `<p class="hint">${esc(HRB.hint(S.board.own))}</p>`}`;
  function render() {
    if (view !== "room") return;
    if (!S) { app.innerHTML = `<div class="card center"><p class="big-msg">جاري الاتصال…</p></div>`; return; }
    const host = isHost(), myT = teamOf(ME.pid);
    chip.hidden = false; chip.innerHTML = `الغرفة <b dir="ltr">${esc(ME.code)}</b> · ${esc(ME.name)}${host ? " 🎙️" : myT ? " " + TEAM[myT].ic : ""}`;
    if (!P[ME.pid] && Object.keys(P).length) { app.innerHTML = `<div class="card center"><p class="big-msg">انشلت من الغرفة</p></div>`; return; }
    const leave = `<button type="button" class="btn alt mt" data-act="leave">اطلع من الغرفة</button>`;
    const inGame = host || (S.teams && S.teams[ME.pid]);
    document.body.classList.toggle("hrplay", S.phase !== "lobby" && !!inGame);
    document.body.classList.toggle("hrdock", false);

    if (S.phase === "lobby" || !inGame) {
      const waiting = S.phase !== "lobby", ids = players();
      let qr = "";
      try { if (typeof QRCode !== "undefined") { const d = document.createElement("div"); new QRCode(d, { text: joinURL(ME.code), width: 240, height: 240, colorDark: "#2b1745", colorLight: "#ffffff" }); const c = d.querySelector("canvas"); qr = c ? c.toDataURL() : ""; } } catch (e) {}
      const col = t => `<div class="tcol t${t}"><h3>${TEAM[t].ic} ${TEAM[t].name}</h3><ul class="plist">${ids.filter(id => (P[id].team || 0) === t).map(id => `<li class="${id === ME.pid ? "me" : ""}">${esc(P[id].name)}${host && !waiting ? ` <button type="button" data-move="${id}" aria-label="انقل">⇄</button><button type="button" data-kick="${id}" aria-label="شيل">✕</button>` : ""}</li>`).join("")}${Array.from({ length: Math.max(0, 2 - ids.filter(id => (P[id].team || 0) === t).length) }, () => `<li class="empty">بانتظار لاعب…</li>`).join("")}</ul>
        ${!host && !waiting && myT !== t ? `<button type="button" class="btn small" data-team="${t}">انضم ${TEAM[t].ic}</button>` : ""}</div>`;
      const none = ids.filter(id => !(P[id].team));
      app.innerHTML = `${waiting ? `<div class="card center"><p class="big-msg">اللعبة شغالة، تدخل معهم في اللعبة الجاية ⏳</p></div>` : ""}
        <div class="card center"><span class="lbl">رمز الغرفة</span><div class="code">${esc(ME.code)}</div>${qr ? `<img class="qr" src="${qr}" alt="باركود الدخول">` : ""}
          <p class="note">خلّ البقية يصوّرون الباركود أو يدخلون الرمز.</p><button type="button" class="ghost mt" data-act="copy">انسخ رابط الدخول</button>
          <p class="note">📺 اعرضوها على التلفزيون: <b dir="ltr">${esc(tvURL().replace(/^https?:\/\//, ""))}</b></p></div>
        <div class="card"><h2>الفريقين</h2><p class="note">🎙️ المقدّم: <b>${esc(nameOf(S.host))}</b>، يشوف الأجوبة ويحكم.</p>
          <div class="teams">${col(1)}${col(2)}</div>
          ${none.length ? `<p class="note">ما اختاروا فريق: ${none.map(id => esc(P[id].name)).join("، ")}</p>` : ""}</div>
        ${waiting ? "" : host ? `<div class="card"><div class="field"><span class="lbl">المستوى</span><div class="seg">${[0, 1, 2, 3].map(n => `<button type="button" data-level="${n}" class="${(S.level || 0) === n ? "on" : ""}">${LEVEL[n]}</button>`).join("")}</div></div>
          <div class="field"><span class="lbl">الجولات</span><div class="seg">${[[1, "جولة وحدة"], [2, "الأفضل من 3"], [3, "الأفضل من 5"]].map(([n, t]) => `<button type="button" data-target="${n}" class="${S.target === n ? "on" : ""}">${t}</button>`).join("")}</div></div>
          <p class="err" id="herr"></p><button type="button" class="btn" data-act="hstart">ابدأ اللعبة</button></div>`
          : `<div class="card center"><p class="note">${myT ? `أنت في ${teamTag(myT)}. ` : "اختار فريقك 👆 "}ننتظر 🎙️ ${esc(nameOf(S.host))} يبدأ…</p></div>`}
        ${leave}`;
      return;
    }
    const turnT = S.turn, myTurn = !host && myT === turnT;
    if (S.phase === "pick") {
      const lastMsg = S.last ? (S.last.skip ? `⏭️ تخطّينا. الجواب كان: <b>${esc(S.last.a || "")}</b>` : S.last.ok ? `✅ ${S.last.pid ? esc(nameOf(S.last.pid)) : TEAM[S.last.t].ic + " " + TEAM[S.last.t].name} جاوب صح: <b>${esc(S.last.a || "")}</b>` : "") : "";
      app.innerHTML = `${scoreBar()}<div class="card">${lastMsg ? `<p class="note center">${lastMsg}</p>` : ""}
        <p class="big-msg">${teamTag(turnT)} يختار حرف</p>${boardHTML(host || myTurn)}
        <p class="note center">${host ? "اضغط الحرف اللي يقولونه، أو يختارونه من جوالاتهم." : myTurn ? "اختار حرف من اللوحة 👆" : "ننتظرهم يختارون…"}</p></div>${leave}`;
      return;
    }
    if (S.phase === "q" || S.phase === "buzz") {
      const locked = S.locked || [], canBuzz = !host && myT && !locked.includes(myT) && S.phase === "q";
      const mine = P[ME.pid] && P[ME.pid].buzz && S.q && P[ME.pid].buzz.q === S.q.id;
      const lastMiss = S.last && S.last.ok === false ? `<p class="note center">❌ ${esc(nameOf(S.last.pid))} غلط${locked.length < 2 ? `، الفرصة لـ${teamTag(other(S.last.t))}` : ""}</p>` : "";
      const qcard = `<div class="qcard"><span class="ql">${esc(S.q.l === "ا" ? "أ" : S.q.l)}</span><p class="stmt">${esc(S.q.text)}</p><p class="note center">جوابه يبدأ بحرف «${esc(S.q.l === "ا" ? "أ" : S.q.l)}»${S.q.d ? " · " + LEVEL[S.q.d] : ""}</p></div>`;
      let body = "";
      if (S.phase === "buzz") {
        const t = teamOf(S.buzz);
        body = `<div class="buzzed t${t}"><span>🔔</span><b>${esc(nameOf(S.buzz))}</b><em>ضغط الجرس! أسرع لاعب، يجاوب الحين</em>${teamTag(t)}</div>
          ${host ? `<div class="ans"><b>${esc(curAnswer())}</b></div><p class="private">🤫 لا تعرض شاشتك للاعبين</p><div class="dock"><div class="judge"><button type="button" class="btn ok" data-act="right">✅ صح</button><button type="button" class="btn no" data-act="wrong">❌ غلط</button></div></div>`
            : `<p class="note center">${S.buzz === ME.pid ? "جاوب بصوت عالي 🎤" : "يجاوب الحين…"}</p>`}`;
      } else if (host) {
        body = `<div class="ans"><b>${esc(curAnswer())}</b></div><p class="private">🤫 لا تعرض شاشتك للاعبين</p>
          ${locked.length >= 2 ? `<p class="note center">الفريقين غلطوا 😅</p>` : `<p class="note center">ننتظر أحد يضغط 🔔… أو احكم مباشرة من تحت 👇</p>`}
          <div class="dock">${locked.length >= 2 ? "" : `<div class="judge">${[1, 2].filter(t => !locked.includes(t)).map(t => `<button type="button" class="btn t${t}" data-act="give" data-t="${t}">✅ صح لـ${TEAM[t].name}</button>`).join("")}</div>`}
          <div class="judge"><button type="button" class="ghost" data-act="another">🔄 سؤال ثاني</button><button type="button" class="ghost" data-act="skip">⏭️ تخطّي</button></div></div>`;
      } else {
        body = canBuzz ? `<button type="button" class="buzzer" data-act="buzz" ${mine ? "disabled" : ""}>🔔<span>${mine ? "ضغطت!" : "اضغط إذا تعرف"}</span></button>`
          : `<p class="big-msg">${!myT ? "تتفرج 👀" : locked.includes(myT) ? "فريقك غلط، الفرصة للفريق الثاني ⏳" : "…"}</p>`;
      }
      app.innerHTML = `${scoreBar()}<div class="card">${qcard}${lastMiss}${body}<div class="mini">${boardHTML(false)}</div></div>${leave}`;
      document.body.classList.toggle("hrdock", !!app.querySelector(".dock"));
      if (S.phase === "buzz" && self.FA) FA.once("hr-bz-" + S.q.id + "-" + S.buzz + "-" + locked.length, () => play(S.buzz === ME.pid ? "right" : "whoosh", [40]));
      return;
    }
    if (S.phase === "won" || S.phase === "end") {
      const t = S.win ? S.win.t : 1, end = S.phase === "end";
      if (self.FA) FA.once("hr-w-" + ME.code + "-" + S.game + "-" + S.round, () => { if (end) FA.winner(TEAM[t].ic + " " + TEAM[t].name, [[TEAM[1].name, S.wins[1]], [TEAM[2].name, S.wins[2]]], "فاز باللعبة 🏆"); else { FA.play("party"); FA.confetti(); } });
      const members = Object.keys(S.teams || {}).filter(id => S.teams[id] === t).map(nameOf).join("، ");
      app.innerHTML = `${scoreBar()}<div class="card center"><p class="big-msg">${end ? "🏆" : "🎉"} ${teamTag(t)} ${end ? "فاز باللعبة!" : "فاز بالجولة!"}</p><p class="note">${esc(members)}</p>
        ${S.last && S.last.a ? `<p class="note">آخر جواب: <b>${esc(S.last.a)}</b></p>` : ""}${boardHTML(false)}
        ${host ? (end ? `<button type="button" class="btn mt" data-act="hlobby">لعبة جديدة بنفس الغرفة</button>` : `<button type="button" class="btn mt" data-act="nextround">الجولة اللي بعدها ←</button>`) : `<p class="note mt">ننتظر 🎙️ ${esc(nameOf(S.host))}…</p>`}</div>${leave}`;
    }
  }
  async function roomClick(el) {
    const a = el.dataset.act;
    try {
      const cell = el.dataset.cell;
      if (cell != null && S.phase === "pick") {
        const i = +cell;
        if (isHost()) { await hostSelect(i); return; }
        if (teamOf(ME.pid) === S.turn) { play("tap"); await writeMe({ pick: { i, t: Date.now(), r: S.pickAt } }); }
        return;
      }
      if (el.dataset.team) { await writeMe({ team: +el.dataset.team }); return; }
      if (a === "buzz") { if (S.phase === "q" && S.q) { play("tap", [30]); el.disabled = true; await writeMe({ buzz: { q: S.q.id, t: Date.now() } }); } return; }
      if (a === "copy") { try { await navigator.clipboard.writeText(joinURL(ME.code)); el.textContent = "انتسخ ✓"; } catch (e) { el.textContent = joinURL(ME.code); } return; }
      if (a === "leave") { leaveRoom(); return; }
      if (!isHost()) return;
      if (el.dataset.kick) { await ref("players/" + el.dataset.kick).remove(); return; }
      if (el.dataset.move) { const id = el.dataset.move, p = P[id]; await ref("players/" + id).set(enc(Object.assign({}, p, { team: p.team === 1 ? 2 : 1 }))); return; }
      if (el.dataset.level) { await writeState({ level: +el.dataset.level }); return; }
      if (el.dataset.target) { await writeState({ target: +el.dataset.target }); return; }
      if (a === "hstart") { el.disabled = true; const m = await hostStart(); if (m) { document.getElementById("herr").textContent = m; el.disabled = false; } return; }
      if (a === "right") { el.disabled = true; await hostJudge(true); return; }
      if (a === "wrong") { el.disabled = true; await hostJudge(false); return; }
      if (a === "give") { el.disabled = true; await writeState({ buzz: null }); await hostJudge(true, +el.dataset.t); return; }
      if (a === "another") { await hostSelect(S.sel, S.q && S.q.id); return; }
      if (a === "skip") { await hostSkip(); return; }
      if (a === "nextround") { el.disabled = true; await hostNextRound(); return; }
      if (a === "hlobby") { await writeState({ phase: "lobby", board: null, q: null, win: null, last: null }); return; }
    } catch (e) { console.error(e); alert("ما قدرت أتصل. تأكد من النت وجرّب مرة ثانية."); }
  }

  /* ---------------- home ---------------- */
  function goHome() { view = "home"; chip.hidden = true; document.body.classList.remove("hrplay", "hrdock"); renderHome(); }
  function renderHome() {
    const per = haveCount(), min = Math.min(...Object.values(per));
    app.innerHTML = `<div class="hero"><h1>خلية الحروف 🔤</h1><p>فريقين، لوحة حروف، وجرس… مين يوصّل أول؟</p></div>
      <div class="hero-board">${HRB.svg(HRB.newBoard(per, rnd), {})}</div>
      <div class="modes">
        <button type="button" class="mode" data-act="ocreate"><span class="ic">🎙️</span><span><b>افتح غرفة (أنت المقدّم)</b><span>تشوف الأجوبة وتحكم، والباقين فريقين</span></span></button>
        <button type="button" class="mode" data-act="ojoin"><span class="ic">🔑</span><span><b>ادخل غرفة</b><span>عندك رمز من المقدّم</span></span></button>
      </div>
      <div class="card mt"><h3>طريقة اللعب</h3><ul class="note">
        <li>فريقين: ${TEAM[1].ic} <b>الأخضر</b> يوصّل <b>فوق بتحت</b>، و${TEAM[2].ic} <b>البرتقالي</b> يوصّل <b>يمين بيسار</b>.</li>
        <li>الفريق اللي دوره يختار حرف، ويطلع سؤال جوابه يبدأ بهالحرف.</li>
        <li>أسرع واحد يضغط 🔔 من جواله يجاوب بصوت عالي، والمقدّم يحكم ✅ أو ❌.</li>
        <li>صح؟ الخلية تاخذ لون فريقه. غلط؟ الفرصة للفريق الثاني.</li>
        <li>أول فريق يوصّل ضفتيه يفوز بالجولة 🏆</li></ul>
      <p class="note">فيها ${QS.length} سؤال (${min}+ لكل حرف) · 📺 اعرضوها على التلفزيون من «شاشة العرض».</p></div>`;
  }
  function renderForm(kind, code, msg) {
    const nm = (ME && ME.name) || "";
    if (!db) { app.innerHTML = `<div class="card"><h2>الأونلاين مو شغال</h2><p class="note">ما قدرت أتصل بقاعدة البيانات. حدّث الصفحة.</p><button type="button" class="btn mt" data-act="home">رجوع</button></div>`; return; }
    view = kind;
    app.innerHTML = `<div class="card"><h2>${kind === "create" ? "🎙️ افتح غرفة" : "🔑 ادخل غرفة"}</h2>
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
  app.addEventListener("click", e => {
    const el = e.target.closest("button, [data-cell]"); if (!el || el.disabled) return;
    if (view === "room") roomClick(el); else homeClick(el);
  });
  app.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.dataset && e.target.dataset.cell != null) { e.preventDefault(); roomClick(e.target); } });
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
  setInterval(() => { if (self.FNW) FNW.hold(view === "room" && isHost()); }, 1000);
  fetch("questions.json", { cache: "no-cache" }).then(r => r.json()).then(d => {
    QS = (d.questions || []).filter(q => q && q.id && q.l && q.q && q.x);
    const h = (location.hash || "").replace("#", "").toUpperCase();
    if (self.FNN && FNN.host && FNN.room === h && db) db.ref("hr/" + h + "/state").get().then(s => { const o = s.exists() && dec(s.val()); return o && o.host === FNN.pid && o.nt === FNN.n ? joinRoom(h, FNN.name) : createRoom(FNN.name); }).catch(() => renderForm("join", h, "ما قدرت أتصل. تأكد من النت."));
    else if (/^[A-Z]{4}$/.test(h)) {
      if (ME && ME.code === h && ME.name && db) joinRoom(h, ME.name).catch(() => renderForm("join", h, "ما لقيت غرفة بهالرمز."));
      else renderForm("join", h);
    } else if (ME && ME.code && db) backToRoom();
    else goHome();
  }).catch(() => { app.innerHTML = `<div class="card"><p class="big-msg">ما قدرت أحمّل الأسئلة. حدّث الصفحة.</p></div>`; });
  self.HR = { answerOf, pickQ, get QS() { return QS; }, get S() { return S; }, get P() { return P; }, get ME() { return ME; } };
})();
