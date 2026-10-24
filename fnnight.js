/* Friday Night — «سهرة»: switch game from inside any game, everybody follows, points add up.
   In any room, its host sees «🔄 بدّل اللعبة». Picking a game turns the room into a night (same code):
     night/<CODE>/state   written by the night's host only:
       {host, phase: "lobby"|"end", cur: {g, room, n}, seq, played: [{g, rank: {id: 1|2|3…}}], names, at}
   The next game's room gets the same CODE; each room remembers its step in the night (state.nt / rooms pub nt).
   Everybody's phone moves once the new room is ready. Only a game that was played to its end counts.
   The night is ranked like a medal table: most 🥇 first, then 🥈, then 🥉, so two wins always beat one,
   and every game weighs the same whatever its own points are. In سين جيم every member gets their team's place.
   Inside a night a player's id in each room is their night id, so scores map back directly.
   Loaded on every game page before the game's own script. Outside a room it does nothing. */
(function () {
  "use strict";
  const LSK = "fn-night-v1";                      // {code, nid, name} of this device in its night
  const GAMES = {
    seenjeem: { name: "سين جيم", icon: "seenjeem", color: "#7c3aed" },
    outside: { name: "برا السالفة", icon: "outside", color: "#f03e7a", path: "bs", mk: "bs-me-v1" },
    sedq: { name: "صدق ولا كذب", icon: "sedq", color: "#12a874", path: "sq", mk: "sq-me-v1" },
    mf: { name: "مين فينا؟", icon: "mf", color: "#ffb21e", path: "mf", mk: "mf-me-v1" },
    draw: { name: "ارسم وخمّن", icon: "draw", color: "#ff7a1a", path: "draw", mk: "draw-me-v1" },
    dafour: { name: "الدافور", icon: "dafour", color: "#1c7ed6", path: "df", mk: "df-me-v1" },
  };
  const ORDER = ["seenjeem", "outside", "sedq", "mf", "draw", "dafour"];
  const MEDAL = ["🥇", "🥈", "🥉"];
  const SJ_KEY = "seenjeem-series-v8", SJ_RKEY = "seenjeem-remote-v1";
  const BUSY_MS = 3 * 3600e3;                     // a room someone else used in the last 3 hours is not ours to reuse

  const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const enc = o => ({ j: JSON.stringify(o) });
  const dec = v => { try { return v && typeof v.j === "string" ? JSON.parse(v.j) : null; } catch (e) { return null; } };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rid = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, "0")).join("");
  const sameName = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
  // Firebase refuses writes to night/ until the new rules (database.rules.json) are published
  const denied = e => /permission/i.test(String((e && (e.code || e.message)) || ""));
  const RULES_MSG = "Firebase رفض يحفظ السهرة: لازم تنلصق قواعد Firebase الجديدة (ملف database.rules.json) وتضغط Publish.";
  const games = n => n === 1 ? "لعبة وحدة" : n === 2 ? "لعبتين" : n + (n <= 10 ? " ألعاب" : " لعبة");

  // scores {id: n} -> place {id: 1, 2, 3 …}. Equal scores share the place (1, 1, 3 …).
  function place(scores) {
    const ids = Object.keys(scores || {}), out = {};
    ids.forEach(id => { out[id] = 1 + ids.filter(o => (+scores[o] || 0) > (+scores[id] || 0)).length; });
    return out;
  }
  // members {nid: teamIndex | -1 (didn't play)}
  function placeTeams(teams, members) {
    const ts = {}; (teams || []).forEach((t, i) => ts[i] = +t.score || 0);
    const tp = place(ts), out = {};
    Object.entries(members || {}).forEach(([nid, t]) => { if (t >= 0 && tp[t] != null) out[nid] = tp[t]; });
    return out;
  }
  function addResult(st, g, rank) {
    const played = (st.played || []).concat(Object.keys(rank).length ? [{ g, rank, at: Date.now() }] : []);
    return Object.assign({}, st, { played });
  }
  // (nights saved before the medal table kept 5/3/2/1 points per game)
  const rankOf = x => x.rank || Object.fromEntries(Object.entries(x.pts || {}).map(([id, p]) => [id, { 5: 1, 3: 2, 2: 3 }[p] || 4]));
  // rows [id, name, [gold, silver, bronze], games played], best first
  function ranking(st) {
    const names = st.names || {}, m = {};
    Object.keys(names).forEach(id => m[id] = [0, 0, 0, 0]);
    (st.played || []).forEach(x => Object.entries(rankOf(x)).forEach(([id, r]) => { if (!m[id]) m[id] = [0, 0, 0, 0]; if (r <= 3) m[id][r - 1]++; m[id][3]++; }));
    const cmp = (a, b) => b[2][0] - a[2][0] || b[2][1] - a[2][1] || b[2][2] - a[2][2];
    return Object.keys(m).filter(id => names[id]).map(id => [id, names[id], m[id].slice(0, 3), m[id][3]]).sort(cmp);
  }
  const sameMedals = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
  const medalsText = v => v.some(Boolean) ? v.map((n, i) => n ? MEDAL[i] + (n > 1 ? "×" + n : "") : "").filter(Boolean).join(" ") : "—";

  let DB = null;
  function db() {
    if (DB) return DB;
    const C = self.FIREBASE_CONFIG;
    if (!(C && C.databaseURL && self.firebase)) return null;
    try { if (!firebase.apps.length) firebase.initializeApp(C); DB = firebase.database(); } catch (e) { console.error(e); }
    return DB;
  }
  self.FNIGHT = { LSK, GAMES, ORDER, MEDAL, place, placeTeams, addResult, ranking, rankOf, medalsText, games };

  /* ================= on a game page ================= */
  const gm = location.pathname.match(/\/(seenjeem|outside|sedq|mf|draw|dafour)\/(index\.html)?$/);
  if (!gm) return;
  const g = gm[1], G = GAMES[g];
  const qs = new URLSearchParams(location.search);
  const hash = () => (location.hash || "").replace("#", "").toUpperCase();
  const okCode = c => /^[A-Z]{4}$/.test(c || "");

  // arriving from a switch: tell the game which room and id to use (before the game's own script runs)
  const N = (qs.get("night") || "").toUpperCase(), me0 = LS.get(LSK, null);
  if (okCode(N) && me0 && me0.code === N && me0.nid) {
    self.FNN = { night: N, room: N, pid: me0.nid, name: me0.name, host: qs.get("h") === "1", n: +qs.get("n") || 0, game: g };
    if (G.mk && hash() === N) LS.set(G.mk, { pid: me0.nid, name: me0.name, code: N });
    if (g === "seenjeem" && !self.FNN.host && hash() === N) {
      const r = LS.get(SJ_RKEY, null) || {};
      LS.set(SJ_RKEY, { code: N, name: me0.name, role: "player", team: r.code === N && typeof r.team === "number" ? r.team : null });
    }
    if (g === "seenjeem" && self.FNN.host) {
      // a new سين جيم game in the night: fresh room and scores (the categories stay)
      const S = LS.get(SJ_KEY, null);
      if (S && (!S.room || S.room.code !== N || S.room.nt !== self.FNN.n)) {
        S.room = null; S.phase = "setup"; S.used = {}; S.hist = []; S.turn = 0; (S.teams || []).forEach(t => t.score = 0);
        LS.set(SJ_KEY, S);
      }
    }
  }
  const FNN = self.FNN || null;

  /* ---- where am I: {code, pid?, name, host?} ---- */
  function ctx() {
    const h = hash();
    if (G.mk) { const m = LS.get(G.mk, null); return m && okCode(m.code) && m.code === h ? { code: m.code, pid: m.pid, name: m.name } : null; }
    const S = LS.get(SJ_KEY, null), R = LS.get(SJ_RKEY, null);
    if (S && S.room && !S.room.closed && okCode(S.room.code) && (!h || h === S.room.code)) return { code: S.room.code, host: true, name: "" };
    if (R && R.role === "player" && okCode(R.code) && R.code === h) return { code: h, name: R.name };
    if (FNN && FNN.host && !h) return { code: FNN.room, host: true, name: "" };
    return null;
  }

  let C = null, NS = null, RS = null, RSok = false, subs = [], moving = null;
  const roomRef = (gg, code) => db().ref(GAMES[gg].path ? GAMES[gg].path + "/" + code + "/state" : "rooms/" + code);
  const roomNt = (gg, v) => { const o = dec(v); return o ? (o.nt || 0) : null; };   // works for both kinds of room
  function watch(c) {
    subs.forEach(f => f()); subs = []; NS = null; RS = null; RSok = false; C = c;
    if (!c) { update(); return; }
    const on = (r, cb) => { const h = s => cb(s.val()); r.on("value", h); subs.push(() => r.off("value", h)); };
    on(db().ref("night/" + c.code + "/state"), v => { NS = dec(v); update(); });
    on(roomRef(g, c.code), v => { RS = dec(v); RSok = true; update(); });
  }
  const myNid = () => {
    if (!NS || !C) return null;
    const names = NS.names || {}, m = LS.get(LSK, null);
    if (m && m.code === C.code && names[m.nid]) return m.nid;
    if (C.pid && names[C.pid]) return C.pid;
    return Object.keys(names).find(id => C.name && sameName(names[id], C.name)) || null;
  };
  const isNightHost = () => !!NS && NS.host === myNid();
  const isRoomHost = () => C && (G.mk ? !!RS && RS.host === C.pid : !!C.host);
  // which step of the night this page's room is
  // (the host's own page is the step it was opened for, even before its new room is written)
  const hereN = () => FNN && FNN.host && C && FNN.room === C.code ? FNN.n : RS ? (RS.nt || 0) : (RSok ? 0 : null);

  /* ---------------- UI ---------------- */
  const css = `.fn-nbar{position:fixed;top:calc(8px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:6px;background:#2b1745;color:#fff;border-radius:999px;padding:5px;font:800 13px/1.2 Tajawal,system-ui,sans-serif;box-shadow:3px 3px 0 #ffb21e;white-space:nowrap;max-width:calc(100vw - 24px)}
    .fn-nbar span{padding:0 6px 0 8px}.fn-nbar b{color:#ffb21e;direction:ltr;unicode-bidi:isolate}
    .fn-nbar button{background:#ffb21e;color:#2b1745;border:0;border-radius:999px;padding:6px 12px;font:inherit;cursor:pointer}
    .fn-nbar button.r{background:#fff}
    body.fn-hasbar{padding-top:calc(46px + env(safe-area-inset-top,0px))!important}
    .fn-nsheet{position:fixed;inset:0;z-index:2147483001;background:rgba(43,23,69,.55);display:flex;align-items:flex-end;justify-content:center}
    .fn-nsheet.mid{align-items:center;padding:16px}
    .fn-nsheet>div{background:#fff;color:#2b1745;border:3px solid #2b1745;border-bottom:0;border-radius:24px 24px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));width:min(520px,100%);max-height:92vh;overflow:auto;text-align:center;font-family:Tajawal,system-ui,sans-serif;animation:fnnup .3s both}
    .fn-nsheet.mid>div{border-bottom:3px solid #2b1745;border-radius:24px;box-shadow:6px 6px 0 #ffb21e;width:min(380px,100%)}
    @keyframes fnnup{from{transform:translateY(40px);opacity:0}}
    .fn-nsheet h3{margin:0 0 2px;font-size:20px;font-family:Almarai,Tajawal,system-ui,sans-serif}.fn-nsheet p{margin:0 0 8px;color:#6b5a80;font-weight:700;font-size:14px}
    .fn-nsheet .bt{display:block;width:100%;margin-top:8px;border:2px solid #2b1745;box-shadow:3px 3px 0 #2b1745;border-radius:14px;padding:11px;font:800 16px Tajawal,system-ui,sans-serif;cursor:pointer;background:#fff;color:#2b1745}
    .fn-nsheet .bt.go{background:#7c3aed;color:#fff}.fn-nsheet .bt:disabled{opacity:.6}
    .fn-ng{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0}
    .fn-ng button{position:relative;background:#fff;border:2px solid #2b1745;border-radius:14px;box-shadow:2px 2px 0 var(--c);padding:6px 4px;font:800 14px Tajawal,system-ui,sans-serif;color:#2b1745;cursor:pointer}
    .fn-ng img{width:50px;height:50px;object-fit:contain;display:block;margin:0 auto}
    .fn-ng button:last-child:nth-child(odd){grid-column:1/-1}.fn-ng button:disabled{opacity:.45;cursor:default}.fn-ng button.here::after{content:"الحين";position:absolute;top:4px;inset-inline-start:4px;font-size:10px;background:#12a874;color:#fff;border-radius:6px;padding:0 5px}
    .fn-nr{display:grid;gap:6px;margin:8px 0;text-align:start}
    .fn-nr div{display:flex;justify-content:space-between;align-items:center;border:2px solid #2b1745;border-radius:12px;padding:5px 12px;font-weight:800;background:#fff}
    .fn-nr div:first-child{background:#ffe08a}.fn-nr b{font-size:18px}.fn-nr em{font-style:normal;color:#12a874;font-size:13px;margin-inline-start:6px}
    .fn-np{display:flex;gap:5px;justify-content:center;flex-wrap:wrap}.fn-np img{width:28px;height:28px;border:2px solid #2b1745;border-radius:8px;background:#fff;object-fit:contain}
    .fn-tm{display:grid;gap:6px;margin:8px 0}
    .fn-tm button{display:flex;justify-content:space-between;align-items:center;border:2px solid #2b1745;border-radius:12px;padding:8px 12px;font:800 15px Tajawal,system-ui,sans-serif;background:#fff;color:#2b1745;cursor:pointer}
    .fn-tm button span:last-child{border-radius:999px;padding:0 10px;background:#f6efff;font-size:13px}
    .fn-tm .t0 span:last-child{background:#7c3aed;color:#fff}.fn-tm .t1 span:last-child{background:#f03e7a;color:#fff}.fn-tm .t2 span:last-child{background:#12a874;color:#fff}.fn-tm .t3 span:last-child{background:#ff7a1a;color:#fff}
    .fn-ngo img{width:110px;height:110px;object-fit:contain}.fn-ngo .ring{width:76px;height:76px;border-radius:50%;border:6px solid var(--c);color:var(--c);display:grid;place-items:center;font-size:34px;font-weight:800;margin:8px auto}`;
  const icon = gg => location.pathname.replace(/[^/]+\/(index\.html)?$/, "") + "icons/" + GAMES[gg].icon + ".png";
  let bar = null;
  function setBar(html) {
    if (!html) { if (bar) { bar.remove(); bar = null; document.body.classList.remove("fn-hasbar"); } return; }
    if (!bar) { bar = document.createElement("div"); bar.className = "fn-nbar"; document.body.appendChild(bar); document.body.classList.add("fn-hasbar"); bar.onclick = barClick; }
    if (bar.innerHTML !== html) bar.innerHTML = html;
  }
  function barClick(e) {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.a === "switch") sheetSwitch();
    if (b.dataset.a === "rank") sheetRank();
  }
  function overlay(html, mid) {
    document.querySelectorAll(".fn-nsheet").forEach(x => x.remove());
    const o = document.createElement("div"); o.className = "fn-nsheet" + (mid ? " mid" : ""); o.innerHTML = `<div>${html}</div>`;
    o.addEventListener("click", e => { if (e.target === o || (e.target.dataset && e.target.dataset.a === "x")) o.remove(); });
    document.body.appendChild(o); return o;
  }
  function rankHTML(st, delta) {
    const rows = ranking(st), pl = st.played || [], last = delta && pl.length ? rankOf(pl[pl.length - 1]) : null, me = myNid();
    const at = v => rows.filter(r => !sameMedals(r[2], v) && (r[2][0] - v[0] || r[2][1] - v[1] || r[2][2] - v[2]) > 0).length;   // shared place for equal medals
    return `${pl.length ? `<div class="fn-np">${pl.map(x => `<img src="${icon(x.g)}" alt="${esc(GAMES[x.g].name)}">`).join("")}</div>` : ""}
      <div class="fn-nr">${rows.map(([id, n, v]) => `<div><span>${at(v) + 1}. ${esc(n)}${id === me ? " (أنت)" : ""}</span><span><b>${medalsText(v)}</b>${last && last[id] && last[id] <= 3 ? `<em>+${MEDAL[last[id] - 1]}</em>` : ""}</span></div>`).join("")}</div>`;
  }
  function sheetRank() {
    if (!NS) return;
    const pl = (NS.played || []).length;
    overlay(`<h3>🏆 ترتيب السهرة</h3><p>${pl ? "بعد " + games(pl) : "ما خلصنا ولا لعبة للحين"}</p>${rankHTML(NS, true)}<p>كل لعبة تخلص: الأول 🥇، الثاني 🥈، الثالث 🥉. الترتيب بعدد 🥇، وإذا تعادلوا فبعدد 🥈 ثم 🥉. واللعبة اللي ما تخلص ما تنحسب.</p><button type="button" class="bt" data-a="x">تمام</button>`, true);
  }

  /* ---------------- host: switch game ---------------- */
  function sheetSwitch() {
    const pl = NS ? (NS.played || []).length : 0;
    const o = overlay(`<h3>🔄 وين نروح؟</h3><p>الكل ينتقل معك بنفس الرمز <b dir="ltr">${esc(C.code)}</b>. إذا ${esc(G.name)} خلصت، تنحسب ميدالياتها في ترتيب السهرة</p>
      <div class="fn-ng">${ORDER.map(k => `<button type="button" data-g="${k}" style="--c:${GAMES[k].color}" ${k === g ? 'class="here" disabled' : ""}><img src="${icon(k)}" alt="">${esc(GAMES[k].name)}</button>`).join("")}</div>
      ${NS ? `<button type="button" class="bt" data-a="end">🏁 خلصنا السهرة — مين بطل الليلة؟</button>` : ""}
      ${NS && pl ? `<details style="margin-top:8px;text-align:start"><summary style="font-weight:800;cursor:pointer">🏆 ترتيب السهرة</summary>${rankHTML(NS, true)}</details>` : ""}
      <button type="button" class="bt" data-a="x">إلغاء</button>`);
    o.querySelector("div").onclick = async e => {
      const b = e.target.closest("button"); if (!b || b.disabled) return;
      if (b.dataset.g || b.dataset.a === "end") {
        o.querySelectorAll("button").forEach(x => x.disabled = true);
        try { await (b.dataset.g ? doSwitch(b.dataset.g) : doEnd()); }
        catch (err) { if (err !== CANCEL) { console.error(err); alert(denied(err) ? RULES_MSG : "ما قدرت أتصل. تأكد من النت وجرّب مرة ثانية."); } }
        o.remove();
      }
    };
  }
  // the night as it is, or a new one made from this room's players
  async function nightNow() {
    if (NS) return JSON.parse(JSON.stringify(NS));   // (a copy: NS keeps updating)
    const d = db(), names = {};
    let host;
    if (G.mk) {
      const st = dec((await d.ref(G.path + "/" + C.code + "/state").get()).val()) || {};
      Object.assign(names, st.names || {});
      const pv = (await d.ref(G.path + "/" + C.code + "/players").get()).val() || {};
      Object.entries(pv).forEach(([id, x]) => { const p = dec(x); if (p && p.name) names[id] = p.name; });
      host = C.pid; if (!names[host]) names[host] = C.name || "صاحب الغرفة";
      LS.set(LSK, { code: C.code, nid: host, name: names[host] });
    } else {
      // سين جيم: its host never typed a name
      const m = LS.get(LSK, null);
      let name = m && m.name;
      if (!name) name = (prompt("اسمك؟ (عشان يطلع في ترتيب السهرة)") || "").trim().slice(0, 18) || "صاحب الغرفة";
      host = "n" + rid(8); names[host] = name;
      LS.set(LSK, { code: C.code, nid: host, name });
      (await sjPlayers(C.code)).forEach(p => { if (!Object.values(names).some(n => sameName(n, p.name))) names["n" + rid(8)] = p.name; });
    }
    return { v: 3, host, phase: "lobby", cur: { g, room: C.code, n: hereN() || 0 }, seq: hereN() || 0, played: [], names, at: Date.now() };
  }
  async function sjPlayers(code) {
    const pv = (await db().ref("presence/sj-" + code.toLowerCase()).get()).val() || {};
    return Object.values(pv).map(dec).filter(p => p && p.role === "player" && p.name);
  }
  // a game started but not played to its end: switching away gives nobody anything (no locking in a lead)
  const CANCEL = {};
  function unfinished(msg) { if (!confirm("⚠️ " + msg + "\n\nإذا بدّلت الحين ما تنحسب لأحد. تبدّل؟")) throw CANCEL; }
  // this game's places into the night (سين جيم asks the host who was in which team)
  async function withResult(st) {
    const d = db();
    if (G.mk) {
      const gs = dec((await d.ref(G.path + "/" + C.code + "/state").get()).val()) || {};
      if ((gs.nt || 0) !== ((st.cur && st.cur.n) || 0)) return st;                               // not this night's game
      const sc = gs.scores || {};
      if (!Object.keys(sc).length && (!gs.phase || gs.phase === "lobby")) return st;            // never started (برا السالفة fills scores only after its first round)
      if (G.path === "bs") {
        // برا السالفة has no end: it counts after as many rounds as players (at least 3)
        const done = gs.phase === "results" ? gs.round || 0 : Math.max(0, (gs.round || 0) - 1), need = Math.max(3, (gs.order || Object.keys(sc)).length);
        if (done < need) { if (done || gs.phase !== "lobby") unfinished(`لعبتوا ${done} من ${need} جولات، و${G.name} تنحسب بعد ${need} جولات (بعدد اللاعبين).`); return st; }
      } else if (gs.phase !== "end") { if (gs.phase !== "lobby") unfinished(`${G.name} ما خلصت للحين، تنحسب لما تطلع «النتيجة النهائية».`); return st; }
      const names = Object.assign({}, st.names);
      Object.keys(sc).forEach(id => { if (!names[id]) names[id] = (gs.names && gs.names[id]) || "لاعب"; });
      return addResult(Object.assign(st, { names }), g, place(sc));
    }
    const S = LS.get(SJ_KEY, {}) || {}, teams = (S.teams || []).map(t => ({ name: t.name, score: +t.score || 0 }));
    if (S.phase !== "end") { if (Object.keys(S.used || {}).length) unfinished("سين جيم ما خلصت للحين، تنحسب لما تخلص كل الأسئلة."); return st; }
    const names = Object.assign({}, st.names), members = {};
    Object.keys(names).forEach(id => members[id] = -1);
    (await sjPlayers(C.code)).forEach(p => {
      let id = Object.keys(names).find(k => sameName(names[k], p.name));
      if (!id) { id = "n" + rid(8); names[id] = p.name; }
      if (typeof p.team === "number") members[id] = p.team;
    });
    st.names = names;
    const m = await confirmTeams(st, teams, members);
    return m ? addResult(st, g, placeTeams(teams, m)) : st;
  }
  function confirmTeams(st, teams, members) {
    return new Promise(res => {
      const m = Object.assign({}, members);
      const tname = t => t >= 0 && teams[t] ? teams[t].name : "ما لعب";
      const draw = () => {
        const o = overlay(`<h3>🎬 ميداليات سين جيم</h3><p>${teams.map(t => `<b>${esc(t.name)}</b>: ${t.score}`).join(" · ")}</p><p>مين كان في أي فريق؟ اضغط على الاسم عشان تغيّره.</p>
          <div class="fn-tm">${Object.keys(st.names).map(id => `<button type="button" data-m="${id}" class="t${m[id] ?? -1}"><span>${esc(st.names[id])}</span><span>${esc(tname(m[id] ?? -1))}</span></button>`).join("")}</div>
          <button type="button" class="bt go" data-a="ok">✅ احسب الميداليات</button><button type="button" class="bt" data-a="skip">بدون ميداليات</button>`, true);
        o.onclick = null;
        o.querySelector("div").onclick = e => {
          const b = e.target.closest("button"); if (!b) return;
          if (b.dataset.m) { const t = m[b.dataset.m] ?? -1; m[b.dataset.m] = t + 1 >= teams.length ? -1 : t + 1; draw(); return; }
          o.remove(); res(b.dataset.a === "ok" ? m : null);
        };
      };
      draw();
    });
  }
  async function doSwitch(t) {
    const d = db(), code = C.code, T = GAMES[t];
    // the same code in the next game must be free (or ours)
    const raw = (await roomRef(t, code).get()).val();
    if (raw) {
      const o = dec(raw) || {}, names = (NS && NS.names) || {};
      const ours = T.path ? (o.host && (names[o.host] || o.host === C.pid)) : o.nt != null && !!NS;
      const age = Date.now() - (T.path ? o.at || 0 : raw.t || 0);
      if (!ours && age < BUSY_MS) { alert("فيه ناس ثانيين يلعبون " + T.name + " بنفس الرمز الحين. اختار لعبة ثانية."); return; }
    }
    let st = await nightNow();
    // after «بطل الليلة» a new game starts a new night (that last game was already counted)
    if (st.phase === "end") st = Object.assign(st, { played: [] });
    else st = await withResult(st);
    const n = (st.seq || 0) + 1;
    st = Object.assign(st, { seq: n, phase: "lobby", cur: { g: t, room: code, n, at: Date.now() } });
    await d.ref("night/" + code + "/state").set(enc(st));
    go(t, code, n, true);
  }
  async function doEnd() {
    let st = await withResult(await nightNow());
    st = Object.assign(st, { phase: "end", seq: (st.seq || 0) + 1, cur: Object.assign({}, st.cur, { done: true }) });
    await db().ref("night/" + C.code + "/state").set(enc(st));
  }
  function go(t, code, n, host) {
    const m = LS.get(LSK, null) || {};
    const nid = myNid() || (m.code === code && m.nid) || (C && C.pid) || "n" + rid(8);
    LS.set(LSK, { code, nid, name: (NS && NS.names && NS.names[nid]) || m.name || (C && C.name) || "" });
    const base = location.pathname.replace(/[^/]+\/(index\.html)?$/, "");
    const sjHost = host && t === "seenjeem";
    location.href = `${base}${t}/?night=${code}&n=${n}${host ? "&h=1" : ""}${sjHost ? "" : "#" + code}`;
  }

  /* ---------------- follow the night ---------------- */
  let readyT = null;
  const STALE_MS = 4 * 3600e3;
  function update() {
    if (!C) { setBar(null); return; }
    if (!NS) { setBar(isRoomHost() ? `<button type="button" data-a="switch">🔄 بدّل اللعبة</button>` : null); return; }
    const nh = isNightHost();
    setBar(`<span>🌙 سهرة <b>${esc(C.code)}</b></span><button type="button" class="r" data-a="rank">🏆</button>${nh ? `<button type="button" data-a="switch">🔄 بدّل اللعبة</button>` : ""}`);
    const pl = (NS.played || []).length, here = hereN(), cur = NS.cur || {};
    if (NS.phase === "end") {
      if (self.FA) FA.once("fnn-end-" + C.code + "-" + NS.seq, () => {
        const rows = ranking(NS), top = rows.length && rows[0][2].some(Boolean) ? rows.filter(r => sameMedals(r[2], rows[0][2])) : [];
        if (!top.length) { overlay(`<h3>🏁 انتهت السهرة</h3><p>ما خلصتوا ولا لعبة عشان تنحسب، فما فيه بطل لليلة هذي.</p><button type="button" class="bt" data-a="x">تمام</button>`, true); return; }
        if (top.length) { FA.confetti(); FA.winner(top.map(r => r[1]).join(" و"), rows.map(r => [r[1], medalsText(r[2])]), top.length > 1 ? "أبطال الليلة 👑" : "بطل الليلة 👑"); }
      }, true);   // (also right after a page opens: whoever arrives late still sees who won)
      return;
    }
    if (here === null) return;                       // still loading this room
    if (cur.g === g && cur.n === here) {
      // arrived: show the night's standings once
      if (pl && self.FA) FA.once("fnn-rank-" + C.code + "-" + cur.n, () => { FA.play("party", [40, 40]); sheetRank(); }, true);
      return;
    }
    // an old سهرة (no switch for hours) moves nobody: someone opening an old link stays where they are
    if (cur.g && cur.n > here && !(cur.at && Date.now() - cur.at > STALE_MS)) follow(cur, nh);
  }
  function follow(cur, nh) {
    const key = cur.g + ":" + cur.n;
    if (moving === key) return;
    moving = key; clearInterval(readyT);
    const T = GAMES[cur.g], host = (NS.names || {})[NS.host] || "صاحب السهرة";
    if (nh) { if (!(cur.g === g && FNN && FNN.n === cur.n)) go(cur.g, C.code, cur.n, true); return; }
    const o = overlay(`<div class="fn-ngo" style="--c:${T.color}"><p>👑 ${esc(host)} اختار</p><img src="${icon(cur.g)}" alt=""><h3>${esc(T.name)}</h3><div class="ring" id="fnnRing">…</div><p id="fnnMsg">${T.path ? "ننقلك تلقائي…" : "ننتظره يجهز سين جيم… وتنتقل تلقائي"}</p></div>`, true);
    o.onclick = null;
    if (self.FA) FA.play("whoosh");
    let left = 3, ready = false;
    const tick = async () => {
      if (!ready) { try { ready = roomNt(cur.g, (await roomRef(cur.g, C.code).get()).val()) === cur.n; } catch (e) {} if (!ready) return; }
      const r = document.getElementById("fnnRing"); if (r) r.textContent = left;
      const m = document.getElementById("fnnMsg"); if (m) m.textContent = "ننقلك تلقائي…";
      if (left-- <= 0) { clearInterval(readyT); go(cur.g, C.code, cur.n, false); }
    };
    readyT = setInterval(tick, 1000); tick();
  }
  function boot() {
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    let last = "";
    setInterval(() => { if (!db()) return; const c = ctx(), k = c ? c.code + ":" + (c.pid || "") + ":" + (c.host ? 1 : 0) : ""; if (k !== last) { last = k; watch(c); } else if (c) { C = c; update(); } }, 1000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
