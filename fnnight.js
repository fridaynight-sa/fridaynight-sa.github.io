/* Friday Night — «سهرة كاملة»: one code for the whole night.
   The host of the night picks a game, everybody's phone moves to it, and when the game is over
   each player gets night points by their place in that game (see PTS), so every game weighs the same.
   Firebase paths:
     night/<CODE>/state          written by the night's host only
     night/<CODE>/players/<nid>  each player's own entry {name, at}
   Inside a game the player's id in the game room is the night id (nid), so scores map back directly.
   This file is loaded by the night page AND by every game page (before the game's app.js):
   on a game page opened as  <game>/?night=CODE[&h=1]#ROOM  it tells the game which room/id to use
   (self.FNN) and shows a small bar to go back to the night. Without ?night= it does nothing. */
(function () {
  "use strict";
  const LSK = "fn-night-v1";                      // {code, nid, name} of this device in its night
  const GAMES = {
    seenjeem: { name: "سين جيم", icon: "seenjeem", color: "#7c3aed" },
    outside: { name: "برا السالفة", icon: "outside", color: "#f03e7a", path: "bs", mk: "bs-me-v1" },
    sedq: { name: "صدق ولا كذب", icon: "sedq", color: "#12a874", path: "sq", mk: "sq-me-v1" },
    mf: { name: "مين فينا؟", icon: "mf", color: "#ff7a1a", path: "mf", mk: "mf-me-v1" },
    draw: { name: "ارسم وخمّن", icon: "draw", color: "#1c7ed6", path: "draw", mk: "draw-me-v1" },
  };
  const ORDER = ["seenjeem", "outside", "sedq", "mf", "draw"];
  const PTS = [5, 3, 2];                          // 1st, 2nd, 3rd; everybody else who played gets 1
  const SJ_KEY = "seenjeem-series-v8", SJ_RKEY = "seenjeem-remote-v1";

  const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const enc = o => ({ j: JSON.stringify(o) });
  const dec = v => { try { return v && typeof v.j === "string" ? JSON.parse(v.j) : null; } catch (e) { return null; } };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sameName = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

  // scores {id: n} -> night points {id: p}. Equal scores share the place (5,5 then 2 …).
  function place(scores) {
    const ids = Object.keys(scores || {}), out = {};
    ids.forEach(id => { const better = ids.filter(o => (+scores[o] || 0) > (+scores[id] || 0)).length; out[id] = PTS[better] || 1; });
    return out;
  }
  // سين جيم is played in teams: every member gets the place of their team.
  // members {nid: teamIndex | -1 (didn't play)}
  function placeTeams(teams, members) {
    const ts = {}; (teams || []).forEach((t, i) => ts[i] = +t.score || 0);
    const tp = place(ts), out = {};
    Object.entries(members || {}).forEach(([nid, t]) => { if (t >= 0 && tp[t] != null) out[nid] = tp[t]; });
    return out;
  }
  function addResult(st, g, pts, extra) {
    const totals = Object.assign({}, st.totals);
    Object.entries(pts).forEach(([id, p]) => totals[id] = (totals[id] || 0) + p);
    const played = (st.played || []).concat(Object.keys(pts).length ? [Object.assign({ g, pts, at: Date.now() }, extra || {})] : []);
    return Object.assign({}, st, { totals, played, cur: null, pending: null });
  }
  const ranking = st => {
    const names = st.names || {}, t = st.totals || {};
    return Object.keys(names).map(id => [id, names[id], t[id] || 0]).sort((a, b) => b[2] - a[2]);
  };

  let DB = null;
  function db() {
    if (DB) return DB;
    const C = self.FIREBASE_CONFIG;
    if (!(C && C.databaseURL && self.firebase)) return null;
    try { if (!firebase.apps.length) firebase.initializeApp(C); DB = firebase.database(); } catch (e) { console.error(e); }
    return DB;
  }

  self.FNIGHT = { LSK, GAMES, ORDER, PTS, SJ_KEY, SJ_RKEY, place, placeTeams, addResult, ranking, enc, dec, esc, sameName, LS, db };

  /* ---------------- on a game page ---------------- */
  const gm = location.pathname.match(/\/(seenjeem|outside|sedq|mf|draw)\/(index\.html)?$/);
  const qs = new URLSearchParams(location.search);
  const N = (qs.get("night") || "").toUpperCase();
  const me = LS.get(LSK, null);
  if (!gm || !/^[A-Z]{4}$/.test(N) || !me || me.code !== N || !me.nid) return;
  const g = gm[1], G = GAMES[g];
  const room = (location.hash || "").replace("#", "").toUpperCase();
  const host = qs.get("h") === "1";
  self.FNN = { night: N, room: room || null, pid: me.nid, name: me.name, host, game: g };
  if (G.mk && /^[A-Z]{4}$/.test(room)) LS.set(G.mk, { pid: me.nid, name: me.name, code: room });
  if (g === "seenjeem" && !host && /^[A-Z]{2}[0-9]{3}$/.test(room)) {
    const r = LS.get(SJ_RKEY, null) || {};
    LS.set(SJ_RKEY, { code: room, name: me.name, role: "player", team: r.code === room && typeof r.team === "number" ? r.team : null });
  }
  const nightURL = () => location.pathname.replace(/[^/]+\/(index\.html)?$/, "") + "night/#" + N;

  function bar() {
    const css = document.createElement("style");
    css.textContent = `.fn-nbar{position:fixed;top:calc(8px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:8px;background:#2b1745;color:#fff;border-radius:999px;padding:5px 6px 5px 14px;font:800 13px/1.2 Tajawal,system-ui,sans-serif;box-shadow:3px 3px 0 #ffb21e;white-space:nowrap;max-width:calc(100vw - 24px)}
      .fn-nbar b{color:#ffb21e;direction:ltr}.fn-nbar button{background:#ffb21e;color:#2b1745;border:0;border-radius:999px;padding:6px 12px;font:inherit;cursor:pointer}
      body{padding-top:calc(46px + env(safe-area-inset-top,0px))!important}
      .fn-nsheet{position:fixed;inset:0;z-index:2147483001;background:rgba(43,23,69,.55);display:grid;place-items:center;padding:16px}
      .fn-nsheet>div{background:#fff;color:#2b1745;border:3px solid #2b1745;box-shadow:6px 6px 0 #ffb21e;border-radius:22px;padding:18px;width:min(360px,100%);text-align:center;font-family:Tajawal,system-ui,sans-serif}
      .fn-nsheet h3{margin:0 0 4px;font-size:20px}.fn-nsheet p{margin:0 0 12px;color:#6b5a80;font-weight:700}
      .fn-nsheet button{display:block;width:100%;margin-top:8px;border:2px solid #2b1745;box-shadow:3px 3px 0 #2b1745;border-radius:14px;padding:11px;font:800 16px Tajawal,system-ui,sans-serif;cursor:pointer;background:#fff;color:#2b1745}
      .fn-nsheet button.go{background:#7c3aed;color:#fff}`;
    document.head.appendChild(css);
    const b = document.createElement("div"); b.className = "fn-nbar";
    b.innerHTML = host ? `<span>🌙 سهرة <b>${esc(N)}</b></span><button type="button">خلصنا — ارجع للسهرة</button>`
      : `<span>🌙 سهرة <b>${esc(N)}</b></span><span style="opacity:.8;padding-inline-end:8px">تنتقل تلقائي</span>`;
    document.body.appendChild(b);
    if (host) b.querySelector("button").onclick = sheet;
  }
  function sheet() {
    const o = document.createElement("div"); o.className = "fn-nsheet";
    o.innerHTML = `<div><h3>🌙 نرجع للسهرة؟</h3><p>نقاط هاللعبة تنضاف لترتيب السهرة</p>
      <button type="button" class="go" data-a="score">✅ احسب النقاط وارجع</button><button type="button" data-a="skip">ارجع بدون نقاط</button><button type="button" data-a="x">كمّل اللعب</button></div>`;
    document.body.appendChild(o);
    o.onclick = async e => {
      const a = e.target.dataset && e.target.dataset.a;
      if (!a) return;
      if (a === "x") { o.remove(); return; }
      o.querySelectorAll("button").forEach(x => x.disabled = true);
      try { await finish(a === "score"); location.href = nightURL(); }
      catch (err) { console.error(err); o.remove(); alert("ما قدرت أتصل. تأكد من النت وجرّب مرة ثانية."); }
    };
  }
  // host only: record this game's result into the night and send everyone back
  async function finish(score) {
    const d = db(), sref = d.ref("night/" + N + "/state");
    const st = dec((await sref.get()).val());
    if (!st || st.host !== me.nid) return;
    let next = Object.assign({}, st, { cur: null, pending: null });
    if (score && G.path && room) {
      const gs = dec((await d.ref(G.path + "/" + room + "/state").get()).val()) || {};
      const sc = {}; Object.entries(gs.scores || {}).forEach(([id, v]) => { if (st.names && st.names[id]) sc[id] = +v || 0; });
      next = addResult(st, g, place(sc), { room });
    } else if (score && g === "seenjeem") {
      // the teams and their scores live on this (the host's) device; who was in which team comes from presence
      const S = LS.get(SJ_KEY, {}) || {}, code = S.room && S.room.code;
      const teams = (S.teams || []).map(t => ({ name: t.name, score: +t.score || 0 }));
      const members = {}; Object.keys(st.names || {}).forEach(id => members[id] = -1);
      if (code) {
        const pv = (await d.ref("presence/sj-" + code.toLowerCase()).get()).val() || {};
        Object.values(pv).map(dec).filter(p => p && p.role === "player" && typeof p.team === "number").forEach(p => {
          const id = Object.keys(st.names || {}).find(k => sameName(st.names[k], p.name));
          if (id) members[id] = p.team;
        });
      }
      next.pending = { g, teams, members, room: code || null };
    }
    await sref.set(enc(next));
  }
  function follow() {
    const d = db(); if (!d) return;
    d.ref("night/" + N + "/state").on("value", s => {
      const st = dec(s.val());
      if (!st) return;
      const cur = st.cur;
      if (host) {
        // سين جيم makes its own room code: tell the night so the others can follow
        if (g === "seenjeem" && cur && cur.g === "seenjeem") watchSJ();
        return;
      }
      const here = cur && cur.g === g && (!cur.room || cur.room === room);
      if (!here) location.href = nightURL();
    });
  }
  let sjT = null;
  function watchSJ() {
    if (sjT) return;
    sjT = setInterval(async () => {
      const S = LS.get(SJ_KEY, {}) || {}, code = S.room && !S.room.closed && S.room.code;
      if (!code) return;
      try {
        const sref = db().ref("night/" + N + "/state"), st = dec((await sref.get()).val());
        if (st && st.cur && st.cur.g === "seenjeem" && st.cur.room !== code) await sref.set(enc(Object.assign({}, st, { cur: Object.assign({}, st.cur, { room: code }) })));
      } catch (e) {}
    }, 1500);
  }
  const boot = () => { bar(); setTimeout(follow, 400); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
