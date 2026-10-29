/* Visitor count for the owner's page (only the owner can read the numbers).
   Each phone adds +1 once a day to today's count, once to this week's and once to this month's,
   and +1 once a day for each game it opens. Nothing about the person is sent, only "+1".
   Days follow Saudi time; the week starts on Sunday. Needs firebase-config.js before it. */
(function () {
  "use strict";
  const C = self.FIREBASE_CONFIG, me = document.currentScript;
  if (!C || !C.databaseURL || !self.fetch || !me) return;
  const KEY = "fn-seen";
  let seen;
  try { seen = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return; }   // no storage: counting would repeat on every visit
  const keep = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} };

  // which game: the folder after the site's root (this file sits at the root)
  const root = new URL(".", me.src).pathname;
  const segs = location.pathname.startsWith(root) ? location.pathname.slice(root.length).split("/").filter(s => s && !/\.html$/.test(s)) : [];
  const game = segs[0] === "mind" && segs[1] ? segs[1] : segs[0] || "home";
  if (!/^[a-z]{2,12}$/.test(game)) return;

  function count() {
    const t = new Date(Date.now() + 3 * 36e5);                       // Saudi time
    const day = t.toISOString().slice(0, 10), month = day.slice(0, 7);
    const week = new Date(t.getTime() - t.getUTCDay() * 864e5).toISOString().slice(0, 10);
    const games = seen.d === day && Array.isArray(seen.g) ? seen.g : [];
    const one = { ".sv": { increment: 1 } }, up = {};
    if (seen.d !== day) up["day/" + day] = one;
    if (seen.w !== week) up["week/" + week] = one;
    if (seen.m !== month) up["month/" + month] = one;
    if (!games.includes(game)) up["game/" + day + "/" + game] = one;
    if (!Object.keys(up).length) return;
    const before = seen;
    seen = { d: day, w: week, m: month, g: games.concat(games.includes(game) ? [] : [game]) };
    keep(seen);   // marked first, so leaving the page quickly doesn't count twice; put back if it didn't go
    fetch(C.databaseURL.replace(/\/$/, "") + "/stats.json", { method: "PATCH", body: JSON.stringify(up), keepalive: true })
      .then(r => { if (!r.ok) throw 0; })
      .catch(() => { seen = before; keep(before); });
  }
  if (document.readyState === "complete") setTimeout(count, 800);
  else addEventListener("load", () => setTimeout(count, 800));
})();
