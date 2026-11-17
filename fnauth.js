/* Who is writing: every phone gets a hidden anonymous Firebase account (no sign-in screen), so the database rules can
   tell a room's host from everybody else:
     - a room's state / hidden / secrets are written only by the phone that opened the room (state.u = its uid);
       a room nobody touched for 6 hours can be opened again by someone else (the same 4 letters come back);
     - a player's own entry (players/<pid>) only by that phone (its u), or by the room's host (to remove someone).
   This file signs in, then stamps every write to a room with u (and t, the time, on a room's state).
   Writes wait for the sign-in; if it fails (anonymous sign-in switched off), they go out as before, so nothing breaks
   until the rules ask for it. Loaded after firebase-app/auth/database, before the game's own script. */
(function () {
  "use strict";
  const F = self.firebase;
  if (!F || !F.database || !F.database.Reference) return;
  let uid = null;
  const ready = new Promise(res => {
    if (!F.auth) { res(null); return; }
    let done = false;
    const fin = u => { if (done) return; done = true; uid = u; res(u); };
    // the game's own script starts the Firebase app: sign in once it has
    const go = () => {
      try {
        const a = F.auth();
        a.onAuthStateChanged(u => { if (u) fin(u.uid); else a.signInAnonymously().catch(() => fin(null)); });
      } catch (e) { fin(null); }
    };
    const wait = setInterval(() => { if (F.apps && F.apps.length) { clearInterval(wait); go(); } }, 50);
    setTimeout(() => { clearInterval(wait); fin(null); }, 10000);   // no answer: carry on without (the old open rules still accept it)
  });
  self.FNA = { ready, get uid() { return uid; } };

  // the room paths that carry an owner
  const ROOM = /^\/?(bs|sq|mf|draw|df|jh|hr|night)\/[A-Z]{4}\/(state|hidden|players\/[^/]+|secret\/[^/]+)$|^\/?rooms\/[A-Z0-9]{4,5}$|^\/?presence\/[^/]+\/[^/]+$/;
  const pathOf = r => { try { return decodeURIComponent(new URL(r.toString()).pathname); } catch (e) { return ""; } };
  function stamp(r, v) {
    if (!uid || !v || typeof v !== "object" || Array.isArray(v) || typeof v.j !== "string") return v;
    const p = pathOf(r);
    if (!ROOM.test(p)) return v;
    const o = Object.assign({}, v);
    if (!o.u) o.u = uid;   // a host writing someone else's entry passes that entry's own u along
    if (/\/state$/.test(p) || (/^\/?rooms\//.test(p) && o.t == null)) o.t = F.database.ServerValue.TIMESTAMP;   // the server's clock: when the room was last used
    return o;
  }
  const R = F.database.Reference.prototype;
  const wrap = (name, fn) => { const o = R[name]; if (typeof o !== "function") return; R[name] = function () { const args = arguments, self_ = this; return ready.then(() => fn.call(self_, o, args)); }; };
  wrap("set", function (o, a) { return o.call(this, stamp(this, a[0]), a[1]); });
  wrap("update", function (o, a) { return o.apply(this, a); });
  wrap("remove", function (o, a) { return o.apply(this, a); });
})();
