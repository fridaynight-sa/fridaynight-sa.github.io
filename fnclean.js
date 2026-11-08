/* «🧹 تنظيف الغرف» on its own: the owner's phone, once a day, deletes the rooms nobody used for a day.
   The free Firebase plan has nothing that runs by itself on the server, so the owner's own phone does it, quietly,
   the first time a day it opens the homepage or the owner's page signed in (only the owner may list the rooms).
   FNCL.auto(getToken) → a promise of the day's cleaning, or null when it already ran today.
   FNCL.run(getToken) → {rooms, old, done, bad}. FNCL.last() → {at, done, bad} of the last cleaning. */
(function () {
  "use strict";
  const C = self.FIREBASE_CONFIG; if (!C || !C.databaseURL) return;
  const DB = C.databaseURL.replace(/\/$/, ""), DAY = 864e5, KEY = "fn-clean";
  const ROOMS = ["rooms", "bs", "sq", "mf", "draw", "df", "jh", "night"];
  const ls = { get() { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { return null; } }, set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} } };
  function api(tok) {
    return async (path, opt, q) => {
      const r = await fetch(DB + "/" + path + ".json?auth=" + encodeURIComponent(await tok()) + (q || ""), opt);
      if (r.status === 401 || r.status === 403) throw "denied";
      if (!r.ok) throw "net";
      return r.json();
    };
  }
  // the newest time a room shows: in its state (at, t, t0, wt, ts) or when a player joined
  function newest(...objs) {
    let m = 0;
    const look = o => { if (!o || typeof o !== "object") return; ["at", "t", "t0", "wt", "ts"].forEach(k => { if (typeof o[k] === "number" && o[k] > 1.5e12 && o[k] > m) m = o[k]; }); };
    objs.forEach(o => { if (o && typeof o.j === "string") { try { look(JSON.parse(o.j)); } catch (e) {} } else look(o); });
    return m;
  }
  async function scan(call) {
    const out = [];
    await Promise.all(ROOMS.map(async p => {
      const codes = Object.keys((await call(p, {}, "&shallow=true").catch(() => null)) || {});
      await Promise.all(codes.map(async c => {
        let t = 0;
        if (p === "rooms") t = newest(await call("rooms/" + c).catch(() => null));
        else { const [st, pl] = await Promise.all([call(p + "/" + c + "/state").catch(() => null), call(p + "/" + c + "/players").catch(() => null)]); t = newest(st, ...Object.values(pl || {})); }
        out.push({ p, c, t });
      }));
    }));
    return out;
  }
  // delete a room; where the rules only let each part go by itself, part by part
  async function wipe(call, path, depth) {
    try { await call(path, { method: "DELETE" }); }
    catch (e) {
      if (e !== "denied" || (depth || 0) > 2) throw e;
      for (const k of Object.keys((await call(path, {}, "&shallow=true")) || {})) await wipe(call, path + "/" + k, (depth || 0) + 1);
    }
  }
  let running = null;
  function run(tok) {
    if (running) return running;
    running = (async () => {
      const call = api(tok), all = await scan(call), now = Date.now(), old = all.filter(r => !r.t || now - r.t > DAY);
      let done = 0, bad = 0;
      for (const r of old) {
        try { await wipe(call, r.p + "/" + r.c); if (r.p === "rooms") await wipe(call, "presence/sj-" + r.c.toLowerCase()).catch(() => {}); done++; } catch (e) { bad++; }
      }
      const res = { at: Date.now(), rooms: all.length, old: old.length, done, bad };
      ls.set(res); return res;
    })().finally(() => { running = null; });
    return running;
  }
  const last = () => ls.get();
  function auto(tok) { const l = last(); if (l && Date.now() - l.at < 20 * 36e5) return null; return run(tok).catch(() => null); }
  self.FNCL = { run, auto, last };
})();
