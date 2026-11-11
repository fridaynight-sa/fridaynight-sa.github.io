/* 🔔 «ملاحظة أو بلاغ» on every page, and the site's error log. Loaded by fnstats.js (so every page has it).
   1) The bell: a round button in the corner; a player writes anything and it goes to the owner's page
      (rep/site/<page key>/<id>, the same place as the old 🚩 reports; only the owner reads them).
   2) Errors: a script error on any phone is written to err/<Saudi day>/<id> (message, page, file:line, phone kind),
      at most 5 per page load, never the same one twice; the owner's page shows them under «⚠️ أخطاء الموقع».
   Not shown on the owner's page or the TV screen (errors there are still written). */
(function () {
  "use strict";
  const C = self.FIREBASE_CONFIG, DB = C && C.databaseURL ? C.databaseURL.replace(/\/$/, "") : "";
  if (!DB || !self.fetch) return;
  const PAGE = self.FN_PAGE || "home";
  const NAMES = { home: "الصفحة الرئيسية", seenjeem: "سين جيم", outside: "برا السالفة", sedq: "صدق ولا كذب", mf: "مين فينا؟", draw: "ارسم وخمّن",
    dafour: "الدافور", jhi: "جماد حيوان إنسان", tv: "شاشة العرض", mind: "Mind Games", lamha: "لمحة", dots: "توصيل النقاط", squares: "تذكّر المربعات",
    words: "لوحة الكلمات", search: "دوّر الكلمة", pick: "صور سين جيم", case: "القضية" };
  const dev = () => { try { const d = (JSON.parse(localStorage.getItem("fn-dev") || "null") || {}).id || ""; return /^[a-z0-9]{16}$/.test(d) ? d : ""; } catch (e) { return ""; } };
  const day = () => new Date(Date.now() + 3 * 36e5).toISOString().slice(0, 10);
  const post = (path, body) => fetch(DB + "/" + path + ".json", { method: "POST", body: JSON.stringify(body), keepalive: true });

  /* ---------- 2) errors ---------- */
  const seen = new Set(); let sent = 0;
  function logErr(msg, where) {
    msg = String(msg || "").slice(0, 300);
    if (!msg || /^Script error\.?$/i.test(msg) || /extension:|chrome-extension|safari-extension/i.test(where || "")) return;
    const id = msg + "|" + where; if (seen.has(id) || sent >= 5) return; seen.add(id); sent++;
    post("err/" + day(), { m: msg, pg: (PAGE + " " + location.pathname).slice(0, 80), ln: String(where || "").slice(0, 120),
      ua: String(navigator.userAgent || "").slice(0, 160), at: Date.now(), d: dev() }).catch(() => {});
  }
  addEventListener("error", e => { if (e && e.message) logErr(e.message, (e.filename || "").replace(location.origin, "") + ":" + (e.lineno || 0) + ":" + (e.colno || 0)); });
  addEventListener("unhandledrejection", e => { const r = e && e.reason; if (r && (r.message || typeof r === "string")) logErr("Promise: " + (r.message || r), (r.stack || "").split("\n")[1] || ""); });

  /* ---------- 1) the bell ---------- */
  if (PAGE === "km165vr7" || PAGE === "tv") return;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clean = t => String(t || "").replace(/[⁠-⁤]/g, "").replace(/\s+/g, " ").trim();
  function key(t) { let h = 5381; for (const ch of clean(t)) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0; return "k" + h.toString(36); }
  const BELL = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.2a1.4 1.4 0 0 1 1.4 1.4v.5a6 6 0 0 1 4.6 5.9v3.4l1.7 2.6a.8.8 0 0 1-.7 1.2H5a.8.8 0 0 1-.7-1.2L6 14.4V11a6 6 0 0 1 4.6-5.9v-.5A1.4 1.4 0 0 1 12 3.2z"/><path d="M9.8 18.2a2.3 2.3 0 0 0 4.4 0"/></svg>';
  function start() {
    if (document.querySelector(".fnb")) return;
    // the page's own look: a dark page (Mind Games) gets a see-through bell, a light one the site's outlined button
    const rgb = (getComputedStyle(document.body).backgroundColor.match(/\d+/g) || [255, 255, 255]).map(Number);
    const dark = rgb.length >= 3 && rgb[0] * .3 + rgb[1] * .59 + rgb[2] * .11 < 120 && rgb[3] !== 0;
    const st = document.createElement("style");
    st.textContent = `.fnb{position:fixed;right:14px;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:70;width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;
${dark ? "background:rgba(255,255,255,.14);color:#fff;border:1.5px solid rgba(255,255,255,.35);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);box-shadow:0 6px 20px rgba(0,0,0,.35)" : "background:#fff;color:#2b1745;border:2.5px solid #2b1745;box-shadow:3px 3px 0 #2b1745"}}
.fnb:active{transform:translateY(2px)}
.fnb-sheet{position:fixed;inset:0;z-index:90;background:rgba(20,10,40,.55);display:flex;align-items:flex-end;justify-content:center}
.fnb-box{width:100%;max-width:520px;box-sizing:border-box;background:${dark ? "#1d1846" : "#fff"};color:${dark ? "#eef1ff" : "#2b1745"};border-radius:22px 22px 0 0;padding:16px 16px calc(22px + env(safe-area-inset-bottom,0px));font-weight:700;font-family:inherit;direction:rtl;text-align:right}
.fnb-box b{font-size:19px;display:flex;gap:8px;align-items:center}.fnb-box p{margin:6px 0 0;opacity:.75;font-size:14px}
.fnb-box textarea{display:block;width:100%;box-sizing:border-box;margin-top:12px;border:2px solid ${dark ? "rgba(255,255,255,.25)" : "#ecdcf6"};background:${dark ? "rgba(0,0,0,.25)" : "#fff"};color:inherit;border-radius:12px;padding:10px;font:inherit;font-size:16px;resize:vertical}
.fnb-go{display:flex;gap:8px;margin-top:10px}.fnb-go button{flex:1;border-radius:14px;padding:12px;font:inherit;font-weight:800;font-size:16px;cursor:pointer;border:2px solid currentColor;background:transparent;color:inherit}
.fnb-go .fnb-send{background:${dark ? "linear-gradient(90deg,#7c5cff,#3ec6ff)" : "#7c3aed"};color:#fff;border-color:transparent}.fnb-send:disabled{opacity:.45}
.fnb-msg{color:#e03131;min-height:1em}`;
    document.head.appendChild(st);
    const b = document.createElement("button");
    b.type = "button"; b.className = "fnb"; b.innerHTML = BELL; b.setAttribute("aria-label", "ملاحظة أو بلاغ"); b.title = "ملاحظة أو بلاغ";
    document.body.appendChild(b);
    b.addEventListener("click", open);
    // a bar fixed at the bottom of the page (like «حمّل Friday Night») would cover it: sit just above such a bar
    const lift = () => {
      let top = innerHeight;
      for (const el of document.body.children) {
        if (el === b || el.classList.contains("fnb-sheet") || el.classList.contains("fnr-sheet")) continue;
        const cs = getComputedStyle(el); if (cs.position !== "fixed" || cs.display === "none" || cs.visibility === "hidden") continue;
        const r = el.getBoundingClientRect();
        if (r.height && r.height < innerHeight * .45 && r.bottom >= innerHeight - 30 && r.right > innerWidth - 80 && r.left < innerWidth - 20) top = Math.min(top, r.top);
      }
      b.style.bottom = top < innerHeight ? `${Math.round(innerHeight - top + 10)}px` : "";
    };
    lift(); setInterval(lift, 1000); addEventListener("resize", lift);
  }
  function open() {
    const d = document.createElement("div"); d.className = "fnb-sheet";
    d.innerHTML = `<div class="fnb-box" role="dialog" aria-label="ملاحظة أو بلاغ"><b>${BELL} ملاحظة أو بلاغ</b><p>توصل لصاحب الموقع على طول.</p>
      <textarea class="fnb-n" rows="4" maxlength="300" placeholder="اكتب ملاحظتك أو أي مشكلة…"></textarea>
      <div class="fnb-go"><button type="button" class="fnb-send" disabled>أرسل</button><button type="button" class="fnb-x">إلغاء</button></div><p class="fnb-msg"></p></div>`;
    document.body.appendChild(d);
    const ta = d.querySelector("textarea"), send = d.querySelector(".fnb-send");
    ta.addEventListener("input", () => { send.disabled = !clean(ta.value); });
    setTimeout(() => ta.focus(), 50);
    d.addEventListener("click", async e => {
      if (e.target === d || e.target.closest(".fnb-x")) { d.remove(); return; }
      if (!e.target.closest(".fnb-send") || !clean(ta.value)) return;
      send.disabled = true;
      const name = NAMES[PAGE] || PAGE, where = name.slice(0, 400);
      try {
        const r = await post("rep/site/" + key(name), { q: where, a: location.pathname.slice(0, 120), r: "ملاحظة", n: clean(ta.value).slice(0, 300), at: Date.now(), d: dev() });
        if (!r.ok) throw 0;
        d.querySelector(".fnb-box").innerHTML = `<b>✅ وصلت، شكراً!</b><p>صاحب الموقع بيشوفها.</p>`; setTimeout(() => d.remove(), 1500);
      } catch (er) { send.disabled = false; d.querySelector(".fnb-msg").textContent = "ما وصلت. تأكد من النت وجرّب مرة ثانية."; }
    });
  }
  if (document.body) start(); else addEventListener("DOMContentLoaded", start);
})();
