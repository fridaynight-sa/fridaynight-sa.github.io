/* برا السالفة — online rooms (Firebase) + pass-the-phone mode.
   Data lives under bs/<CODE>/ in the same Firebase project as سين جيم:
     state          public game state (phase, players order, pairs, votes tally, scores)
     players/<pid>  each player's own entry (name, seen, vote, guess)
     secret/<pid>   that player's role for the round (word, or "outside" + guess options)
     hidden         round answer kept by the host (word + who is outside)
   Every value is stored as {j: JSON string} so nulls/arrays survive. */
(function () {
  "use strict";
  const app = document.getElementById("app");
  const chip = document.getElementById("hdrChip");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // crypto-grade randomness (Math.random fallback)
  const rnd = () => { try { return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296; } catch (e) { return Math.random(); } };
  const rint = n => Math.floor(rnd() * n);
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rint(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const rid = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, "0")).join("");
  const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };

  /* ---------------- words ---------------- */
  let CATS = [];
  const catById = id => CATS.find(c => c.id === id);
  const isSpy = c => !!(c && c.mode === "spy");
  const W = c => isSpy(c) ? "المكان" : "الكلمة";          // what everyone knows
  const OUTN = c => isSpy(c) ? "الجاسوس" : "اللي برا السالفة";
  const catLabel = id => id === "random" ? "🎲 عشوائي" : (catById(id) ? catById(id).emoji + " " + catById(id).name : "");

  /* ---------------- game engine (shared by both modes) ---------------- */
  // used: {catId: [words already played this session]}
  function pickWord(catChoice, used) {
    const pool = CATS.filter(c => !isSpy(c)); const cat = catChoice === "random" ? pool[rint(pool.length)] : catById(catChoice) || CATS[0];
    let left = cat.words.filter(w => !(used[cat.id] || []).includes(w));
    if (!left.length) { used[cat.id] = []; left = cat.words.slice(); }
    const word = left[rint(left.length)];
    used[cat.id] = (used[cat.id] || []).concat(word);
    return { cat, word };
  }
  const maxOuts = n => Math.max(1, Math.floor((n - 1) / 2));
  // outsider pick: pure random, every player has the exact same chance every round
  // (no history rules, so nobody can guess who it is)
  // Random, but streaks that look like an order (the same person again, or the next one in the list)
  // are made rare: such a pick is drawn again once, so it can still happen and nobody can predict it.
  function pickOuts(ids, k, hist) {
    const last = ((hist && hist.last) || []).filter(id => ids.includes(id));
    const looks = id => last.includes(id) || (ids.length > 3 && last.some(o => ids[(ids.indexOf(o) + 1) % ids.length] === id));
    let outs = shuffle(ids).slice(0, k);
    if (last.length && outs.every(looks)) outs = shuffle(ids).slice(0, k);
    return outs;
  }
  function addOutHist(hist, outs) {
    const h = { c: Object.assign({}, (hist && hist.c) || {}), last: outs.slice() };
    outs.forEach(id => h.c[id] = (h.c[id] || 0) + 1);
    return h;
  }
  function makeRound(ids, catChoice, outCount, used, hist) {
    const { cat, word } = pickWord(catChoice, used);
    const order = shuffle(ids);
    const outs = pickOuts(ids, Math.min(outCount, maxOuts(ids.length)), hist);
    // a random cycle: everyone asks once and is asked once
    const pairs = order.map((id, i) => [id, order[(i + 1) % order.length]]);
    // spy mode: the spy gets a different place from the same list and is not told
    const spyWord = isSpy(cat) ? shuffle(cat.words.filter(w => w !== word))[0] : null;
    const options = shuffle([word].concat(shuffle(cat.words.filter(w => w !== word && w !== spyWord)).slice(0, 5)));
    return { cat: { id: cat.id, name: cat.name, emoji: cat.emoji, mode: cat.mode || null, image: cat.image || null }, word, spyWord, outs, order, pairs, options };
  }
  function tally(order, votes) {
    const counts = {}; order.forEach(id => counts[id] = 0);
    Object.entries(votes).forEach(([v, t]) => { if (order.includes(v) && t in counts && t !== v) counts[t]++; });
    const max = Math.max(0, ...Object.values(counts));
    const accused = max > 0 ? order.filter(id => counts[id] === max) : [];
    return { counts, max, accused };
  }
  function scoreRound(R, votes, guesses) {
    const t = tally(R.order, votes), deltas = {}, caught = {}, guessOk = {};
    R.order.forEach(id => deltas[id] = 0);
    R.outs.forEach(o => {
      caught[o] = t.accused.includes(o);
      guessOk[o] = guesses[o] === R.word;
      if (!caught[o]) deltas[o] += 2; else if (guessOk[o]) deltas[o] += 1;
    });
    const rightVoters = R.order.filter(v => R.outs.includes(votes[v]) && votes[v] !== v);
    rightVoters.forEach(v => deltas[v] += 1);
    return { tally: t, deltas, caught, guessOk, rightVoters };
  }

  /* ---------------- shared bits of UI ---------------- */
  function roleCard(revealed, isOut, cat, word) {
    if (revealed && isSpy(cat)) return `<div class="role spy"><small>القسم: ${esc(cat.emoji)} ${esc(cat.name)}</small><small>المكان</small><span class="big">${esc(word)}</span></div>`;
    const catTxt = cat ? `القسم: ${esc(cat.emoji)} ${esc(cat.name)}` : "";
    if (!revealed) return `<button type="button" class="role${isSpy(cat) ? " spy" : ""}" data-act="reveal"><span class="tap">👆</span><span class="big">اضغط وشوف دورك</span><small>${catTxt}</small></button>`;
    return `<div class="role"><small>${catTxt}</small>${isOut ? `<span class="big">أنت برا السالفة 🤫</span><small>حاول تتخفى وتعرف الكلمة</small>` : `<small>الكلمة</small><span class="big">${esc(word)}</span>`}</div>`;
  }
  function scoreTable(ids, nameOf, scores, deltas) {
    const rows = ids.slice().sort((a, b) => (scores[b] || 0) - (scores[a] || 0));
    return `<table><thead><tr><th>اللاعب</th><th class="n">هالجولة</th><th class="n">المجموع</th></tr></thead><tbody>${rows.map(id => `<tr><td>${esc(nameOf(id))}</td><td class="n ${deltas && deltas[id] ? "plus" : ""}">${deltas ? (deltas[id] ? "+" + deltas[id] : "0") : "–"}</td><td class="n">${scores[id] || 0}</td></tr>`).join("")}</tbody></table>`;
  }
  function barsHTML(order, nameOf, counts, outs) {
    const max = Math.max(1, ...order.map(id => counts[id] || 0));
    return `<div class="bars">${order.slice().sort((a, b) => (counts[b] || 0) - (counts[a] || 0)).map(id => `<div class="bar ${outs.includes(id) ? "out" : ""}"><span>${esc(nameOf(id))}</span><span class="tr"><i style="width:${((counts[id] || 0) / max) * 100}%"></i></span><span>${counts[id] || 0}</span></div>`).join("")}</div>`;
  }
  // game moments (fnanim.js): played once per round
  const fa = (key, fn) => { if (self.FA) FA.once(key, fn); };
  const rk = R => (R._k = R._k || Math.random().toString(36).slice(2));
  function resultSummary(R, res, nameOf) {
    const lines = R.outs.map(o => {
      const n = esc(nameOf(o));
      if (!res.caught[o]) return `<li>${n} ما انكشف 😎 <b>+2</b></li>`;
      return `<li>${n} انكشف، و${res.guessOk[o] ? `خمّن ${W(R.cat)} صح 👏 <b>+1</b>` : `ما عرف ${W(R.cat)} ❌`}</li>`;
    });
    if (res.rightVoters.length) lines.push(`<li>صوّتوا صح (<b>+1</b>): ${res.rightVoters.map(v => esc(nameOf(v))).join("، ")}</li>`);
    return `<p class="big-msg">${isSpy(R.cat) ? "المكان كان" : "الكلمة كانت"} <span class="word">${esc(R.word)}</span></p>${isSpy(R.cat) && R.spyWord ? `<p class="note center">والجاسوس كان طالع له: ${esc(R.spyWord)}</p>` : ""}<ul class="note">${lines.join("")}</ul>`;
  }
  const catBanner = () => "";
  const pageBg = img => { document.body.classList.toggle("catbg", !!img); document.body.style.setProperty("--catbg", img ? `url("${img}")` : "none"); };
  function setupFields(cat, outs, n) {
    return `${catBanner(cat)}<div class="field"><span class="lbl">القسم</span><div class="seg" data-grp="cat">${["random"].concat(CATS.map(c => c.id)).map(id => `<button type="button" data-cat="${id}" class="${cat === id ? "on" : ""}">${esc(catLabel(id))}</button>`).join("")}</div></div>
      <div class="field"><span class="lbl">كم واحد برا السالفة (أو جاسوس)؟</span><div class="stepper"><button type="button" data-outs="-1" aria-label="أقل">−</button><b>${outs}</b><button type="button" data-outs="1" aria-label="أكثر">+</button></div>${n ? `<p class="note">مع ${n} لاعبين: لين ${maxOuts(n)} برا السالفة.</p>` : ""}</div>`;
  }

  /* =================================================================
     PASS-THE-PHONE MODE
     ================================================================= */
  const PKEY = "bs-pass-v1";
  let PS = null; // pass state
  function passInit() {
    const saved = LS.get(PKEY, {});
    PS = { step: "setup", names: saved.names || ["", "", ""], cat: saved.cat || "random", outs: saved.outs || 1, scores: {}, used: {}, oh: null, R: null, idx: 0, shown: false, votes: {}, guesses: {}, pick: null, res: null };
  }
  const passSave = () => LS.set(PKEY, { names: PS.names, cat: PS.cat, outs: PS.outs });
  // the game in progress (round, scores, words used) survives leaving the page; «لعبة جديدة» clears it
  const GKEY = "bs-pass-game-v1";
  const passKeep = () => { if (PS && (PS.step !== "setup" || Object.keys(PS.scores || {}).length)) LS.set(GKEY, Object.assign({}, PS, { shown: false })); };
  const passForget = () => { try { localStorage.removeItem(GKEY); } catch (e) {} };
  function passResume() {
    const g = LS.get(GKEY, null);
    if (!g || !Array.isArray(g.names) || !g.step) return false;
    PS = g; view = "pass"; renderPass(); return true;
  }
  const pName = id => PS.names[+id] || "";
  function passIds() { return PS.names.map((n, i) => [n.trim(), String(i)]).filter(x => x[0]).map(x => x[1]); }

  function renderPass() {
    chip.hidden = true; passKeep();
    const R = PS.R;
    { const c = PS.step === "setup" ? catById(PS.cat) : R && R.cat; pageBg(c && c.image); }
    if (PS.step === "setup") {
      const n = passIds().length;
      app.innerHTML = `<div class="card"><h2>📱 جوال واحد</h2><p class="note">اكتبوا أسماءكم، وبعدين كل واحد يشوف دوره لحاله ويعطي الجوال اللي بعده.</p>
        <div class="field mt"><span class="lbl">اللاعبين (3 على الأقل)</span>${PS.names.map((nm, i) => `<div class="row" style="margin-bottom:6px"><input class="inp" data-name="${i}" value="${esc(nm)}" maxlength="18" placeholder="لاعب ${i + 1}">${PS.names.length > 3 ? `<button type="button" class="ghost" style="flex:0 0 auto" data-del="${i}" aria-label="احذف">✕</button>` : ""}</div>`).join("")}
        <button type="button" class="btn alt" data-act="addname">+ لاعب</button></div>
        ${setupFields(PS.cat, PS.outs, n)}
        <p class="err" id="perr"></p>
        <button type="button" class="btn" data-act="pstart">ابدأ الجولة</button>
        <button type="button" class="btn alt mt" data-act="home">رجوع</button></div>`;
      return;
    }
    if (PS.step === "roles") {
      const id = R.order[PS.idx];
      app.innerHTML = PS.shown
        ? `<div class="card"><h2>دور ${esc(pName(id))}</h2>${roleCard(true, R.outs.includes(id), R.cat, R.outs.includes(id) && R.spyWord ? R.spyWord : R.word)}<button type="button" class="btn mt" data-act="phide">تم، أخفِ</button></div>`
        : `<div class="card center"><p class="note">${PS.idx + 1} من ${R.order.length}</p><p class="big-msg">أعطِ الجوال لـ ${esc(pName(id))}</p>${roleCard(false, false, R.cat)}<button type="button" class="btn mt" data-act="reveal">اكشف دوري</button></div>`;
      return;
    }
    if (PS.step === "ask") {
      app.innerHTML = `<div class="card"><h2>جولة الأسئلة 🗣️</h2><p class="note">القسم: ${esc(R.cat.emoji)} ${esc(R.cat.name)} · كل واحد يسأل اللي جنبه سؤال عن ${W(R.cat)} بدون ما يفضحها.</p>
        <ul class="pairs mt">${R.pairs.map(([a, b]) => `<li>${esc(pName(a))} <i>يسأل</i> ${esc(pName(b))}</li>`).join("")}</ul>
        <button type="button" class="btn mt" data-act="pvote">خلصنا، نصوّت</button></div>`;
      return;
    }
    if (PS.step === "vote") {
      const id = R.order[PS.idx];
      app.innerHTML = PS.shown
        ? `<div class="card"><h2>${esc(pName(id))}، مين ${isSpy(R.cat) ? "الجاسوس" : "برا السالفة"}؟</h2><p class="note">صوّتك سري.</p><div class="vote mt">${R.order.map(t => `<button type="button" data-vote="${t}" ${t === id ? "disabled" : ""} class="${PS.pick === t ? "on" : ""}">${esc(pName(t))}</button>`).join("")}</div>
          <button type="button" class="btn mt" data-act="pvoted" ${PS.pick ? "" : "disabled"}>تأكيد وأخفِ</button></div>`
        : `<div class="card center"><p class="note">التصويت ${PS.idx + 1} من ${R.order.length}</p><p class="big-msg">أعطِ الجوال لـ ${esc(pName(id))}</p><button type="button" class="btn" data-act="reveal">أنا ${esc(pName(id))}، أبي أصوّت</button></div>`;
      return;
    }
    if (PS.step === "reveal") {
      const t = tally(R.order, PS.votes);
      app.innerHTML = `<div class="card"><h2>النتيجة 🗳️</h2>${barsHTML(R.order, pName, t.counts, [])}
        <p class="big-msg mt">${OUTN(R.cat)}: ${R.outs.map(o => esc(pName(o))).join(" و")} ${isSpy(R.cat) ? "🕵️" : "🤫"}</p>
        <button type="button" class="btn pink" data-act="pguess">فرصة التخمين</button></div>`;
      fa("bsp-rv-" + rk(R), () => FA.reveal(OUTN(R.cat) + ": " + R.outs.map(pName).join(" و") + (isSpy(R.cat) ? " 🕵️" : " 🤫"), null, "#f03e7a"));
      return;
    }
    if (PS.step === "guess") {
      const id = R.outs[PS.idx];
      app.innerHTML = PS.shown
        ? `<div class="card"><h2>${esc(pName(id))}، وش ${W(R.cat)} الصحيح${isSpy(R.cat) ? "" : "ة"}؟</h2><div class="opts mt">${R.options.map(w => `<button type="button" data-guess="${esc(w)}" class="${PS.pick === w ? "on" : ""}">${esc(w)}</button>`).join("")}</div>
          <button type="button" class="btn mt" data-act="pguessed" ${PS.pick ? "" : "disabled"}>تأكيد</button></div>`
        : `<div class="card center"><p class="big-msg">أعطِ الجوال لـ ${esc(pName(id))}</p><button type="button" class="btn" data-act="reveal">خمّن ${W(R.cat)}</button></div>`;
      return;
    }
    if (PS.step === "results") {
      app.innerHTML = `<div class="card"><h2>نتيجة الجولة 🏆</h2>${resultSummary(R, PS.res, pName)}${barsHTML(R.order, pName, PS.res.tally.counts, R.outs)}</div>
        <div class="card"><h2>النقاط</h2>${scoreTable(R.order, pName, PS.scores, PS.res.deltas)}
        <button type="button" class="btn mt" data-act="pnext">جولة جديدة</button><button type="button" class="btn alt mt" data-act="psetup">غيّر اللاعبين أو القسم</button></div>`;
      fa("bsp-res-" + rk(R), () => { FA.play("party"); FA.confetti(); });
    }
  }
  function passStart() {
    PS.names = PS.names.map(n => n.trim());
    const ids = passIds();
    const names = ids.map(pName);
    if (ids.length < 3) { document.getElementById("perr").textContent = "تحتاجون 3 لاعبين على الأقل."; return; }
    if (new Set(names).size !== names.length) { document.getElementById("perr").textContent = "فيه اسمين متشابهين، غيّروا واحد منهم."; return; }
    passSave();
    // scores + outsider history are kept by name, so editing/removing players never shifts them
    const byName = {}; Object.entries(PS.scores).forEach(([id, v]) => { const n = (PS.idNames || {})[id]; if (n) byName[n] = v; });
    PS.scores = {}; ids.forEach(id => { if (byName[pName(id)] != null) PS.scores[id] = byName[pName(id)]; });
    PS.idNames = {}; ids.forEach(id => PS.idNames[id] = pName(id));
    const oh = PS.oh || { c: {}, last: [] }, hist = { c: {}, last: ids.filter(id => oh.last.includes(pName(id))) };
    ids.forEach(id => hist.c[id] = oh.c[pName(id)] || 0);
    PS.R = makeRound(ids, PS.cat, PS.outs, PS.used, hist);
    PS.oh = addOutHist({ c: oh.c }, PS.R.outs.map(pName));
    PS.step = "roles"; PS.idx = 0; PS.shown = false; PS.votes = {}; PS.guesses = {}; PS.pick = null;
    renderPass();
  }
  function passClick(b) {
    const a = b.dataset.act, R = PS.R;
    if (b.dataset.name !== undefined) return;
    if (b.dataset.del !== undefined) { PS.names.splice(+b.dataset.del, 1); renderPass(); return; }
    if (b.dataset.cat) { PS.cat = b.dataset.cat; renderPass(); return; }
    if (b.dataset.outs) { PS.outs = Math.max(1, Math.min(maxOuts(Math.max(3, passIds().length)), PS.outs + +b.dataset.outs)); renderPass(); return; }
    if (b.dataset.vote) { PS.pick = b.dataset.vote; renderPass(); return; }
    if (b.dataset.guess) { PS.pick = b.dataset.guess; renderPass(); return; }
    if (a === "addname") { PS.names.push(""); renderPass(); app.querySelector(`[data-name="${PS.names.length - 1}"]`).focus(); return; }
    if (a === "pstart" || a === "pnext") { passStart(); return; }
    if (a === "psetup") { PS.step = "setup"; renderPass(); return; }
    if (a === "home") { goHome(); return; }
    if (a === "reveal") { PS.shown = true; renderPass(); return; }
    if (a === "phide") { PS.shown = false; PS.idx++; if (PS.idx >= R.order.length) { PS.step = "ask"; } renderPass(); return; }
    if (a === "pvote") { PS.step = "vote"; PS.idx = 0; PS.shown = false; PS.pick = null; renderPass(); return; }
    if (a === "pvoted") { PS.votes[R.order[PS.idx]] = PS.pick; PS.pick = null; PS.shown = false; PS.idx++; if (PS.idx >= R.order.length) PS.step = "reveal"; renderPass(); return; }
    if (a === "pguess") { PS.step = "guess"; PS.idx = 0; PS.shown = false; PS.pick = null; renderPass(); return; }
    if (a === "pguessed") {
      PS.guesses[R.outs[PS.idx]] = PS.pick; PS.pick = null; PS.shown = false; PS.idx++;
      if (PS.idx >= R.outs.length) { PS.res = scoreRound(R, PS.votes, PS.guesses); Object.entries(PS.res.deltas).forEach(([id, d]) => PS.scores[id] = (PS.scores[id] || 0) + d); PS.step = "results"; }
      renderPass(); return;
    }
  }

  /* =================================================================
     ONLINE MODE
     ================================================================= */
  const CFG = self.FIREBASE_CONFIG;
  let db = null;
  try { if (CFG && CFG.databaseURL && self.firebase) { firebase.initializeApp(CFG); db = firebase.database(); } } catch (e) { console.error(e); }
  const enc = o => ({ j: JSON.stringify(o) });
  const dec = v => { try { return v && typeof v.j === "string" ? JSON.parse(v.j) : null; } catch (e) { return null; } };
  const MKEY = "bs-me-v1";
  let ME = LS.get(MKEY, null);            // {pid, name, code}
  let S = null, P = {}, SEC = null, HID = null, subs = [], revealed = false, myPick = null, lastRound = -1, view = "home";
  // secrets are sealed (see fncrypto.js): secret/<pid> for that player, hidden + votes for the host only
  let VDEC = {}, decSeq = 0, secSeq = 0, hidSeq = 0;
  const myKey = () => FNC.pub();
  const isHost = () => S && ME && S.host === ME.pid;
  const ref = p => db.ref("bs/" + ME.code + (p ? "/" + p : ""));
  const nameOf = id => (P[id] && P[id].name) || (S && S.names && S.names[id]) || "؟";
  const myEntry = () => (P[ME.pid] || {});
  function writeMe(patch) { const cur = Object.assign({}, myEntry(), patch); P[ME.pid] = cur; return ref("players/" + ME.pid).set(enc(cur)); }
  function writeState(patch) { S = Object.assign({}, S, patch); return ref("state").set(enc(S)); }
  const joinURL = c => location.origin + location.pathname + "#" + c;

  function unsubscribe() { subs.forEach(f => f()); subs = []; }
  function subscribe() {
    unsubscribe();
    const on = (r, cb) => { const h = s => cb(s.val()); r.on("value", h); subs.push(() => r.off("value", h)); };
    on(ref("state"), v => { S = dec(v); if (S && S.round !== lastRound) { lastRound = S.round; revealed = false; myPick = null; } renderRoom(); hostTick(); });
    on(ref("players"), v => { P = {}; Object.entries(v || {}).forEach(([k, x]) => { const d = dec(x); if (d) P[k] = d; }); renderRoom(); decVotes(); });
    on(ref("secret/" + ME.pid), async v => { const n = ++secSeq, o = await FNC.open(dec(v)); if (n !== secSeq) return; SEC = o || null; renderRoom(); });
    on(ref("hidden"), async v => { const n = ++hidSeq, o = await FNC.open(dec(v)); if (n !== hidSeq) return; HID = o || null; hostTick(); });
  }
  const genCode = () => { const L = "ABCDEFGHJKLMNPQRSTUVWXYZ"; return Array.from({ length: 4 }, () => L[rint(L.length)]).join(""); };

  async function createRoom(name) {
    let code = genCode();
    if (self.FNN && FNN.room) code = FNN.room;   // سهرة: the night already picked this room's code
    else for (let i = 0; i < 5; i++) { const s = await db.ref("bs/" + code + "/state").get(); if (!s.exists()) break; code = genCode(); }
    ME = { pid: (self.FNN && FNN.pid) || "p" + rid(8), name, code }; LS.set(MKEY, ME);
    S = { v: 1, host: ME.pid, phase: "lobby", round: 0, cat: "random", outs: 1, scores: {}, used: {}, names: {}, at: Date.now() };
    S.hk = await myKey();
    if (self.FNN) S.nt = FNN.n;   // which step of the سهرة this room is
    await ref("state").set(enc(S));
    await writeMe({ name, at: Date.now(), key: await myKey() });
    view = "room"; history.replaceState(null, "", "#" + code); subscribe();
  }
  async function joinRoom(code, name) {
    const s = await db.ref("bs/" + code + "/state").get();
    if (!s.exists()) throw new Error("nocode");
    const same = ME && ME.code === code ? ME.pid : null;
    // two players with the same name make the rounds confusing: the name must be free in this room
    const mine = same || (self.FNN && FNN.pid) || null, nm = x => String(x || "").trim().toLowerCase();
    const others = (await db.ref("bs/" + code + "/players").get()).val() || {};
    if (Object.entries(others).some(([id, x]) => id !== mine && nm((dec(x) || {}).name) === nm(name))) throw new Error("taken");
    ME = { pid: same || (self.FNN && FNN.pid) || "p" + rid(8), name, code }; LS.set(MKEY, ME);
    P = {};
    const st = dec(s.val());
    const cur = (await db.ref("bs/" + code + "/players/" + ME.pid).get()).val();
    await db.ref("bs/" + code + "/players/" + ME.pid).set(enc(Object.assign({}, dec(cur) || {}, { name, key: await myKey(), at: (dec(cur) || {}).at || Date.now() })));
    S = st; view = "room"; history.replaceState(null, "", "#" + code); subscribe();
  }
  function leaveRoom() { unsubscribe(); if (ME) { ME.code = null; LS.set(MKEY, ME); } S = null; P = {}; SEC = null; HID = null; history.replaceState(null, "", location.pathname); goHome(); }

  /* ---- host logic ---- */
  async function hostStart() {
    const ids = Object.keys(P).sort((a, b) => (P[a].at || 0) - (P[b].at || 0));
    if (ids.length < 3) return "تحتاجون 3 لاعبين على الأقل.";
    const used = JSON.parse(JSON.stringify(S.used || {}));
    const noKey = ids.filter(id => !P[id].key);
    if (noKey.length) return "لازم " + noKey.map(id => P[id].name).join(" و") + " يحدّث الصفحة.";
    const R = makeRound(ids, S.cat, S.outs, used, S.oh);
    const names = {}; ids.forEach(id => names[id] = P[id].name);
    const sk = {}; ids.forEach(id => sk[id] = P[id].key);
    const H = { round: S.round + 1, cat: R.cat, word: R.word, spyWord: R.spyWord, outs: R.outs, options: R.options, sk };
    await saveHidden(H);
    await Promise.all(ids.map(id => writeSecret(id, H, false)));
    await writeState({ phase: "roles", round: S.round + 1, hk: await myKey(), order: R.order, pairs: R.pairs, catInfo: R.cat, nOuts: R.outs.length, used, oh: addOutHist(S.oh, R.outs), names, reveal: null, results: null });
    return "";
  }
  // host sees who each player voted for; everyone else only sees that they voted
  function votesOf(order, round) { const v = {}; order.forEach(id => { const e = P[id]; if (e && e.vote && e.vote.r === round) v[id] = isHost() && VDEC[id] && VDEC[id].r === round ? VDEC[id].t : true; }); return v; }
  async function decVotes() {
    if (!isHost()) { hostTick(); return; }
    const n = ++decSeq, out = {};
    await Promise.all(Object.entries(P).map(async ([id, e]) => { if (e && e.vote && e.vote.s) { const t = await FNC.open(e.vote.s); if (typeof t === "string") out[id] = { r: e.vote.r, t }; } }));
    if (n !== decSeq) return;
    VDEC = out; renderRoom(); hostTick();
  }
  const hostVotes = (order, round) => { const v = votesOf(order, round); Object.keys(v).forEach(k => { if (typeof v[k] !== "string") delete v[k]; }); return v; };
  const votesReady = (order, round) => order.every(id => !(P[id] && P[id].vote && P[id].vote.r === round) || (VDEC[id] && VDEC[id].r === round));
  // what player id may know this round
  const secretFor = (id, H, withOptions) => ({ round: H.round, cat: H.cat, out: H.outs.includes(id), word: H.outs.includes(id) ? (withOptions ? H.spyWord || null : H.spyWord) : H.word, options: withOptions && H.outs.includes(id) ? H.options : undefined });
  async function writeSecret(id, H, withOptions) { await ref("secret/" + id).set(enc(await FNC.seal(P[id].key, secretFor(id, H, withOptions)))); }
  async function saveHidden(H) { HID = H; await ref("hidden").set(enc(await FNC.seal(await myKey(), H))); }
  function guessesOf(outs, round) { const g = {}; outs.forEach(id => { const e = P[id]; if (e && e.guess && e.guess.r === round) g[id] = e.guess.w; }); return g; }
  let ticking = false;
  async function hostTick() {
    if (!isHost() || ticking || !HID || HID.round !== S.round) return;
    ticking = true;
    try {
      // a player who reloaded with a new key gets their secret sealed again
      if (S.phase !== "lobby" && S.phase !== "results" && HID.sk) {
        const re = (S.order || []).filter(id => P[id] && P[id].key && HID.sk[id] !== P[id].key);
        if (re.length) {
          const H = Object.assign({}, HID, { sk: Object.assign({}, HID.sk) }); re.forEach(id => H.sk[id] = P[id].key);
          await Promise.all(re.map(id => writeSecret(id, H, S.phase === "reveal")));
          await saveHidden(H);
        }
      }
      if (S.hk !== await myKey()) await writeState({ hk: await myKey() });
      if (S.phase === "vote") {
        const v = votesOf(S.order, S.round);
        if (Object.keys(v).length >= S.order.length && votesReady(S.order, S.round)) await hostReveal();
      } else if (S.phase === "reveal") {
        const g = guessesOf(HID.outs, S.round);
        if (Object.keys(g).length >= HID.outs.length) await hostFinish();
      }
    } finally { ticking = false; }
  }
  async function hostReveal() {
    const t = tally(S.order, hostVotes(S.order, S.round));
    await Promise.all(HID.outs.filter(id => P[id] && P[id].key).map(id => writeSecret(id, HID, true)));
    await writeState({ phase: "reveal", reveal: { counts: t.counts, outs: HID.outs } });
  }
  async function hostFinish() {
    const R = { order: S.order, outs: HID.outs, word: HID.word };
    const res = scoreRound(R, hostVotes(S.order, S.round), guessesOf(HID.outs, S.round));
    const scores = Object.assign({}, S.scores);
    Object.entries(res.deltas).forEach(([id, d]) => scores[id] = (scores[id] || 0) + d);
    await writeState({ phase: "results", scores, results: { word: HID.word, spyWord: HID.spyWord || null, deltas: res.deltas, caught: res.caught, guessOk: res.guessOk, rightVoters: res.rightVoters, counts: res.tally.counts, outs: HID.outs } });
  }

  /* ---- room view ---- */
  function renderRoom() {
    if (view !== "room") return;
    { const c = !S ? null : (S.phase === "lobby" || !S.catInfo) ? catById(S.cat) : S.catInfo; pageBg(c && c.image); }
    if (!S) { app.innerHTML = `<div class="card center"><p class="big-msg">جاري الاتصال…</p></div>`; return; }
    chip.hidden = false; chip.innerHTML = `الغرفة <b dir="ltr">${esc(ME.code)}</b> · ${esc(ME.name)}${isHost() ? " 👑" : ""}`;
    const inRound = S.order && S.order.includes(ME.pid) && S.phase !== "lobby";
    const leave = `<button type="button" class="btn alt mt" data-act="leave">اطلع من الغرفة</button>`;
    if (!P[ME.pid] && Object.keys(P).length) { app.innerHTML = `<div class="card center"><p class="big-msg">انشلت من الغرفة</p>${leave}</div>`; return; }

    if (S.phase === "lobby" || (!inRound && S.phase !== "results")) {
      const ids = Object.keys(P).sort((a, b) => (P[a].at || 0) - (P[b].at || 0));
      const waiting = S.phase !== "lobby";
      let qr = "";
      try { if (typeof QRCode !== "undefined") { const d = document.createElement("div"); new QRCode(d, { text: joinURL(ME.code), width: 240, height: 240, colorDark: "#2b1745", colorLight: "#ffffff" }); const c = d.querySelector("canvas"); qr = c ? c.toDataURL() : ""; } } catch (e) {}
      app.innerHTML = `${waiting ? `<div class="card center"><p class="big-msg">الجولة شغالة، تدخل معهم في الجولة الجاية ⏳</p></div>` : ""}
        <div class="card center"><span class="lbl">رمز الغرفة</span><div class="code">${esc(ME.code)}</div>${qr ? `<img class="qr" src="${qr}" alt="باركود الدخول">` : ""}
        <p class="note">خلّ البقية يصوّرون الباركود أو يدخلون الرمز من «ادخل غرفة».</p><button type="button" class="ghost mt" data-act="copy">انسخ رابط الدخول</button><p class="note">📺 للعرض على التلفزيون: <b dir="ltr">${esc((location.origin + location.pathname.replace(/outside\/?(index\.html)?$/, "") + "tv/").replace(/^https?:\/\//, ""))}</b></p></div>
        <div class="card"><h2>اللاعبين (${ids.length})</h2><ul class="plist">${ids.map(id => `<li class="${id === ME.pid ? "me" : ""}">${esc(P[id].name)}${id === S.host ? " 👑" : ""}${isHost() && id !== ME.pid && S.phase === "lobby" ? ` <button type="button" data-kick="${id}" aria-label="شيل">✕</button>` : ""}</li>`).join("")}</ul></div>
        ${isHost() && !waiting ? `<div class="card">${setupFields(S.cat, S.outs, ids.length)}<p class="err" id="herr"></p><button type="button" class="btn" data-act="hstart" ${ids.length < 3 ? "disabled" : ""}>ابدأ الجولة</button>${ids.length < 3 ? `<p class="note center">ننتظر ${3 - ids.length} لاعب${3 - ids.length > 1 ? "ين" : ""} بعد.</p>` : ""}</div>` : !waiting ? `<div class="card center">${catBanner(S.cat)}<p class="note">ننتظر 👑 ${esc(nameOf(S.host))} يبدأ الجولة… القسم: ${esc(catLabel(S.cat))}</p></div>` : ""}
        ${leave}`;
      return;
    }
    const mySec = SEC && SEC.round === S.round ? SEC : null;
    const order = S.order || [];
    if (S.phase === "roles" || S.phase === "ask") {
      const seen = order.filter(id => P[id] && P[id].seen === S.round);
      const card = mySec ? roleCard(revealed, mySec.out, mySec.cat, mySec.word) : `<div class="role"><span class="big">لحظة…</span></div>`;
      if (S.phase === "roles") {
        app.innerHTML = `<div class="card"><h2>الجولة ${S.round}: شوف دورك</h2><p class="note">غطِّ الشاشة عن اللي جنبك 👀</p><div class="mt">${card}</div>
          ${revealed ? `<button type="button" class="btn mt" data-act="hide">تم، أخفِ</button>` : ""}</div>
          <div class="card"><h3>شافوا أدوارهم (${seen.length}/${order.length})</h3><ul class="plist">${order.map(id => `<li class="${id === ME.pid ? "me" : ""} ${seen.includes(id) ? "done" : ""}">${esc(nameOf(id))}</li>`).join("")}</ul>
          ${isHost() ? `<button type="button" class="btn mt" data-act="hask">يلا جولة الأسئلة</button>` : `<p class="note">لما الكل يشوف دوره، 👑 ${esc(nameOf(S.host))} يبدأ الأسئلة.</p>`}</div>`;
      } else {
        app.innerHTML = `<div class="card"><h2>جولة الأسئلة 🗣️</h2><p class="note">القسم: ${esc(S.catInfo.emoji)} ${esc(S.catInfo.name)} · كل واحد يسأل اللي بعده سؤال عن ${W(S.catInfo)} بدون ما يفضحها.</p>
          <ul class="pairs mt">${(S.pairs || []).map(([a, b]) => `<li class="${a === ME.pid || b === ME.pid ? "me" : ""}">${esc(nameOf(a))} <i>يسأل</i> ${esc(nameOf(b))}</li>`).join("")}</ul>
          ${isHost() ? `<button type="button" class="btn mt" data-act="hvote">خلصنا، نصوّت</button>` : ""}</div>
          <div class="card"><h3>دورك</h3>${card}${revealed ? `<button type="button" class="btn alt mt" data-act="hide">أخفِ</button>` : ""}</div>`;
      }
      return;
    }
    if (S.phase === "vote") {
      const v = votesOf(order, S.round), mine = v[ME.pid];
      app.innerHTML = `<div class="card"><h2>مين ${isSpy(S.catInfo) ? "الجاسوس 🕵️" : "برا السالفة 🗳️"}؟</h2><p class="note">صوّتك سري. صوّتوا ${Object.keys(v).length} من ${order.length}.</p>
        ${mine ? `<p class="big-msg mt">صوّتت ✓</p><p class="note center">ننتظر الباقين…</p>` : `<div class="vote mt">${order.map(t => `<button type="button" data-vote="${t}" ${t === ME.pid ? "disabled" : ""} class="${myPick === t ? "on" : ""}">${esc(nameOf(t))}</button>`).join("")}</div>
        <button type="button" class="btn mt" data-act="dovote" ${myPick ? "" : "disabled"}>تأكيد التصويت</button>`}
        <ul class="plist mt">${order.map(id => `<li class="${id === ME.pid ? "me" : ""} ${v[id] ? "done" : ""}">${esc(nameOf(id))}</li>`).join("")}</ul>
        ${isHost() ? `<button type="button" class="btn alt mt" data-act="hreveal">اكشف النتيجة الحين</button>` : ""}</div>`;
      return;
    }
    if (S.phase === "reveal") {
      const rv = S.reveal || { counts: {}, outs: [] };
      const amOut = rv.outs.includes(ME.pid);
      const g = guessesOf(rv.outs, S.round);
      const opts = mySec && mySec.options;
      app.innerHTML = `<div class="card"><h2>النتيجة 🗳️</h2>${barsHTML(order, nameOf, rv.counts, [])}
        <p class="big-msg mt">${OUTN(S.catInfo)}: ${rv.outs.map(o => esc(nameOf(o))).join(" و")} ${isSpy(S.catInfo) ? "🕵️" : "🤫"}</p></div>
        <div class="card">${amOut ? (g[ME.pid] ? `<p class="big-msg">اخترت: ${esc(g[ME.pid])}</p><p class="note center">ننتظر النتيجة…</p>` : `<h2>فرصتك! وش ${W(S.catInfo)} الصحيح${isSpy(S.catInfo) ? "" : "ة"}؟</h2>${opts ? `<div class="opts">${opts.map(w => `<button type="button" data-guess="${esc(w)}" class="${myPick === w ? "on" : ""}">${esc(w)}</button>`).join("")}</div><button type="button" class="btn mt" data-act="doguess" ${myPick ? "" : "disabled"}>تأكيد</button>` : `<p class="note">لحظة…</p>`}`)
          : `<p class="big-msg">${rv.outs.map(o => esc(nameOf(o))).join(" و")} يخمّن ${W(S.catInfo)} الحين… 🤔</p>`}
        ${isHost() ? `<button type="button" class="btn alt mt" data-act="hfinish">اعرض النقاط الحين</button>` : ""}</div>`;
      fa("bs-rv-" + ME.code + "-" + S.round, () => FA.reveal(OUTN(S.catInfo) + ": " + rv.outs.map(nameOf).join(" و") + (isSpy(S.catInfo) ? " 🕵️" : " 🤫"), amOut ? "انكشفت! 😅" : null, "#f03e7a"));
      return;
    }
    if (S.phase === "results") {
      const r = S.results;
      const R = { outs: r.outs, word: r.word, spyWord: r.spyWord, cat: S.catInfo };
      app.innerHTML = `<div class="card"><h2>نتيجة الجولة ${S.round} 🏆</h2>${resultSummary(R, r, nameOf)}${barsHTML(order, nameOf, r.counts, r.outs)}</div>
        <div class="card"><h2>النقاط</h2>${scoreTable(Object.keys(S.scores || {}).concat(order.filter(id => !(S.scores || {})[id])).filter((x, i, a) => a.indexOf(x) === i), nameOf, S.scores || {}, r.deltas)}
        ${(fa("bs-res-" + ME.code + "-" + S.round, () => { const d = (r.deltas || {})[ME.pid] || 0; if (d > 0) FA.right("+" + d + " 🎉"); else { FA.play("party"); FA.confetti(); } }), "")}
        ${isHost() ? `<p class="err" id="herr"></p><button type="button" class="btn mt" data-act="hnext">جولة جديدة</button><button type="button" class="btn alt mt" data-act="hlobby">غيّر القسم أو انتظر لاعبين</button>` : `<p class="note center mt">ننتظر 👑 ${esc(nameOf(S.host))} يبدأ جولة جديدة…</p>`}</div>${leave}`;
    }
  }
  async function roomClick(b) {
    const a = b.dataset.act;
    const herr = m => { const e = document.getElementById("herr"); if (e) e.textContent = m; };
    try {
      if (b.dataset.cat && isHost()) { await writeState({ cat: b.dataset.cat }); return; }
      if (b.dataset.outs && isHost()) { const n = Math.max(3, Object.keys(P).length); await writeState({ outs: Math.max(1, Math.min(maxOuts(n), (S.outs || 1) + +b.dataset.outs)) }); return; }
      if (b.dataset.kick && isHost()) { await ref("players/" + b.dataset.kick).remove(); return; }
      if (b.dataset.vote) { myPick = b.dataset.vote; renderRoom(); return; }
      if (b.dataset.guess) { myPick = b.dataset.guess; renderRoom(); return; }
      if (a === "reveal") { revealed = true; renderRoom(); return; }
      if (a === "hide") { revealed = false; if (myEntry().seen !== S.round) await writeMe({ seen: S.round }); renderRoom(); return; }
      if (a === "dovote" && myPick) { if (!S.hk) return; await writeMe({ vote: { r: S.round, s: await FNC.seal(S.hk, myPick) } }); myPick = null; return; }
      if (a === "doguess" && myPick) { await writeMe({ guess: { r: S.round, w: myPick } }); myPick = null; return; }
      if (a === "copy") { try { await navigator.clipboard.writeText(joinURL(ME.code)); b.textContent = "انتسخ ✓"; } catch (e) { b.textContent = joinURL(ME.code); } return; }
      if (a === "leave") { leaveRoom(); return; }
      if (!isHost()) return;
      if (a === "hstart" || a === "hnext") { b.disabled = true; const m = await hostStart(); if (m) { herr(m); b.disabled = false; } return; }
      if (a === "hask") { await writeState({ phase: "ask" }); return; }
      if (a === "hvote") { await writeState({ phase: "vote" }); return; }
      if (a === "hreveal") { await hostReveal(); return; }
      if (a === "hfinish") { await hostFinish(); return; }
      if (a === "hlobby") { await writeState({ phase: "lobby" }); return; }
    } catch (e) { console.error(e); alert("ما قدرت أتصل. تأكد من النت وجرّب مرة ثانية."); }
  }

  /* =================================================================
     HOME / JOIN screens
     ================================================================= */
  function goHome() { if (view === "pass") passForget(); view = "home"; chip.hidden = true; pageBg(null); renderHome(); }
  function renderHome() {
    app.innerHTML = `<div class="hero"><h1>برا السالفة 🤫</h1><p>الكل يعرف الكلمة إلا واحد… اكشفوه قبل ما يعرفها!</p></div>
      <div class="modes">
        <button type="button" class="mode" data-act="ocreate"><span class="ic">📡</span><span><b>افتح غرفة أونلاين</b><span>كل واحد يلعب من جواله</span></span></button>
        <button type="button" class="mode" data-act="ojoin"><span class="ic">🔑</span><span><b>ادخل غرفة</b><span>عندك رمز من صاحبك</span></span></button>
        <button type="button" class="mode" data-act="pass"><span class="ic">📱</span><span><b>جوال واحد</b><span>مرّروا الجوال بينكم</span></span></button>
      </div>
      <div class="card mt"><h3>طريقة اللعب</h3><ul class="note"><li>كل اللاعبين تطلع لهم كلمة سرية، إلا اللي برا السالفة.</li><li>تسألون بعض أسئلة عن الكلمة بدون ما تفضحونها.</li><li>بعدين تصوّتون مين برا السالفة، وهو يحاول يخمّن الكلمة.</li><li>🕵️ قسم الجاسوس: الكل يطلع لهم مكان، والجاسوس يطلع له مكان ثاني وما يدري إنه الجاسوس.</li><li>ما انكشف: <b>+2</b> · انكشف وعرف الكلمة: <b>+1</b> · صوّتّ صح: <b>+1</b></li></ul></div>`;
  }
  function renderForm(kind, code, msg) {
    const nm = (ME && ME.name) || "";
    if (!db) { app.innerHTML = `<div class="card"><h2>الأونلاين مو شغال</h2><p class="note">ما قدرت أتصل بقاعدة البيانات. جرّب «جوال واحد» أو حدّث الصفحة.</p><button type="button" class="btn mt" data-act="home">رجوع</button></div>`; return; }
    app.innerHTML = `<div class="card"><h2>${kind === "create" ? "📡 افتح غرفة" : "🔑 ادخل غرفة"}</h2>
      ${kind === "join" ? `<div class="field"><label for="fCode">رمز الغرفة</label><input id="fCode" class="inp codein" maxlength="4" autocomplete="off" value="${esc(code || "")}" placeholder="ABCD"></div>` : ""}
      <div class="field"><label for="fName">اسمك</label><input id="fName" class="inp" maxlength="18" value="${esc(nm)}" placeholder="مثلاً: فيصل"></div>
      <p class="err" id="ferr">${esc(msg || "")}</p>
      <button type="button" class="btn" data-act="${kind === "create" ? "docreate" : "dojoin"}">${kind === "create" ? "افتح الغرفة" : "دخول"}</button>
      <button type="button" class="btn alt mt" data-act="home">رجوع</button></div>`;
    view = kind;
  }
  async function homeClick(b) {
    const a = b.dataset.act, err = m => { const e = document.getElementById("ferr"); if (e) e.textContent = m; };
    if (a === "home") { goHome(); return; }
    if (a === "pass") { view = "pass"; passInit(); renderPass(); return; }
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

  /* ---- always-visible "new game" button: leaves the room / round and goes home ---- */
  const newBtn = document.getElementById("newBtn");
  let newArm = null;
  setInterval(() => { newBtn.hidden = view === "home"; }, 300);
  newBtn.onclick = () => {
    if (!newBtn.classList.contains("warn")) {
      newBtn.classList.add("warn"); newBtn.textContent = "اضغط مرة ثانية للتأكيد";
      newArm = setTimeout(() => { newBtn.classList.remove("warn"); newBtn.textContent = "🏠 لعبة جديدة"; }, 3000);
      return;
    }
    clearTimeout(newArm); newBtn.classList.remove("warn"); newBtn.textContent = "🏠 لعبة جديدة";
    if (view === "room") leaveRoom(); else { history.replaceState(null, "", location.pathname); goHome(); }
    window.scrollTo(0, 0);
  };
  /* ---------------- events ---------------- */
  app.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    if (view === "pass") passClick(b);
    else if (view === "room") roomClick(b);
    else homeClick(b);
  });
  app.addEventListener("input", e => { const i = e.target; if (view === "pass" && i.dataset.name !== undefined) PS.names[+i.dataset.name] = i.value; });

  /* ---------------- boot ---------------- */
  // keep the host's screen awake while a room is open
  setInterval(() => { if (self.FNW) FNW.hold(view === "room" && isHost()); }, 1000);
  if (self.FNW) FNW.onVisible(() => hostTick());
  fetch("words.json", { cache: "no-cache" }).then(r => r.json()).then(d => {
    CATS = d.categories.filter(c => c.words && c.words.length >= 6);
    const h = (location.hash || "").replace("#", "").toUpperCase();
    // سهرة: the night's host opens this game's room (or comes back to it after a reload)
    if (self.FNN && FNN.host && FNN.room === h && db) db.ref("bs/" + h + "/state").get().then(s => { const o = s.exists() && dec(s.val()); return o && o.host === FNN.pid && o.nt === FNN.n ? joinRoom(h, FNN.name) : createRoom(FNN.name); }).catch(() => renderForm("join", h, "ما قدرت أتصل. تأكد من النت."));
    else if (/^[A-Z]{4}$/.test(h)) {
      if (ME && ME.code === h && ME.name && db) { joinRoom(h, ME.name).catch(() => renderForm("join", h, "ما لقيت غرفة بهالرمز.")); }
      else renderForm("join", h);
    } else if (ME && ME.code && db) {
      joinRoom(ME.code, ME.name).catch(() => { ME.code = null; LS.set(MKEY, ME); goHome(); });
    } else if (!passResume()) goHome();
  }).catch(() => { app.innerHTML = `<div class="card"><p class="big-msg">ما قدرت أحمّل الكلمات. حدّث الصفحة.</p></div>`; });

  // test hook
  self.BS = { makeRound, pickOuts, addOutHist, tally, scoreRound, pickWord, get CATS() { return CATS; } };
})();
