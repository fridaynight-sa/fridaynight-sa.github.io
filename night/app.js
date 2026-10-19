/* سهرة كاملة — one code for the whole night (see ../fnnight.js for the shared parts).
   The night's host picks the next game; everybody's phone moves to it; after each game every player
   gets night points by their place (5 / 3 / 2 / 1). At the end: «بطل الليلة 👑». */
(function () {
  "use strict";
  const F = self.FNIGHT, { GAMES, ORDER, LS, enc, dec, esc } = F;
  const app = document.getElementById("app");
  const chip = document.getElementById("hdrChip");
  const rnd = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
  const rid = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, "0")).join("");
  const genCode = () => { const L = "ABCDEFGHJKLMNPQRSTUVWXYZ"; return Array.from({ length: 4 }, () => L[Math.floor(rnd() * L.length)]).join(""); };
  const db = F.db();
  let ME = LS.get(F.LSK, null);                    // {code, nid, name}
  let S = null, P = {}, subs = [], view = "home", goT = null, goKey = null, MEM = null, endArm = null;
  const isHost = () => S && ME && S.host === ME.nid;
  const ref = p => db.ref("night/" + ME.code + (p ? "/" + p : ""));
  const writeState = patch => { S = Object.assign({}, S, patch); return ref("state").set(enc(S)); };
  const nameOf = id => (S && S.names && S.names[id]) || (P[id] && P[id].name) || "؟";
  const joinURL = c => location.origin + location.pathname + "#" + c;
  const icon = g => `../icons/${GAMES[g].icon}.png`;
  const gameURL = (g, room, host) => `../${g}/?night=${ME.code}${host ? "&h=1" : ""}${room ? "#" + room : ""}`;
  const games = n => n === 1 ? "لعبة وحدة" : n === 2 ? "لعبتين" : n + (n <= 10 ? " ألعاب" : " لعبة");
  const pids = () => Object.keys(P).sort((a, b) => (P[a].at || 0) - (P[b].at || 0));

  function unsubscribe() { subs.forEach(f => f()); subs = []; }
  function subscribe() {
    unsubscribe();
    const on = (r, cb) => { const h = s => cb(s.val()); r.on("value", h); subs.push(() => r.off("value", h)); };
    on(ref("state"), v => { S = dec(v); render(); });
    on(ref("players"), v => { P = {}; Object.entries(v || {}).forEach(([k, x]) => { const d = dec(x); if (d) P[k] = d; }); syncNames(); render(); });
  }
  // the host keeps the list of names in the night state (games and scores use it)
  function syncNames() {
    if (!isHost() || !S) return;
    const names = Object.assign({}, S.names); let ch = false;
    pids().forEach(id => { if (names[id] !== P[id].name) { names[id] = P[id].name; ch = true; } });
    if (ch) writeState({ names }).catch(() => {});
  }
  async function createNight(name) {
    let code = genCode();
    for (let i = 0; i < 6; i++) { const s = await db.ref("night/" + code + "/state").get(); if (!s.exists()) break; code = genCode(); }
    ME = { code, nid: "n" + rid(8), name }; LS.set(F.LSK, ME);
    S = { v: 1, host: ME.nid, phase: "lobby", cur: null, pending: null, played: [], totals: {}, names: { [ME.nid]: name }, at: Date.now() };
    await ref("state").set(enc(S));
    await ref("players/" + ME.nid).set(enc({ name, at: Date.now() }));
    enter(code);
  }
  async function joinNight(code, name) {
    const s = await db.ref("night/" + code + "/state").get();
    if (!s.exists()) throw new Error("nocode");
    const st = dec(s.val()) || {};
    const same = ME && ME.code === code ? ME.nid : null;
    const taken = Object.entries(st.names || {}).find(([id, n]) => id !== same && F.sameName(n, name));
    if (taken) throw new Error("taken");
    ME = { code, nid: same || "n" + rid(8), name }; LS.set(F.LSK, ME);
    const cur = dec((await db.ref("night/" + code + "/players/" + ME.nid).get()).val()) || {};
    await db.ref("night/" + code + "/players/" + ME.nid).set(enc({ name, at: cur.at || Date.now() }));
    S = st; enter(code);
  }
  function enter(code) { view = "room"; history.replaceState(null, "", "#" + code); subscribe(); render(); }
  function leave() { unsubscribe(); clearGo(); if (ME) { ME.code = null; LS.set(F.LSK, ME); } S = null; P = {}; history.replaceState(null, "", location.pathname); goHome(); }

  /* ---------------- host ---------------- */
  async function pickGame(g) {
    const G = GAMES[g];
    let room = null;
    if (G.path) {
      room = genCode();
      for (let i = 0; i < 6; i++) { const s = await db.ref(G.path + "/" + room + "/state").get(); if (!s.exists()) break; room = genCode(); }
    }
    await writeState({ cur: { g, room, n: (S.played || []).length + 1, at: Date.now() }, pending: null });
    location.href = gameURL(g, room, true);
  }

  /* ---------------- views ---------------- */
  function rankHTML(withDelta) {
    const last = withDelta && (S.played || []).length ? S.played[S.played.length - 1].pts : null;
    const rows = F.ranking(S);
    if (!rows.length) return "";
    const medal = ["🥇", "🥈", "🥉"];
    const at = t => rows.filter(r => r[2] > t).length;   // equal points share the place
    return `<div class="nrank">${rows.map(([id, n, t]) => `<div><span>${medal[at(t)] && t ? medal[at(t)] : (at(t) + 1) + "."} ${esc(n)}${id === ME.nid ? " (أنت)" : ""}</span><span><b>${t}</b>${last && last[id] ? `<em>+${last[id]}</em>` : ""}</span></div>`).join("")}</div>`;
  }
  function progHTML() {
    const pl = S.played || [];
    return pl.length ? `<div class="nprog" aria-label="الألعاب اللي لعبناها">${pl.map(x => `<img src="${icon(x.g)}" alt="${esc(GAMES[x.g].name)}" title="${esc(GAMES[x.g].name)}">`).join("")}</div>` : "";
  }
  function clearGo() { clearInterval(goT); goT = null; goKey = null; }
  function render() {
    if (view !== "room") return;
    if (!S) { app.innerHTML = `<div class="card center"><p class="big-msg">جاري الاتصال…</p></div>`; return; }
    chip.hidden = false; chip.innerHTML = `السهرة <b dir="ltr">${esc(ME.code)}</b> · ${esc(ME.name)}${isHost() ? " 👑" : ""}`;
    if (!P[ME.nid] && Object.keys(P).length) { app.innerHTML = `<div class="card center"><p class="big-msg">انشلت من السهرة</p><button type="button" class="btn alt mt" data-act="leave">رجوع</button></div>`; return; }
    const host = nameOf(S.host);
    const leaveB = `<button type="button" class="btn alt mt" data-act="leave">اطلع من السهرة</button>`;
    const pl = S.played || [];
    if (pl.length && self.FA) FA.once("nt-res-" + ME.code + "-" + pl.length, () => { if (S.phase !== "end") { FA.play("party", [40, 40]); FA.slam("🏆 ترتيب السهرة", "بعد " + games(pl.length), "#ffb21e"); } });

    /* end: champion of the night */
    if (S.phase === "end") {
      clearGo();
      const rows = F.ranking(S), top = rows.length ? rows.filter(r => r[2] === rows[0][2] && r[2] > 0) : [];
      if (self.FA) FA.once("nt-end-" + ME.code + "-" + (S.at || 0) + "-" + pl.length, () => { if (top.length) { FA.confetti(); FA.winner(top.map(r => r[1]).join(" و"), rows.map(r => [r[1], r[2]]), top.length > 1 ? "أبطال الليلة 👑" : "بطل الليلة 👑"); } });
      const wins = id => pl.filter(x => { const m = Math.max(...Object.values(x.pts)); return x.pts[id] === m; }).length;
      app.innerHTML = `<div class="card center"><div class="crown">👑</div><p class="big-msg" style="margin:0">${top.length > 1 ? "أبطال الليلة" : "بطل الليلة"}</p>
          ${top.length ? `<div class="champ">${esc(top.map(r => r[1]).join(" و"))}</div><p class="note">${top[0][2]} نقطة من ${games(pl.length)}${top.length === 1 && wins(top[0][0]) ? " · أول في " + wins(top[0][0]) : ""}</p>` : `<p class="note">ما لعبتوا ولا لعبة 😅</p>`}
          ${progHTML()}</div>
        <div class="card"><h2>ترتيب السهرة</h2>${rankHTML(false)}</div>
        ${isHost() ? `<div class="card"><button type="button" class="btn" data-act="again">سهرة جديدة بنفس الشلة</button></div>` : ""}${leaveB}`;
      return;
    }

    /* a game is on: move everyone there */
    if (S.cur) {
      const G = GAMES[S.cur.g], key = S.cur.g + ":" + (S.cur.room || "") + ":" + S.cur.n;
      if (isHost()) {
        clearGo();
        app.innerHTML = `<div class="card ngo" style="--c:${G.color}"><p class="note">اللعبة الحالية</p><img src="${icon(S.cur.g)}" alt=""><p class="big-msg">${esc(G.name)}</p>
          <a class="btn" href="${esc(gameURL(S.cur.g, S.cur.room, true))}">ارجع للعبة</a><button type="button" class="btn alt mt" data-act="cancel">ألغها واختار لعبة ثانية</button></div>`;
        return;
      }
      if (!S.cur.room) {
        clearGo();
        app.innerHTML = `<div class="card ngo" style="--c:${G.color}"><p class="note">👑 ${esc(host)} اختار</p><img src="${icon(S.cur.g)}" alt=""><p class="big-msg">${esc(G.name)}</p><p class="note">ننتظره يفتح الغرفة… وتنتقل تلقائي</p></div>`;
        return;
      }
      if (goKey !== key) {
        clearGo(); goKey = key;
        const go = gameURL(S.cur.g, S.cur.room, false);
        let left = 3, ready = !G.path;
        const tick = async () => {
          if (!ready) { try { ready = (await db.ref(G.path + "/" + S.cur.room + "/state").get()).exists(); } catch (e) {} if (!ready) return; }
          const r = document.getElementById("ring"); if (r) r.textContent = left;
          if (left-- <= 0) { clearGo(); location.href = go; }
        };
        app.innerHTML = `<div class="card ngo" style="--c:${G.color}"><p class="note">👑 ${esc(host)} اختار</p><img src="${icon(S.cur.g)}" alt=""><p class="big-msg">${esc(G.name)}</p><div class="ring" id="ring">…</div><p class="note">ننقلك تلقائي… لا تسوي شي</p><a class="ghost mt" href="${esc(go)}">ادخل الحين</a></div>`;
        if (self.FA) FA.play("whoosh");
        goT = setInterval(tick, 1000); tick();
      }
      return;
    }
    clearGo();

    /* سين جيم result waiting for the host to check the teams */
    if (S.pending) {
      if (!isHost()) { app.innerHTML = `<div class="card center"><img src="${icon(S.pending.g)}" alt="" style="width:90px"><p class="big-msg">👑 ${esc(host)} يحسب نقاط ${esc(GAMES[S.pending.g].name)}…</p></div>`; return; }
      const T = S.pending.teams || [];
      if (!MEM || MEM.key !== S.pending.room) MEM = { key: S.pending.room, m: Object.assign({}, S.pending.members) };
      const tname = t => t >= 0 && T[t] ? T[t].name : "ما لعب";
      app.innerHTML = `<div class="card"><h2>🎬 نقاط سين جيم</h2><p class="note">${T.map(t => `<b>${esc(t.name)}</b>: ${t.score}`).join(" · ") || "ما فيه فرق"}</p>
          <p class="note">مين كان في أي فريق؟ اضغط على الاسم عشان تغيّر فريقه.</p>
          <div class="tmem">${Object.keys(S.names || {}).map(id => { const t = MEM.m[id] ?? -1; return `<button type="button" data-mem="${id}" class="t${t}"><span>${esc(nameOf(id))}</span><span>${esc(tname(t))}</span></button>`; }).join("")}</div>
          <button type="button" class="btn mt" data-act="sjok">✅ احسب النقاط</button><button type="button" class="btn alt mt" data-act="sjskip">بدون نقاط</button></div>`;
      return;
    }

    /* lobby */
    const ids = pids();
    let qr = "";
    try { if (typeof QRCode !== "undefined") { const d = document.createElement("div"); new QRCode(d, { text: joinURL(ME.code), width: 220, height: 220, colorDark: "#2b1745", colorLight: "#ffffff" }); const c = d.querySelector("canvas"); qr = c ? c.toDataURL() : ""; } } catch (e) {}
    const count = g => pl.filter(x => x.g === g).length;
    const codeCard = `<div class="card center"><span class="lbl">رمز السهرة — واحد لكل الليلة</span><div class="code">${esc(ME.code)}</div>${qr && !pl.length ? `<img class="qr" src="${qr}" alt="باركود الدخول">` : ""}
        <p class="note">الكل يدخل مرة وحدة بس، وبعدها ينتقلون مع كل لعبة تلقائي.</p><button type="button" class="ghost mt" data-act="copy">انسخ رابط الدخول</button></div>`;
    const players = `<div class="card"><h2>اللاعبين (${ids.length})</h2><ul class="plist">${ids.map(id => `<li class="${id === ME.nid ? "me" : ""}">${esc(P[id].name)}${id === S.host ? " 👑" : ""}${isHost() && id !== ME.nid ? ` <button type="button" data-kick="${id}" aria-label="شيل">✕</button>` : ""}</li>`).join("")}</ul></div>`;
    const rank = pl.length ? `<div class="card"><h2>🏆 ترتيب السهرة بعد ${games(pl.length)}</h2>${progHTML()}${rankHTML(true)}<p class="note center">الأول في كل لعبة ياخذ ٥، الثاني ٣، الثالث ٢، والباقي ١</p></div>` : "";
    if (isHost()) {
      app.innerHTML = `${pl.length ? rank : codeCard}
        <div class="card"><h2>${pl.length ? "وش اللعبة الجاية؟" : "🎮 اختار أول لعبة"}</h2><p class="note">تختار، والكل ينتقل معك.</p>
          <div class="ngames">${ORDER.map(g => `<button type="button" data-game="${g}" style="--c:${GAMES[g].color}">${count(g) ? `<span class="n">✓ ${count(g) > 1 ? count(g) + "×" : "لعبناها"}</span>` : ""}<img src="${icon(g)}" alt="">${esc(GAMES[g].name)}</button>`).join("")}
          ${pl.length ? `<button type="button" class="fin" data-act="end">🏁 خلصنا السهرة</button>` : ""}</div></div>
        ${players}${pl.length ? codeCard : ""}${leaveB}`;
    } else {
      app.innerHTML = `${rank}<div class="card center"><p class="big-msg">ننتظر 👑 ${esc(host)} يختار ${pl.length ? "اللعبة الجاية" : "أول لعبة"}…</p><p class="note">لا تسكّر الصفحة، تنتقل تلقائي.</p></div>${pl.length ? "" : codeCard}${players}${leaveB}`;
    }
  }
  async function roomClick(b) {
    const a = b.dataset.act;
    try {
      if (a === "copy") { try { await navigator.clipboard.writeText(joinURL(ME.code)); b.textContent = "انتسخ ✓"; } catch (e) { b.textContent = joinURL(ME.code); } return; }
      if (a === "leave") { leave(); return; }
      if (!isHost()) return;
      if (b.dataset.game) { app.querySelectorAll("button").forEach(x => x.disabled = true); await pickGame(b.dataset.game); return; }
      if (b.dataset.kick) { const id = b.dataset.kick; const names = Object.assign({}, S.names); delete names[id]; await ref("players/" + id).remove(); await writeState({ names }); return; }
      if (b.dataset.mem) { const T = (S.pending.teams || []).length, id = b.dataset.mem; const t = MEM.m[id] ?? -1; MEM.m[id] = t + 1 >= T ? -1 : t + 1; render(); return; }
      if (a === "sjok") { b.disabled = true; const p = S.pending; await ref("state").set(enc(S = F.addResult(S, p.g, F.placeTeams(p.teams, MEM.m), { room: p.room }))); MEM = null; return; }
      if (a === "sjskip") { await writeState({ pending: null }); MEM = null; return; }
      if (a === "cancel") { await writeState({ cur: null }); return; }
      if (a === "end") {
        if (!b.classList.contains("warn")) { b.classList.add("warn"); b.textContent = "اضغط مرة ثانية للتأكيد"; endArm = setTimeout(() => { b.classList.remove("warn"); b.textContent = "🏁 خلصنا السهرة"; }, 3000); return; }
        clearTimeout(endArm); await writeState({ phase: "end", cur: null }); return;
      }
      if (a === "again") { await writeState({ phase: "lobby", cur: null, pending: null, played: [], totals: {}, at: Date.now() }); return; }
    } catch (e) { console.error(e); alert("ما قدرت أتصل. تأكد من النت وجرّب مرة ثانية."); }
  }

  /* ---------------- home ---------------- */
  function goHome() { view = "home"; chip.hidden = true; renderHome(); }
  function renderHome() {
    app.innerHTML = `<div class="hero"><h1>سهرة كاملة 🌙</h1><p>رمز واحد لكل الليلة، كل الألعاب، وفي الأخير بطل الليلة 👑</p></div>
      <div class="modes">
        <button type="button" class="mode" data-act="ocreate"><span class="ic">🌙</span><span><b>ابدأ سهرة</b><span>أنت تختار الألعاب، والكل ينتقل معك</span></span></button>
        <button type="button" class="mode" data-act="ojoin"><span class="ic">🔑</span><span><b>ادخل سهرة</b><span>عندك رمز من صاحب السهرة</span></span></button>
      </div>
      <div class="card mt"><h3>كيف تمشي السهرة؟</h3><ul class="note">
        <li>صاحب السهرة يفتحها، والكل يدخل بالرمز أو الباركود <b>مرة وحدة بس</b>.</li>
        <li>صاحب السهرة يختار اللعبة، وجوالات الكل تنتقل لها تلقائي.</li>
        <li>بعد كل لعبة: الأول ياخذ <b>٥</b>، الثاني <b>٣</b>، الثالث <b>٢</b>، والباقي <b>١</b>. كذا كل الألعاب لها نفس الوزن.</li>
        <li>في سين جيم كل أعضاء الفريق ياخذون نقاط فريقهم.</li>
        <li>آخر الليل: بطل الليلة 👑.</li></ul></div>`;
  }
  function renderForm(kind, code, msg) {
    const nm = (ME && ME.name) || "";
    if (!db) { app.innerHTML = `<div class="card"><h2>الأونلاين مو شغال</h2><p class="note">ما قدرت أتصل بقاعدة البيانات. حدّث الصفحة.</p><button type="button" class="btn mt" data-act="home">رجوع</button></div>`; return; }
    view = kind;
    app.innerHTML = `<div class="card"><h2>${kind === "create" ? "🌙 ابدأ سهرة" : "🔑 ادخل سهرة"}</h2>
      ${kind === "join" ? `<div class="field"><label for="fCode">رمز السهرة</label><input id="fCode" class="inp codein" maxlength="4" autocomplete="off" value="${esc(code || "")}" placeholder="ABCD"></div>` : ""}
      <div class="field"><label for="fName">اسمك</label><input id="fName" class="inp" maxlength="18" value="${esc(nm)}" placeholder="مثلاً: فيصل"></div>
      <p class="err" id="ferr">${esc(msg || "")}</p>
      <button type="button" class="btn" data-act="${kind === "create" ? "docreate" : "dojoin"}">${kind === "create" ? "ابدأ السهرة" : "دخول"}</button>
      <button type="button" class="btn alt mt" data-act="home">رجوع</button></div>`;
  }
  async function homeClick(b) {
    const a = b.dataset.act, err = m => { const e = document.getElementById("ferr"); if (e) e.textContent = m; };
    if (a === "home") { history.replaceState(null, "", location.pathname); goHome(); return; }
    if (a === "ocreate") { renderForm("create"); return; }
    if (a === "ojoin") { renderForm("join"); return; }
    if (a === "docreate" || a === "dojoin") {
      const name = document.getElementById("fName").value.trim();
      if (!name) { err("اكتب اسمك."); return; }
      b.disabled = true;
      try {
        if (a === "docreate") await createNight(name);
        else {
          const code = document.getElementById("fCode").value.trim().toUpperCase();
          if (!/^[A-Z]{4}$/.test(code)) { err("الرمز 4 حروف إنجليزية."); b.disabled = false; return; }
          await joinNight(code, name);
        }
      } catch (e) { b.disabled = false; err(e.message === "nocode" ? "ما لقيت سهرة بهالرمز." : e.message === "taken" ? "فيه أحد بنفس الاسم في السهرة، اكتب اسم ثاني." : "ما قدرت أتصل. تأكد من النت."); }
    }
  }

  /* ---------------- events / boot ---------------- */
  app.addEventListener("click", e => { const b = e.target.closest("button"); if (!b || b.disabled) return; if (view === "room") roomClick(b); else homeClick(b); });
  // coming back from a game (or the phone woke up): read the latest state again
  if (self.FNW) FNW.onVisible(() => { if (view === "room") { goKey = null; render(); } });
  const h = (location.hash || "").replace("#", "").toUpperCase();
  if (/^[A-Z]{4}$/.test(h)) {
    if (ME && ME.code === h && ME.name && db) joinNight(h, ME.name).catch(() => renderForm("join", h, "ما لقيت سهرة بهالرمز."));
    else renderForm("join", h);
  } else if (ME && ME.code && db) joinNight(ME.code, ME.name).catch(() => { ME.code = null; LS.set(F.LSK, ME); goHome(); });
  else goHome();
  self.NT = { get S() { return S; }, get ME() { return ME; } };
})();
