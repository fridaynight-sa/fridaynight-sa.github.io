/* «🚩»: a player writes any problem with a question or a word, in his own words.
   It goes to rep/<game>/<key>/<id> = {q, a, r, n, at, d}; only the owner reads it, on his page (km165vr7/).
   The owner can take it out of the game: cfg/off/<game>/<key> = the text, and the games leave it out (FNR.hidden).
   Needs firebase-config.js. Used by الدافور، صدق ولا كذب، مين فينا؟، برا السالفة، ارسم وخمّن.
   FNR.button(game, question, answer) → a small button; FNR.hidden(game, text) → true when the owner took it out. */
(function () {
  "use strict";
  const C = self.FIREBASE_CONFIG, DB = C && C.databaseURL ? C.databaseURL.replace(/\/$/, "") : "";
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clean = t => String(t || "").replace(/[⁠-⁤]/g, "").replace(/\s+/g, " ").trim();
  // the same text always gives the same short key
  function key(t) { let h = 5381; for (const ch of clean(t)) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0; return "k" + h.toString(36); }
  function off(game) { try { const c = JSON.parse(localStorage.getItem("fn-cfg") || "null") || {}; return (c.off && c.off[game]) || {}; } catch (e) { return {}; } }
  const hidden = (game, t) => !!off(game)[key(t)];
  const button = (game, q, a) => false && DB ?   // the 🚩 on each question is gone (the owner's choice, Nov 2026): the 🔔 on every page replaces it
    `<button type="button" class="fnr-btn" data-fnr="${esc(game)}" data-q="${esc(clean(q))}" data-a="${esc(clean(a || ""))}" aria-label="فيه مشكلة؟ اكتبها" title="فيه مشكلة؟">🚩</button>` : "";
  const sent = new Set();
  function sheet(b) {
    const g = b.dataset.fnr, q = b.dataset.q, a = b.dataset.a, k = key(q);
    if (sent.has(g + k)) return;
    const d = document.createElement("div"); d.className = "fnr-sheet";
    d.innerHTML = `<div class="fnr-box" role="dialog" aria-label="اكتب المشكلة"><b>🚩 وش المشكلة؟</b><p class="fnr-q">${esc(q)}${a ? `<br><small>الجواب: ${esc(a)}</small>` : ""}</p>
      <textarea class="fnr-n" maxlength="300" rows="3" placeholder="اكتب أي مشكلة…"></textarea><div class="fnr-go"><button type="button" class="fnr-send" disabled>أرسل</button><button type="button" class="fnr-x">إلغاء</button></div><p class="fnr-msg"></p></div>`;
    document.body.appendChild(d);
    const ta = d.querySelector(".fnr-n"), send = d.querySelector(".fnr-send");
    ta.addEventListener("input", () => { send.disabled = !clean(ta.value); });
    setTimeout(() => ta.focus(), 50);
    d.addEventListener("click", async e => {
      const t = e.target.closest("button"); if (e.target === d) { d.remove(); return; } if (!t) return;
      if (t.classList.contains("fnr-x")) { d.remove(); return; }
      if (t.classList.contains("fnr-send") && clean(ta.value)) {
        t.disabled = true;
        let dev = ""; try { dev = (JSON.parse(localStorage.getItem("fn-dev") || "null") || {}).id || ""; } catch (er) {}
        const body = { q: q.slice(0, 400), a: a.slice(0, 120), r: "مشكلة", n: clean(ta.value).slice(0, 300), at: Date.now(), d: /^[a-z0-9]{16}$/.test(dev) ? dev : "" };
        try {
          const res = await fetch(DB + "/rep/" + g + "/" + k + ".json", { method: "POST", body: JSON.stringify(body) });
          if (!res.ok) throw 0;
          sent.add(g + k); b.textContent = "✅"; b.disabled = true;
          d.querySelector(".fnr-box").innerHTML = `<b>✅ وصل، شكراً!</b><p class="fnr-q">صاحب الموقع بيشوفه ويصلحه.</p>`; setTimeout(() => d.remove(), 1500);
        } catch (er) { t.disabled = false; d.querySelector(".fnr-msg").textContent = "ما وصل. تأكد من النت وجرّب مرة ثانية."; }
      }
    });
  }
  document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("[data-fnr]"); if (b && !b.disabled) sheet(b); });
  const st = document.createElement("style");
  st.textContent = ".fnr-btn{display:block;margin:10px auto 0;width:40px;height:40px;border-radius:50%;border:2px solid #ecdcf6;background:#fff;font-size:18px;line-height:1;cursor:pointer;opacity:.75}" +
    ".fnr-btn:disabled{opacity:1;border-color:#12a874}" +
    ".fnr-sheet{position:fixed;inset:0;z-index:80;background:rgba(43,23,69,.55);display:flex;align-items:flex-end;justify-content:center}" +
    ".fnr-box{width:100%;max-width:520px;background:#fff;border-radius:22px 22px 0 0;border:3px solid #2b1745;border-bottom:0;padding:16px 16px 22px;color:#2b1745;font-weight:700}" +
    ".fnr-box>b{font-size:19px}.fnr-q{background:#f6eafd;border-radius:12px;padding:8px 12px;margin:10px 0}.fnr-q small{color:#7b6890}" +
    ".fnr-n{display:block;width:100%;box-sizing:border-box;margin-top:10px;border:2px solid #ecdcf6;border-radius:12px;padding:10px;font:inherit;font-size:16px;resize:vertical}" +
    ".fnr-go{display:flex;gap:8px;margin-top:10px}.fnr-go button{flex:1;border-radius:14px;padding:12px;font:inherit;font-weight:800;font-size:16px;cursor:pointer;border:2px solid #2b1745}" +
    ".fnr-send{background:#e03131;color:#fff}.fnr-send:disabled{opacity:.4}.fnr-x{background:#fff;color:#2b1745}.fnr-msg{color:#e03131;margin:8px 0 0;min-height:1em}";
  (document.head || document.documentElement).appendChild(st);
  self.FNR = { button, hidden, key };
})();
