/* What the owner's page (km165vr7/) needs from every page of the site. Only the owner's account can read any of it.
   1) Visitor count: each phone adds +1 once a day to today's count, once to this week's and once to this month's,
      and +1 once a day for each game it opens (stats/).
   2) «مين دخل»: each phone keeps one record (dev/<random id>): what kind of phone, its network and city,
      when it came and for how long, which games, the names it typed in the games.
   3) The owner's controls: a phone the owner stopped for a while (ban/<id>) sees «موقوف مؤقتاً»;
      a game the owner hid (cfg/hide/<game>) disappears from the lists, and its page says it is closed for now.
   4) Text next to a name: the owner writes it for any phone (tag/<id>) and for himself (cfg/me/t). It is added to
      the name when the player joins a room, so every game, the TV and the night show it. The owner's own picture
      (cfg/me/img) shows next to his name everywhere: his name carries an invisible mark (U+2060) that this file
      turns into the picture on every phone.
   Days follow Saudi time; the week starts on Sunday. Needs firebase-config.js before it. */
(function () {
  "use strict";
  const C = self.FIREBASE_CONFIG, me = document.currentScript;
  if (!C || !C.databaseURL || !self.fetch || !me) return;
  const DB = C.databaseURL.replace(/\/$/, "");
  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };
  try { localStorage.getItem("x"); } catch (e) { return; }   // no storage: nothing here can work properly
  // keepalive lets it finish even if the page closes; a browser that refuses that gets a plain request
  const patch = (path, body) => {
    const u = DB + "/" + path + ".json", o = { method: "PATCH", body: JSON.stringify(body) };
    return fetch(u, Object.assign({ keepalive: true }, o)).catch(() => fetch(u, o)).then(r => { if (!r.ok) throw 0; });
  };
  const get = path => fetch(DB + "/" + path + ".json").then(r => r.ok ? r.json() : Promise.reject(0));

  // which game: the folder after the site's root (this file sits at the root)
  const root = new URL(".", me.src).pathname;
  const segs = location.pathname.startsWith(root) ? location.pathname.slice(root.length).split("/").filter(s => s && !/\.html$/.test(s)) : [];
  const game = segs[0] === "mind" && segs[1] ? segs[1] : segs[0] || "home";
  if (!/^[a-z]{2,12}$/.test(game)) return;
  const MIND = ["lamha", "dots", "squares", "words"];

  const sa = () => new Date(Date.now() + 3 * 36e5);                   // Saudi time
  const today = () => sa().toISOString().slice(0, 10);

  /* ---------- 1) visitor count ---------- */
  function count() {
    const seen = ls.get("fn-seen") || {};
    const t = sa(), day = t.toISOString().slice(0, 10), month = day.slice(0, 7);
    const week = new Date(t.getTime() - t.getUTCDay() * 864e5).toISOString().slice(0, 10);
    const games = seen.d === day && Array.isArray(seen.g) ? seen.g : [];
    const one = { ".sv": { increment: 1 } }, up = {};
    if (seen.d !== day) up["day/" + day] = one;
    if (seen.w !== week) up["week/" + week] = one;
    if (seen.m !== month) up["month/" + month] = one;
    if (!games.includes(game)) up["game/" + day + "/" + game] = one;
    if (!Object.keys(up).length) return;
    ls.set("fn-seen", { d: day, w: week, m: month, g: games.concat(games.includes(game) ? [] : [game]) });   // marked first, so leaving quickly doesn't count twice
    patch("stats", up).catch(() => ls.set("fn-seen", seen));                                              // put back if it didn't go
  }

  /* ---------- 2) this phone's record ---------- */
  let D = ls.get("fn-dev");
  if (!D || !/^[a-z0-9]{16}$/.test(D.id || "")) {
    D = { id: Array.from(crypto.getRandomValues(new Uint8Array(16)), b => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join(""), f: Date.now() };
    if (!ls.set("fn-dev", D)) return;
  }
  const IPHONE = { "320x568": "4", "375x667": "4.7", "414x736": "5.5", "375x812": "5.8", "414x896@2": "6.1", "414x896@3": "6.5", "390x844": "6.1", "393x852": "6.1",
    "402x874": "6.3", "420x912": "6.5", "428x926": "6.7", "430x932": "6.7", "440x956": "6.9" };
  const GALAXY = { S901: "S22", S906: "S22+", S908: "S22 Ultra", S911: "S23", S916: "S23+", S918: "S23 Ultra", S921: "S24", S926: "S24+", S928: "S24 Ultra",
    S931: "S25", S936: "S25+", S938: "S25 Ultra", S711: "S23 FE", S721: "S24 FE", G991: "S21", G996: "S21+", G998: "S21 Ultra", G990: "S21 FE",
    F946: "Z Fold5", F956: "Z Fold6", F731: "Z Flip5", F741: "Z Flip6", A546: "A54", A556: "A55", A566: "A56", A346: "A34", A356: "A35", A536: "A53", A256: "A25", A155: "A15", A057: "A05s" };
  function phone(model) {
    const ua = navigator.userAgent || "", w = Math.min(screen.width, screen.height), h = Math.max(screen.width, screen.height), dpr = Math.round(devicePixelRatio || 1);
    let dev;
    if (/iPhone/.test(ua)) { const k = w + "x" + h, inch = IPHONE[k + "@" + dpr] || IPHONE[k]; dev = "آيفون" + (inch ? ` (شاشة ${inch} إنش)` : ""); }
    else if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) dev = "آيباد";
    else if (/SmartTV|SMART-TV|Tizen|Web0S|webOS|BRAVIA|AFT\w|Android TV|GoogleTV|CrKey/i.test(ua)) dev = "تلفزيون";
    else if (/Android/.test(ua)) {
      const m = model || ((/Android [^;)]*; ([^;)]+?)(?: Build[^;)]*)?\)/.exec(ua) || [])[1] || "").trim();
      const sm = /^SM-([A-Z]\d{3})/.exec(m);
      dev = sm ? "سامسونج " + (GALAXY[sm[1]] ? "Galaxy " + GALAXY[sm[1]] : m) : (m && m !== "K" ? m : /Mobile/.test(ua) ? "جوال أندرويد" : "تابلت أندرويد");
    }
    else if (/Windows/.test(ua)) dev = "كمبيوتر ويندوز";
    else if (/Macintosh/.test(ua)) dev = "ماك";
    else if (/CrOS/.test(ua)) dev = "كروم بوك";
    else dev = "كمبيوتر";
    const br = /FBAN|FBAV/.test(ua) ? "من داخل فيسبوك" : /Instagram/.test(ua) ? "من داخل انستقرام" : /Snapchat/.test(ua) ? "من داخل سناب" : /TikTok|musical_ly|BytedanceWebview/.test(ua) ? "من داخل تيك توك"
      : /EdgiOS|Edg\//.test(ua) ? "Edge" : /FxiOS|Firefox/.test(ua) ? "Firefox" : /SamsungBrowser/.test(ua) ? "متصفح سامسونج" : /OPR\/|Opera/.test(ua) ? "Opera"
      : /CriOS|Chrome/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "";
    const app = navigator.standalone || (self.matchMedia && matchMedia("(display-mode: standalone)").matches);
    return (dev + (br ? " · " + br : "") + (app ? " · من أيقونة الموقع" : "")).slice(0, 120);
  }
  // the names this phone typed in the games (each game keeps the last one)
  function names() {
    const out = [];
    ["bs-me-v1", "sq-me-v1", "mf-me-v1", "draw-me-v1", "df-me-v1", "fn-night-v1", "seenjeem-remote-v1"].forEach(k => {
      const v = ls.get(k), n = v && typeof v.name === "string" ? base(v.name).slice(0, 30) : "";
      if (n && !out.includes(n)) out.push(n);
    });
    return out.slice(0, 6).join("، ");
  }
  // the phone's network company and city, once a day (from a free outside service; skipped if it doesn't answer)
  const ISP = [[/saudi telecom|\bstc\b/i, "STC"], [/mobily|etihad etisalat/i, "موبايلي"], [/zain/i, "زين"], [/salam|integrated telecom/i, "سلام"],
    [/virgin/i, "فيرجن"], [/lebara/i, "ليبارا"], [/go telecom|atheeb/i, "GO"], [/dawiyat/i, "ضوئيات"]];
  const CITY = { Riyadh: "الرياض", Jeddah: "جدة", Mecca: "مكة", Makkah: "مكة", Medina: "المدينة", "Al Madinah": "المدينة", Dammam: "الدمام", "Al Khobar": "الخبر",
    Khobar: "الخبر", Dhahran: "الظهران", Taif: "الطائف", "At Taif": "الطائف", Tabuk: "تبوك", Abha: "أبها", Buraidah: "بريدة", Buraydah: "بريدة", Hail: "حائل",
    "Ha'il": "حائل", Jazan: "جازان", Jizan: "جازان", Najran: "نجران", Hofuf: "الأحساء", "Al Hofuf": "الأحساء", "Al Ahsa": "الأحساء", Jubail: "الجبيل",
    "Al Jubayl": "الجبيل", Yanbu: "ينبع", "Al Kharj": "الخرج", "Khamis Mushait": "خميس مشيط", Qatif: "القطيف", "Al Qatif": "القطيف", Unaizah: "عنيزة",
    "Al Bahah": "الباحة", Sakaka: "سكاكا", Arar: "عرعر", Kuwait: "الكويت", "Kuwait City": "الكويت", Dubai: "دبي", Doha: "الدوحة", Manama: "المنامة", Muscat: "مسقط", "Abu Dhabi": "أبوظبي" };
  async function network() {
    if (D.b && D.bd === today()) return D.b;
    const tries = [["https://get.geojs.io/v1/ip/geo.json", d => [d.organization_name || d.organization, d.city]],
      ["https://ipwho.is/", d => [d.connection && (d.connection.isp || d.connection.org), d.city]]];
    for (const [u, pick] of tries) {
      try {
        const ctl = self.AbortController ? new AbortController() : null; if (ctl) setTimeout(() => ctl.abort(), 5000);
        const r = await fetch(u, ctl ? { signal: ctl.signal } : {}); if (!r.ok) continue;
        let [isp, city] = pick(await r.json());
        isp = String(isp || "").replace(/^AS\d+\s*/, ""); city = String(city || "");
        const i = ISP.find(([re]) => re.test(isp));
        const b = [i ? i[1] : isp.slice(0, 40), CITY[city] || city.slice(0, 40)].filter(Boolean).join(" · ");
        if (b) { D.b = b; D.bd = today(); ls.set("fn-dev", D); return b; }
      } catch (e) {}
    }
    return D.b || "";
  }
  async function visit() {
    const now = Date.now(), up = {};
    if (!D.l || now - D.l > 30 * 60e3) {                       // a new visit (away for half an hour or more)
      const mon = today().slice(0, 7);
      D.s = now; D.gs = []; D.m = D.m && D.m.k === mon ? D.m : { k: mon, n: 0 }; D.m.n++;
      up.s = now; up["m/" + mon] = D.m.n; up.f = D.f || now;
      let model = "";
      try { if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) model = (await navigator.userAgentData.getHighEntropyValues(["model"])).model || ""; } catch (e) {}
      up.a = phone(model);
    }
    D.gs = D.gs || []; D.g = D.g || {};
    if (!["home", "mind"].includes(game) && !D.gs.includes(game)) { D.gs.push(game); D.g[game] = (D.g[game] || 0) + 1; up["g/" + game] = D.g[game]; }
    const n = names(); if (n) up.n = n;
    try { const w = ls.get("words-v1"); if (w && w.level) up.w = Math.min(+w.level || 1, 9999); } catch (e) {}
    D.l = now; up.l = now; if (D.b) up.b = D.b; ls.set("fn-dev", D);
    patch("dev/" + D.id, up).catch(() => {});
    const old = D.b, b = await network();
    if (b && b !== old) patch("dev/" + D.id, { b }).catch(() => {});
  }
  function beat() {                                              // still here: every minute while the page is on screen
    if (document.hidden) return;
    if (Date.now() - (D.l || 0) > 30 * 60e3) { visit(); return; }
    D.l = Date.now(); ls.set("fn-dev", D);
    patch("dev/" + D.id, { l: D.l }).catch(() => {});
    checkBan();
  }

  /* ---------- 3) the owner's controls ---------- */
  const DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const when = ms => { const t = new Date(ms + 3 * 36e5), h = t.getUTCHours(), m = t.getUTCMinutes();
    return `${DAYS[t.getUTCDay()]} الساعة <bdi>${h % 12 || 12}:${String(m).padStart(2, "0")}</bdi> ${h < 12 ? "ص" : "م"}`; };
  function cover(id, html) {
    if (!document.body) { addEventListener("DOMContentLoaded", () => cover(id, html)); return; }
    let el = document.getElementById(id);
    if (!html) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement("div"); el.id = id; el.setAttribute("role", "alertdialog");
      el.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:24px;background:#2b1745;color:#fff;text-align:center;font-family:Almarai,Tajawal,system-ui,sans-serif;direction:rtl";
      document.body.appendChild(el);
    }
    el.innerHTML = `<div style="max-width:420px">${html}</div>`;
  }
  function checkBan() {
    get("ban/" + D.id).then(b => {
      const on = b && b.u > Date.now();
      cover("fn-ban", on ? `<div style="font-size:64px;line-height:1.2">🚫</div><h1 style="font-size:28px;margin:10px 0 6px">موقوف مؤقتاً</h1>
        <p style="font-size:18px;font-weight:700;opacity:.9;margin:0">ترجع تقدر تدخل ${when(b.u)}</p>` : "");
      if (on) { clearTimeout(checkBan.t); checkBan.t = setTimeout(checkBan, Math.min(b.u - Date.now() + 2000, 60e3)); }
    }).catch(() => {});
  }
  // hidden games: gone from every list right away (last known list), and their own page says they're closed
  function hide(h) {
    const off = Object.keys(h || {}).filter(k => h[k] === true && /^[a-z]{2,12}$/.test(k));
    if (off.includes("mind")) MIND.forEach(k => { if (!off.includes(k)) off.push(k); });
    let st = document.getElementById("fn-hide");
    if (!st) { st = document.createElement("style"); st.id = "fn-hide"; (document.head || document.documentElement).appendChild(st); }
    st.textContent = off.map(k => `a[href="${k}/"],a[href$="/${k}/"],a[href^="${k}/#"],a[href*="/${k}/#"],.fn-ng [data-g="${k}"]`).join(",") + (off.length ? "{display:none!important}" : "");
    return off;
  }
  hide((ls.get("fn-cfg") || {}).hide);
  get("cfg").then(c => {
    ls.set("fn-cfg", c || {});
    pictures();
    const off = hide((c || {}).hide);
    cover("fn-closed", off.includes(game) ? `<div style="font-size:64px;line-height:1.2">🚧</div><h1 style="font-size:28px;margin:10px 0 6px">هذي اللعبة مقفلة مؤقتاً</h1>
      <p style="font-size:17px;font-weight:700;opacity:.9;margin:0 0 18px">جرّب لعبة ثانية من الصفحة الرئيسية.</p>
      <a href="${root}" style="display:inline-block;background:#ffb21e;color:#2b1745;border-radius:14px;padding:10px 22px;font-weight:800;font-size:17px;text-decoration:none">الصفحة الرئيسية</a>` : "");
  }).catch(() => {});
  checkBan();

  /* ---------- 4) text and picture next to a name ---------- */
  const MARK = "\u2060";                                          // invisible: «this is the owner»
  function base(n) { return String(n || "").replace(/\u2060/g, "").split("·")[0].trim(); }
  const isOwner = () => { try { return localStorage.getItem("fn-owner") === "1"; } catch (e) { return false; } };
  const mine = () => ((ls.get("fn-cfg") || {}).me || {});
  function show(n) {
    const b = base(n); if (!b) return b;
    const t = isOwner() ? mine().t : ls.get("fn-tag");
    return b + (t ? " · " + t : "") + (isOwner() ? MARK : "");
  }
  // the name box of every game: what was typed, plus the text (the games read the box right after this)
  const BOX = ["fName", "jName"];
  const fix = el => { if (el && typeof el.value === "string" && el.value.trim()) el.value = show(el.value); };
  document.addEventListener("click", e => {
    const b = e.target && e.target.closest && e.target.closest('[data-act="docreate"],[data-act="dojoin"],#jGo');
    if (b) BOX.forEach(id => fix(document.getElementById(id)));
  }, true);
  document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target && BOX.includes(e.target.id)) fix(e.target); }, true);
  document.addEventListener("focusin", e => { const t = e.target; if (t && BOX.includes(t.id) && t.value) t.value = base(t.value); }, true);
  getTag(); function getTag() { get("tag/" + D.id).then(t => ls.set("fn-tag", typeof t === "string" ? t : null)).catch(() => {}); }
  // the owner's picture wherever his name is written
  const pic = () => { const i = mine().img; return typeof i === "string" && i.startsWith("data:image/") ? i : ""; };
  function decorate(root) {
    const src = pic(); if (!src || !root) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => n.nodeValue.includes(MARK) && n.parentNode && !/^(SCRIPT|STYLE|TEXTAREA|OPTION|TITLE)$/.test(n.parentNode.nodeName) ? 1 : 3 });
    const found = []; while (w.nextNode()) found.push(w.currentNode);
    for (let t of found) {
      let i;
      while ((i = t.nodeValue.indexOf(MARK)) >= 0) {
        const rest = t.splitText(i); rest.nodeValue = rest.nodeValue.slice(1);
        const img = document.createElement("img"); img.className = "fn-av"; img.src = src; img.alt = "";
        rest.parentNode.insertBefore(img, rest); t = rest;
      }
    }
  }
  function pictures() {
    if (!pic() || pictures.on || !self.MutationObserver) return;
    pictures.on = true;
    const st = document.createElement("style");
    st.textContent = ".fn-av{display:inline-block;width:1.35em;height:1.35em;border-radius:50%;object-fit:cover;vertical-align:-.32em;margin-inline:.25em;border:2px solid #ffb21e;background:#fff}";
    (document.head || document.documentElement).appendChild(st);
    const run = () => { decorate(document.body); new MutationObserver(ms => ms.forEach(m => decorate(m.type === "characterData" ? m.target.parentNode : m.target))).observe(document.body, { childList: true, subtree: true, characterData: true }); };
    document.body ? run() : addEventListener("DOMContentLoaded", run);
  }
  pictures();
  self.FNT = { base, show };

  function start() { setTimeout(() => { count(); visit(); }, 800); setInterval(beat, 60e3); }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) beat(); });
  if (document.readyState === "complete") start(); else addEventListener("load", start);
})();
