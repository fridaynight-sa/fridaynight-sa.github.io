/* Friday Night — game moments for every page: confetti, a big "slam" banner, a winner screen,
   numbers that count up, a screen shake, floating toys in the background, tap sounds.
   Games call FA.once(key, fn) so a moment plays once even when the page re-renders. */
(function () {
  "use strict";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const seen = new Set();
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const play = (k, v) => { if (self.FX) FX.play(k, v); };

  // run fn once per key (first sighting of a page state is skipped when the page opens mid-game)
  let ready = false; setTimeout(() => { ready = true; }, 1500);
  function once(key, fn, evenOnLoad) {
    if (seen.has(key)) return; seen.add(key);
    if (!ready && !evenOnLoad) return;
    try { fn(); } catch (e) { console.warn(e); }
  }
  function confetti() {
    if (reduce) return;
    const c = document.createElement("canvas"); c.className = "fn-confetti"; document.body.appendChild(c);
    const x = c.getContext("2d"), W = c.width = innerWidth, H = c.height = innerHeight;
    const cols = ["#7c3aed", "#f03e7a", "#12a874", "#ffb21e", "#1c7ed6", "#ff7a1a"];
    const ps = Array.from({ length: 150 }, () => ({ x: W / 2 + (Math.random() - .5) * 120, y: H * .5, vx: (Math.random() - .5) * 15, vy: -Math.random() * 16 - 6, r: Math.random() * 6 + 4, a: Math.random() * 6, va: (Math.random() - .5) * .4, c: cols[Math.floor(Math.random() * cols.length)] }));
    let t = 0;
    (function f() {
      x.clearRect(0, 0, W, H); t++;
      ps.forEach(p => { p.vy += .45; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.a += p.va; x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.fillStyle = p.c; x.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); x.restore(); });
      if (t < 170) requestAnimationFrame(f); else c.remove();
    })();
  }
  function slam(text, sub, color) {
    document.querySelectorAll(".fn-slam").forEach(e => e.remove());
    const d = document.createElement("div"); d.className = "fn-slam"; d.setAttribute("role", "status");
    if (color) d.style.setProperty("--slam", color);
    d.innerHTML = esc(text) + (sub ? `<small>${esc(sub)}</small>` : "");
    document.body.appendChild(d); setTimeout(() => d.remove(), 2900);
  }
  function shake() { if (reduce) return; document.body.classList.remove("fn-shake"); void document.body.offsetWidth; document.body.classList.add("fn-shake"); }
  function countUp(el, to, from) {
    if (!el) return;
    from = from == null ? 0 : from;
    if (reduce || from === to) { el.textContent = to; return; }
    const t0 = performance.now(), d = 900;
    el.classList.remove("fn-bump"); void el.offsetWidth; el.classList.add("fn-bump");
    (function f(n) { const k = Math.min(1, (n - t0) / d), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(from + (to - from) * e); if (k < 1) requestAnimationFrame(f); })(t0);
  }
  // remember numbers between renders and count up when one grows: FA.numbers(".score .pt", el => key)
  const NUM = {};
  function numbers(sel, keyOf) {
    document.querySelectorAll(sel).forEach((el, i) => {
      const k = sel + "|" + (keyOf ? keyOf(el, i) : i), v = parseInt(el.textContent, 10);
      if (isNaN(v)) return;
      if (NUM[k] != null && v > NUM[k]) countUp(el, v, NUM[k]);
      NUM[k] = v;
    });
  }
  function winner(title, rows, label) {
    document.querySelectorAll(".fn-win").forEach(e => e.remove());
    // a tie at the top names everyone who shares first place
    if (rows && rows.length > 1 && +rows[0][1] === +rows[1][1] && title === rows[0][0]) {
      const top = rows.filter(r => +r[1] === +rows[0][1]).map(r => r[0]);
      title = top.join(" و"); label = "تعادل بين";
    }
    const o = document.createElement("div"); o.className = "fn-win";
    o.innerHTML = `<div class="box"><div class="trophy">🏆</div><p>${esc(label || "الفوز لـ")}</p><h2>${esc(title)}</h2>
      ${rows && rows.length ? `<div class="rows">${rows.slice(0, 5).map(([n, s]) => `<div><span>${esc(n)}</span>${typeof s === "string" ? `<b>${esc(s)}</b>` : `<b data-to="${+s || 0}">0</b>`}</div>`).join("")}</div>` : ""}
      <button type="button">يا سلام 🎉</button></div>`;
    document.body.appendChild(o);
    play("win", [80, 60, 80, 60, 200]);
    setTimeout(() => { o.querySelectorAll("[data-to]").forEach(b => countUp(b, +b.dataset.to)); confetti(); }, 650);
    const close = () => o.remove();
    o.querySelector("button").onclick = close; o.addEventListener("click", e => { if (e.target === o) close(); });
  }
  const right = (msg, sub) => { play("right", [30, 40, 30]); confetti(); if (msg) slam(msg, sub, "#12a874"); };
  const wrong = (msg, sub) => { play("wrong", 120); shake(); if (msg) slam(msg, sub, "#e03131"); };
  const reveal = (msg, sub, color) => { play("reveal", [60, 60, 120]); shake(); slam(msg, sub, color); };

  // background toys + mute button + tap sound on every button
  function decorate() {
    if (!document.querySelector(".fn-bg") && !document.body.classList.contains("tv-plain")) {
      const b = document.createElement("div"); b.className = "fn-bg"; b.setAttribute("aria-hidden", "true");
      b.innerHTML = [["⭐", 6, 6], ["🎲", 20, 90], ["🎈", 62, 3], ["🍿", 82, 88], ["✨", 92, 30], ["🃏", 40, 94]].map(([e, t, l], i) => `<span style="top:${t}%;left:${l}%;animation-delay:-${i * 1.1}s">${e}</span>`).join("");
      document.body.prepend(b);
    }
    if (self.FX) FX.muteButton();
  }
  document.addEventListener("pointerdown", e => { const b = e.target.closest("button:not(.fx-mute):not(:disabled),.mode,a.cell,.cell:not([disabled])"); if (b) play("tap", 8); }, { passive: true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", decorate); else decorate();

  self.FA = { once, confetti, slam, shake, countUp, numbers, winner, right, wrong, reveal, play };
})();
