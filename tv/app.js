/* شاشة العرض — a read-only big screen for any Friday Night room.
   Type the room code: 4 letters → برا السالفة (bs/) or صدق ولا كذب (sq/); 2 letters + 3 digits → سين جيم
   (opened on its own display screen). The TV only reads; phones keep playing as usual. */
(function () {
  "use strict";
  const app = document.getElementById("app"), chip = document.getElementById("hdrChip"), newBtn = document.getElementById("newBtn");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const dec = v => { try { return v && typeof v.j === "string" ? JSON.parse(v.j) : null; } catch (e) { return null; } };
  const CFG = self.FIREBASE_CONFIG; let db = null;
  try { if (CFG && CFG.databaseURL && self.firebase) { firebase.initializeApp(CFG); db = firebase.database(); } } catch (e) { console.error(e); }
  const base = location.origin + location.pathname.replace(/tv\/?(index\.html)?$/, "");
  let game = null, code = "", S = null, P = {}, CATS = [], MFCATS = [], subs = [], stepStart = 0, lastStep = "", tick = null;
  // 4-letter room codes: one entry per game (db path → folder + label)
  const GAMES = {
    sq: { dir: "sedq/", label: "🤥 صدق ولا كذب" },
    bs: { dir: "outside/", label: "🤫 برا السالفة" },
    mf: { dir: "mf/", label: "👀 مين فينا؟" },
    draw: { dir: "draw/", label: "🎨 ارسم وخمّن" },
    df: { dir: "dafour/", label: "🤓 الدافور" },
  };
  let STROKES = {}, board = null, frame = "";
  // سهرة كاملة: the TV follows the night from game to game
  let NIGHT = null, NS = null, nsub = null;
  const NGAME = { outside: "bs", sedq: "sq", mf: "mf", draw: "draw", dafour: "df" };
  const NNAME = { seenjeem: "🎬 سين جيم", outside: "🤫 برا السالفة", sedq: "🤥 صدق ولا كذب", mf: "👀 مين فينا؟", draw: "🎨 ارسم وخمّن", dafour: "🤓 الدافور" };

  function qrImg(text) { try { const d = document.createElement("div"); new QRCode(d, { text, width: 260, height: 260, colorDark: "#2b1745", colorLight: "#ffffff" }); const c = d.querySelector("canvas"); return c ? `<img class="qr" src="${c.toDataURL()}" alt="">` : ""; } catch (e) { return ""; } }
  function sideHTML() {
    const join = NIGHT ? base + "night/#" + NIGHT : base + GAMES[game].dir + "#" + code;
    return `<aside class="card side center"><span class="lbl">${NIGHT ? "🌙 رمز السهرة" : "ادخلوا من جوالاتكم"}</span><div class="code">${esc(NIGHT || code)}</div>${qrImg(join)}<p class="note" dir="ltr">${esc(join.replace(/^https?:\/\//, "").replace(/#.*/, ""))}</p></aside>`;
  }
  const nameOf = id => (P[id] && P[id].name) || (S && S.names && S.names[id]) || "؟";
  const plist = (ids, doneFn) => `<ul class="plist bigplist">${ids.map(id => `<li class="${doneFn && doneFn(id) ? "done" : ""}">${esc(nameOf(id))}</li>`).join("")}</ul>`;
  const scoreTable = (deltas) => { const ids = Object.keys(S.scores || {}).sort((a, b) => (S.scores[b] || 0) - (S.scores[a] || 0)); return `<table><thead><tr><th>اللاعب</th>${deltas ? `<th class="n">هالجولة</th>` : ""}<th class="n">النقاط</th></tr></thead><tbody>${ids.map(id => `<tr><td>${esc(nameOf(id))}</td>${deltas ? `<td class="n ${deltas[id] ? "plus" : ""}">${deltas[id] ? "+" + deltas[id] : "0"}</td>` : ""}<td class="n">${S.scores[id] || 0}</td></tr>`).join("")}</tbody></table>`; };
  const timer = sec => { clearInterval(tick); const upd = () => { const b = document.getElementById("tb"); if (!b) return; const left = Math.max(0, sec * 1000 - (Date.now() - stepStart)); b.style.width = (left / (sec * 1000) * 100) + "%"; const n = document.getElementById("tvsecs"); if (n) n.textContent = Math.ceil(left / 1000); const h = document.getElementById("tvhint"); if (h && S && S.hint) { const x = hintHTML(S.hint); if (h.innerHTML !== x) h.innerHTML = x; } }; upd(); tick = setInterval(upd, 300); return `<div class="tbar"><i id="tb" style="width:100%"></i></div>`; };
  const lobbyIds = () => Object.keys(P).sort((a, b) => (P[a].at || 0) - (P[b].at || 0));

  /* ---------- صدق ولا كذب ---------- */
  function renderSQ() {
    const cat = S.q && CATS.find(c => c.id === S.q.cat);
    const head = S.q ? `<p class="tvsub">الجولة ${S.idx + 1} من ${S.total} · ${cat ? esc(cat.emoji + " " + cat.name) : ""}</p>` : "";
    const img = S.q && S.q.img ? `<img class="tvimg" src="${esc(S.q.img)}" alt="" onerror="this.remove()">` : "";
    const q = S.q ? `<p class="tvq">${esc(S.q.text)}</p>` : "";
    const order = S.order || [];
    if (S.phase === "lobby") return `<div class="card"><p class="tvtitle">🤥 صدق ولا كذب</p><p class="tvsub">اللاعبين (${lobbyIds().length}) · ننتظر صاحب الغرفة يبدأ</p>${plist(lobbyIds())}</div>`;
    if (S.phase === "write") return `<div class="card">${head}${img}${q}${timer(60)}<p class="tvsub">✍️ كل واحد يكتب كذبة من جواله…</p>${plist(order, id => { const x = P[id] && P[id].lie; return x && x.q === S.q.id && !(S.redo || []).includes(id + ":" + x.n); })}</div>`;
    if (S.phase === "pick") return `<div class="card">${head}${img}${q}${timer(30)}<div class="tvopts">${(S.opts || []).map(o => `<div>${esc(o.text)}</div>`).join("")}</div><p class="tvsub mt">👆 اختاروا الجواب الصحيح من جوالاتكم</p>${plist(order, id => P[id] && P[id].pick && P[id].pick.q === S.q.id)}</div>`;
    if (S.phase === "reveal") {
      const r = S.reveal;
      const opts = (S.opts || []).slice().sort((a, b) => (a.id === r.truth ? -1 : b.id === r.truth ? 1 : 0));
      return `<div class="card">${head}${img}${q}<div class="tvopts">${opts.map(o => { const own = r.owners[o.id], pk = Object.keys(r.picks).filter(p => r.picks[p] === o.id); return `<div class="${own === "truth" ? "truth" : ""}">${esc(o.text)}<small>${own === "truth" ? "✅ الجواب الصحيح" : "🤥 كذبة " + esc(own.map(nameOf).join(" و"))}${pk.length ? " · اختارها: " + esc(pk.map(nameOf).join("، ")) : ""}</small></div>`; }).join("")}</div></div>
        <div class="card"><h2>الترتيب</h2>${scoreTable(r.deltas)}</div>`;
    }
    if (S.phase === "end") { const ids = Object.keys(S.scores || {}).sort((a, b) => (S.scores[b] || 0) - (S.scores[a] || 0)); const m = ["🥇", "🥈", "🥉"]; return `<div class="card"><p class="tvtitle">النتيجة النهائية 🏆</p><div class="podium">${ids.map((id, i) => `<div><span>${m[i] || i + 1 + "."} ${esc(nameOf(id))}</span><span>${S.scores[id] || 0}</span></div>`).join("")}</div></div>`; }
    return "";
  }
  /* ---------- ارسم وخمّن ---------- */
  // the canvas stays on screen during a turn; only the text around it is refreshed
  function drawSide() {
    const order = S.order || [], ok = S.correct || {};
    const left = Math.max(0, Math.ceil(80 - (Date.now() - stepStart) / 1000));
    return `<div class="tvtop"><span class="tvsecs" id="tvsecs">${left}</span><div class="hint" id="tvhint">${hintHTML(S.hint)}</div></div><ul class="chat">${(S.chat || []).slice().reverse().slice(0, 8).map(m => `<li><b>${esc(nameOf(m.p))}:</b> ${m.c ? "🔥 قريب!" : esc(m.t)}</li>`).join("")}</ul>
      ${plist(order.filter(id => id !== S.drawer), id => ok[id])}`;
  }
  const hintHTML = h => (h || []).map(c => c === " " ? `<i class="sp"></i>` : `<i>${esc(c)}</i>`).join("");
  function renderDraw() {
    const head = S.drawer ? `<p class="tvsub">الدور ${S.turn + 1} من ${S.total} · ✏️ الرسّام: <b>${esc(nameOf(S.drawer))}</b></p>` : "";
    if (S.phase === "lobby") return `<div class="card"><p class="tvtitle">🎨 ارسم وخمّن</p><p class="tvsub">اللاعبين (${lobbyIds().length}) · ننتظر صاحب الغرفة يبدأ</p>${plist(lobbyIds())}</div>`;
    if (S.phase === "choose") return `<div class="card">${head}<p class="tvtitle">✏️ ${esc(nameOf(S.drawer))} يختار كلمة…</p></div><div class="card"><h2>الترتيب</h2>${scoreTable()}</div>`;
    if (S.phase === "draw") return `<div class="card">${head}${timer(80)}<div id="tvside">${drawSide()}</div><canvas id="tvcv" class="board"></canvas></div>`;
    if (S.phase === "reveal") { const d = Object.assign({}, S.correct || {}); d[S.drawer] = (d[S.drawer] || 0) + (S.dpts || 0); return `<div class="card">${head}<p class="tvtitle">الكلمة كانت <span class="word">${esc(S.word || "")}</span></p><canvas id="tvcv" class="board"></canvas></div><div class="card"><h2>الترتيب</h2>${scoreTable(d)}</div>`; }
    if (S.phase === "end") { const ids = Object.keys(S.scores || {}).sort((a, b) => (S.scores[b] || 0) - (S.scores[a] || 0)); const m = ["🥇", "🥈", "🥉"]; return `<div class="card"><p class="tvtitle">النتيجة النهائية 🏆</p><div class="podium">${ids.map((id, i) => `<div><span>${m[i] || i + 1 + "."} ${esc(nameOf(id))}</span><span>${S.scores[id] || 0}</span></div>`).join("")}</div></div>`; }
    return "";
  }
  /* ---------- مين فينا ---------- */
  function renderMF() {
    const order = S.order || [], cat = S.q && MFCATS.find(c => c.id === S.q.cat);
    const head = S.q ? `<p class="tvsub">السؤال ${S.idx + 1} من ${S.total}${cat ? " · " + esc(cat.emoji + " " + cat.name) : ""}</p>` : "";
    const q = S.q ? `<p class="tvq">${esc(S.q.text)}</p>` : "";
    if (S.phase === "lobby") return `<div class="card"><p class="tvtitle">👀 مين فينا؟</p><p class="tvsub">اللاعبين (${lobbyIds().length}) · ننتظر صاحب الغرفة يبدأ</p>${plist(lobbyIds())}</div>`;
    if (S.phase === "vote") return `<div class="card">${head}${q}${timer(30)}<p class="tvsub">🗳️ صوّتوا من جوالاتكم… التصويت سري</p>${plist(order, id => P[id] && P[id].vote && S.q && P[id].vote.q === S.q.id)}</div>`;
    if (S.phase === "reveal") { const r = S.reveal || { counts: {}, winners: [] }; return `<div class="card">${head}${q}<p class="tvtitle">${r.winners.length ? "👑 " + esc(r.winners.map(nameOf).join(" و")) : r.tie ? "تعادل كامل 🤝 ما أحد ياخذ اللقب" : "ما أحد صوّت"}</p>${bars(order, r.counts, r.winners, "win")}</div><div class="card"><h2>الترتيب</h2>${scoreTable(r.deltas)}</div>`; }
    if (S.phase === "end") { const ids = Object.keys(S.scores || {}).sort((a, b) => (S.scores[b] || 0) - (S.scores[a] || 0)); const m = ["🥇", "🥈", "🥉"]; return `<div class="card"><p class="tvtitle">الألقاب 👑</p><ul class="pairs tvpairs">${(S.titles || []).map(t => `<li>${esc(t.w.map(nameOf).join(" و"))} <i>${esc(String(t.q).replace(/^(مين فينا|من)\s+/, "").replace(/؟$/, ""))}</i></li>`).join("")}</ul></div><div class="card"><h2>النتيجة النهائية 🏆</h2><div class="podium">${ids.map((id, i) => `<div><span>${m[i] || i + 1 + "."} ${esc(nameOf(id))}</span><span>${S.scores[id] || 0}</span></div>`).join("")}</div></div>`; }
    return "";
  }
  /* ---------- الدافور ---------- */
  function renderDF() {
    const order = S.order || [], L = ["أ", "ب", "ج", "د"];
    const head = S.q ? `<p class="tvsub">السؤال ${S.idx + 1} من ${S.total}${S.q.diff ? " · " + esc(S.q.diff) : ""}</p>` : "";
    const q = S.q ? `<p class="tvq">${esc(S.q.text)}</p>` : "";
    const opts = r => `<div class="dfopts">${(S.q.opts || []).map((t, i) => { const who = r ? Object.keys(r.picks || {}).filter(id => r.picks[id] === i) : []; return `<div class="${r ? (i === r.correct ? "ok" : "dim") : ""}"><b>${L[i]}</b><span>${esc(t)}</span>${who.length ? `<small>${who.map(nameOf).map(esc).join("، ")}</small>` : ""}</div>`; }).join("")}</div>`;
    if (S.phase === "lobby") return `<div class="card"><p class="tvtitle">🤓 الدافور</p><p class="tvsub">اللاعبين (${lobbyIds().length}) · ننتظر صاحب الغرفة يبدأ</p>${plist(lobbyIds())}</div>`;
    if (S.phase === "q") return `<div class="card">${head}${q}${timer(20)}${opts(null)}${plist(order, id => P[id] && P[id].ans && S.q && P[id].ans.q === S.q.id)}</div>`;
    if (S.phase === "reveal") { const r = S.reveal || {}; return `<div class="card">${head}${q}${opts(r)}${r.fastest ? `<p class="tvsub">⚡ أسرع جواب صح: ${esc(nameOf(r.fastest))}</p>` : `<p class="tvsub">ما أحد جاوب صح 😅</p>`}${r.note ? `<p class="tvsub">💡 ${esc(r.note)}</p>` : ""}</div><div class="card"><h2>الترتيب</h2>${scoreTable(r.deltas)}</div>`; }
    if (S.phase === "end") { const ids = Object.keys(S.scores || {}).sort((a, b) => (S.scores[b] || 0) - (S.scores[a] || 0)); const m = ["🥇", "🥈", "🥉"]; return `<div class="card"><p class="tvtitle">دافور الشلة 🤓: ${esc(ids.length ? nameOf(ids[0]) : "")}</p></div><div class="card"><h2>النتيجة النهائية 🏆</h2><div class="podium">${ids.map((id, i) => `<div><span>${m[i] || i + 1 + "."} ${esc(nameOf(id))}</span><span>${S.scores[id] || 0}</span></div>`).join("")}</div></div>`; }
    return "";
  }
  /* ---------- برا السالفة ---------- */
  function renderBS() {
    const order = S.order || [], spy = S.catInfo && S.catInfo.mode === "spy";
    const outName = spy ? "الجاسوس" : "اللي برا السالفة";
    if (S.phase === "lobby") return `<div class="card"><p class="tvtitle">🤫 برا السالفة</p><p class="tvsub">اللاعبين (${lobbyIds().length}) · ننتظر صاحب الغرفة يبدأ</p>${plist(lobbyIds())}</div>`;
    const cat = S.catInfo ? `<p class="tvsub">الجولة ${S.round} · ${esc(S.catInfo.emoji + " " + S.catInfo.name)}</p>` : "";
    if (S.phase === "roles") return `<div class="card">${cat}<p class="tvtitle">👀 كل واحد يشوف دوره في جواله</p>${plist(order, id => P[id] && P[id].seen === S.round)}</div>`;
    if (S.phase === "ask") return `<div class="card">${cat}<p class="tvtitle">🗣️ جولة الأسئلة</p><ul class="pairs tvpairs">${(S.pairs || []).map(([a, b]) => `<li>${esc(nameOf(a))} <i>يسأل</i> ${esc(nameOf(b))}</li>`).join("")}</ul></div>`;
    if (S.phase === "vote") return `<div class="card">${cat}<p class="tvtitle">🗳️ مين ${spy ? "الجاسوس" : "برا السالفة"}؟</p><p class="tvsub">صوّتوا من جوالاتكم</p>${plist(order, id => P[id] && P[id].vote && P[id].vote.r === S.round)}</div>`;
    if (S.phase === "reveal") { const rv = S.reveal || { counts: {}, outs: [] }; return `<div class="card">${cat}<p class="tvtitle">${outName}: ${rv.outs.map(o => esc(nameOf(o))).join(" و")} ${spy ? "🕵️" : "🤫"}</p>${bars(order, rv.counts, rv.outs)}<p class="tvsub mt">🤔 يحاول يخمّن ${spy ? "المكان" : "الكلمة"}…</p></div>`; }
    if (S.phase === "results") { const r = S.results || {}; return `<div class="card">${cat}<p class="tvtitle">${spy ? "المكان كان" : "الكلمة كانت"} <span class="word">${esc(r.word)}</span></p>${r.spyWord ? `<p class="tvsub">و${spy ? "الجاسوس" : "اللي برا السالفة"} كان طالع له: ${esc(r.spyWord)}</p>` : ""}${bars(order, r.counts || {}, r.outs || [])}</div><div class="card"><h2>النقاط</h2>${scoreTable(r.deltas)}</div>`; }
    return "";
  }
  function bars(order, counts, outs, cls) { const max = Math.max(1, ...order.map(id => counts[id] || 0)); return `<div class="bars">${order.slice().sort((a, b) => (counts[b] || 0) - (counts[a] || 0)).map(id => `<div class="bar ${outs.includes(id) ? cls || "out" : ""}"><span>${esc(nameOf(id))}</span><span class="tr"><i style="width:${((counts[id] || 0) / max) * 100}%"></i></span><span>${counts[id] || 0}</span></div>`).join("")}</div>`; }

  function render() {
    if (!game) return;
    if (!S) { app.innerHTML = `<div class="card center"><p class="big-msg">الغرفة انقفلت أو ما بدأت.</p></div>`; return; }
    const key = S.phase + ":" + (S.q ? S.q.id : S.tid || S.round || "");
    if (key !== lastStep) {
      lastStep = key;
      // ارسم وخمّن: follow the host's clock (t0) so a TV opened mid-turn shows the real time left
      const ago = S.t0 ? Date.now() - S.t0 : NaN;
      stepStart = game === "draw" && ago > -15000 && ago < 120000 ? Math.min(Date.now(), S.t0) : Date.now();
    }
    if (game === "draw" && S.phase === "draw" && frame === key && document.getElementById("tvcv")) { document.getElementById("tvside").innerHTML = drawSide(); return; }
    const bg = game === "bs" && S.catInfo && S.catInfo.image && S.phase !== "lobby" ? "../outside/" + S.catInfo.image : null;
    document.body.classList.toggle("catbg", !!bg); document.body.style.setProperty("--catbg", bg ? `url("${bg}")` : "none");
    const main = game === "sq" ? renderSQ() : game === "mf" ? renderMF() : game === "draw" ? renderDraw() : game === "df" ? renderDF() : renderBS();
    app.innerHTML = `<div class="tvgrid"><div>${main}</div>${sideHTML()}</div>`;
    frame = key; board = null;
    moments();
    const cv = document.getElementById("tvcv");
    if (cv && self.DrawBoard) { board = DrawBoard.Board(cv); board.set(DrawBoard.parse(STROKES, dec)); }
  }
  // big moments on the TV (fnanim.js), once each
  function moments() {
    if (!self.FA || !S) return;
    const k = game + "-" + code + "-", names = ids => ids.map(nameOf).join(" و");
    const top = () => { const ids = Object.keys(S.scores || {}).sort((a, b) => (S.scores[b] || 0) - (S.scores[a] || 0)); if (ids.length) FA.winner(nameOf(ids[0]), ids.map(id => [nameOf(id), S.scores[id] || 0])); };
    if (game === "bs" && S.phase === "reveal" && S.reveal) FA.once(k + "rv" + S.round, () => FA.reveal((S.catInfo && S.catInfo.mode === "spy" ? "الجاسوس: " : "اللي برا السالفة: ") + names(S.reveal.outs || []), null, "#f03e7a"));
    if (game === "bs" && S.phase === "results") FA.once(k + "res" + S.round, () => { FA.play("party"); FA.confetti(); });
    if (game === "sq" && S.phase === "reveal" && S.reveal && S.q) FA.once(k + "rv" + S.q.id, () => { const t = (S.opts || []).find(o => o.id === S.reveal.truth); FA.play("reveal", 0); FA.slam("الجواب الصحيح: " + (t ? t.text : ""), null, "#12a874"); });
    if (game === "mf" && S.phase === "reveal" && S.reveal && S.q) FA.once(k + "rv" + S.q.id, () => { if (S.reveal.winners && S.reveal.winners.length) { FA.play("party"); FA.confetti(); FA.slam("👑 " + names(S.reveal.winners), null, "#ffb21e"); } });
    if (game === "df" && S.phase === "reveal" && S.reveal && S.q) FA.once(k + "rv" + S.q.id, () => { FA.play("reveal"); FA.slam("الجواب: " + ((S.q.opts || [])[S.reveal.correct] || ""), null, "#12a874"); });
    if (game === "draw" && S.phase === "reveal") FA.once(k + "rv" + S.tid, () => { FA.play("reveal"); FA.slam("الكلمة كانت: " + (S.word || ""), null, "#ff7a1a"); });
    if (S.phase === "end" && game !== "bs") FA.once(k + "end" + (S.game || ""), top);
  }
  function stopGame() { subs.forEach(f => f()); subs = []; game = null; S = null; clearInterval(tick); lastStep = ""; document.body.classList.remove("catbg"); }
  function watchNight(c) {
    NIGHT = c; NS = null;
    const r = db.ref("night/" + c + "/state"), h = sn => { NS = dec(sn.val()); nightStep(); };
    r.on("value", h); nsub = () => r.off("value", h);
    history.replaceState(null, "", "#" + c);
  }
  function nightStep() {
    const cur = NS && NS.phase !== "end" && NS.cur, g = cur && NGAME[cur.g];
    if (g && cur.room) { if (game !== g || code !== cur.room) { stopGame(); watch(g, cur.room); } return; }
    stopGame(); renderNight();
  }
  const games = n => n === 1 ? "لعبة وحدة" : n === 2 ? "لعبتين" : n + (n <= 10 ? " ألعاب" : " لعبة");
  function renderNight() {
    chip.hidden = false; chip.innerHTML = `🌙 سهرة · <b dir="ltr">${esc(NIGHT)}</b>`; newBtn.hidden = false;
    if (!NS) { app.innerHTML = `<div class="card center"><p class="big-msg">السهرة انتهت أو انمسحت.</p></div>`; return; }
    // medal table: most 🥇, then 🥈, then 🥉 (same as fnnight.js)
    const names = NS.names || {}, pl = NS.played || [], M = ["🥇", "🥈", "🥉"], med = {};
    const rankOf = x => x.rank || Object.fromEntries(Object.entries(x.pts || {}).map(([id, p]) => [id, { 5: 1, 3: 2, 2: 3 }[p] || 4]));
    Object.keys(names).forEach(id => med[id] = [0, 0, 0]);
    pl.forEach(x => Object.entries(rankOf(x)).forEach(([id, r]) => { if (med[id] && r <= 3) med[id][r - 1]++; }));
    const rows = Object.keys(names).map(id => [names[id], med[id], id]).sort((a, b) => b[1][0] - a[1][0] || b[1][1] - a[1][1] || b[1][2] - a[1][2]);
    const same = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
    const last = pl.length ? rankOf(pl[pl.length - 1]) : {};
    const cnt = (v, i) => v[i] || "·";
    const table = `<table><thead><tr><th>اللاعب</th>${pl.length ? `<th class="n">آخر لعبة</th>` : ""}<th class="n">🥇</th><th class="n">🥈</th><th class="n">🥉</th></tr></thead><tbody>${rows.map(([n, v, id]) => `<tr><td>${esc(n)}</td>${pl.length ? `<td class="n ${last[id] && last[id] <= 3 ? "plus" : ""}">${last[id] && last[id] <= 3 ? M[last[id] - 1] : "·"}</td>` : ""}<td class="n">${cnt(v, 0)}</td><td class="n">${cnt(v, 1)}</td><td class="n">${cnt(v, 2)}</td></tr>`).join("")}</tbody></table>`;
    let main;
    if (NS.phase === "end") {
      const top = rows.length && rows[0][1].some(Boolean) ? rows.filter(r => same(r[1], rows[0][1])) : [];
      if (self.FA && top.length) FA.once("tvn-end-" + NIGHT + "-" + (NS.seq || 0), () => { FA.confetti(); FA.winner(top.map(r => r[0]).join(" و"), rows.map(r => [r[0], r[1].some(Boolean) ? r[1].map((k, i) => k ? M[i] + (k > 1 ? "×" + k : "") : "").filter(Boolean).join(" ") : "—"]), top.length > 1 ? "أبطال الليلة 👑" : "بطل الليلة 👑"); }, true);
      main = `<div class="card center"><p class="tvtitle" style="font-size:64px;margin:0">👑</p><p class="tvtitle">${top.length > 1 ? "أبطال الليلة" : "بطل الليلة"}: ${esc(top.map(r => r[0]).join(" و") || "—")}</p><p class="tvsub">${games(pl.length)}</p></div><div class="card">${table}</div>`;
    } else {
      if (self.FA && pl.length) FA.once("tvn-res-" + NIGHT + "-" + pl.length, () => { FA.play("party"); FA.slam("🏆 ترتيب السهرة", "بعد " + games(pl.length), "#ffb21e"); });
      const cur = NS.cur;
      const now = cur ? `<p class="tvsub">${cur.g === "seenjeem" ? (cur.room ? `🎬 سين جيم شغالة: اعرضوها من سين جيم برمز <b dir="ltr">${esc(cur.room)}</b>` : "🎬 ننتظر صاحب السهرة يفتح غرفة سين جيم…") : `ننتظر ${esc(NNAME[cur.g] || "")}…`}</p>${cur.g === "seenjeem" && cur.room ? `<button type="button" class="btn" id="tvSJ">اعرض سين جيم</button>` : ""}`
        : `<p class="tvsub">ننتظر صاحب السهرة يختار ${pl.length ? "اللعبة الجاية" : "أول لعبة"}…</p>`;
      main = `<div class="card"><p class="tvtitle">🌙 سهرة كاملة</p>${now}${pl.length ? "" : `<ul class="plist bigplist">${rows.map(r => `<li>${esc(r[0])}</li>`).join("")}</ul>`}</div>${pl.length ? `<div class="card"><p class="tvsub">🏆 ترتيب السهرة بعد ${games(pl.length)}</p>${table}</div>` : ""}`;
    }
    app.innerHTML = `<div class="tvgrid"><div>${main}</div><aside class="card side center"><span class="lbl">🌙 رمز السهرة</span><div class="code">${esc(NIGHT)}</div>${qrImg(base + "night/#" + NIGHT)}<p class="note">ادخلوا السهرة مرة وحدة، والشاشة تمشي معكم</p></aside></div>`;
    const sj = document.getElementById("tvSJ"); if (sj) sj.onclick = () => openSJ(NS.cur.room);
  }
  function watch(g, c) {
    game = g; code = c; S = null; P = {};
    chip.hidden = false; chip.innerHTML = `${GAMES[g].label} · <b dir="ltr">${esc(c)}</b>${NIGHT ? ` · 🌙 <b dir="ltr">${esc(NIGHT)}</b>` : ""}`; newBtn.hidden = false;
    const r = db.ref(g + "/" + c);
    const on = (ref, cb) => { const h = s => cb(s.val()); ref.on("value", h); subs.push(() => ref.off("value", h)); };
    on(r.child("state"), v => { S = dec(v); render(); });
    on(r.child("players"), v => { P = {}; Object.entries(v || {}).forEach(([k, x]) => { const d = dec(x); if (d) P[k] = d; }); render(); });
    STROKES = {}; frame = "";
    if (g === "draw") on(r.child("strokes"), v => { STROKES = v || {}; if (board) board.set(DrawBoard.parse(STROKES, dec)); });
    if (!NIGHT) history.replaceState(null, "", "#" + c);
  }
  // سين جيم: open its own display screen
  function openSJ(c) {
    try { localStorage.setItem("seenjeem-remote-v1", JSON.stringify({ code: c, name: "", role: "display", team: null })); } catch (e) {}
    location.href = base + "seenjeem/#" + c;
  }
  async function connect(c, msgEl) {
    c = c.trim().toUpperCase();
    if (/^[A-Z]{2}[0-9]{3}$/.test(c)) { openSJ(c); return; }   // old سين جيم codes
    if (!/^[A-Z]{4}$/.test(c)) { msgEl.textContent = "اكتب رمز الغرفة: 4 حروف."; return; }
    if (!db) { msgEl.textContent = "ما قدرت أتصل. حدّث الصفحة."; return; }
    msgEl.textContent = "يدوّر على الغرفة…";
    try {
      // the same code can exist in more than one game: show the newest room
      // a سهرة with this code: the TV follows it from game to game
      const ns = await db.ref("night/" + c + "/state").get().catch(() => null);
      if (ns && ns.exists()) { watchNight(c); return; }
      const keys = Object.keys(GAMES).concat("rooms"), snaps = await Promise.all(keys.map(g => db.ref(g === "rooms" ? "rooms/" + c : g + "/" + c + "/state").get().catch(() => null)));
      let best = null, bt = 0;
      snaps.forEach((sn, i) => { if (sn && sn.exists()) { const v = sn.val() || {}, t = (dec(v) || {}).at || v.t || 1; if (t > bt) { bt = t; best = keys[i]; } } });
      if (!best) { msgEl.textContent = "ما لقيت غرفة بهالرمز."; return; }
      if (best === "rooms") { openSJ(c); return; }
      watch(best, c);
    } catch (e) { msgEl.textContent = "ما قدرت أتصل. تأكد من النت."; }
  }
  function home(msg) {
    subs.forEach(f => f()); subs = []; game = null; clearInterval(tick); chip.hidden = true; newBtn.hidden = true;
    if (nsub) nsub(); nsub = null; NIGHT = null; NS = null;
    document.body.classList.remove("catbg");
    history.replaceState(null, "", location.pathname);
    app.innerHTML = `<div class="card joinbox center"><p class="tvtitle">📺 الشاشة تعرض، والجوالات تلعب</p>
      <p class="note">افتحوا غرفة من الجوال في أي لعبة، واكتبوا رمزها هنا.</p>
      <input id="tvCode" class="inp codein" maxlength="5" autocomplete="off" placeholder="ABCD">
      <button type="button" class="btn" id="tvGo">اعرض الغرفة</button><p class="err" id="tvMsg">${esc(msg || "")}</p>
      <p class="note">تشتغل مع: 🎬 سين جيم · ${Object.values(GAMES).map(g => g.label).join(" · ")} · 🌙 السهرة الكاملة</p></div>`;
    const inp = document.getElementById("tvCode"), go = () => connect(inp.value, document.getElementById("tvMsg"));
    document.getElementById("tvGo").onclick = go; inp.onkeydown = e => { if (e.key === "Enter") go(); }; inp.focus();
  }
  newBtn.onclick = () => home();
  // ⛶ full screen (the TV browser's own bars go away); also the F key
  const fsBtn = document.getElementById("fsBtn"), D = document, E = D.documentElement;
  const fsOn = () => !!(D.fullscreenElement || D.webkitFullscreenElement);
  const fsCan = !!(E.requestFullscreen || E.webkitRequestFullscreen);
  function fsToggle() {
    try {
      if (fsOn()) (D.exitFullscreen || D.webkitExitFullscreen).call(D);
      else { const p = (E.requestFullscreen || E.webkitRequestFullscreen).call(E); if (p && p.catch) p.catch(() => {}); }
    } catch (e) {}
  }
  function fsShow() { const on = fsOn(); D.body.classList.toggle("fs", on); fsBtn.textContent = on ? "✕ اطلع من الشاشة الكاملة" : "⛶ شاشة كاملة"; }
  if (fsBtn && fsCan) {
    fsBtn.hidden = false; fsBtn.onclick = fsToggle;
    D.addEventListener("fullscreenchange", fsShow); D.addEventListener("webkitfullscreenchange", fsShow);
    D.addEventListener("keydown", e => { if ((e.key === "f" || e.key === "F") && !/INPUT|TEXTAREA/.test((e.target.tagName || ""))) fsToggle(); });
  }
  fetch("../sedq/questions.json").then(r => r.json()).then(d => { CATS = d.categories; render(); }).catch(() => {});
  fetch("../mf/questions.json").then(r => r.json()).then(d => { MFCATS = d.categories; render(); }).catch(() => {});
  const h = (location.hash || "").replace("#", "");
  home(); if (h) connect(h, document.getElementById("tvMsg"));
})();
