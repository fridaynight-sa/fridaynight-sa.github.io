/* الدافور on the TV as a quiz show: a dark studio stage, names that pop in, the question that lands, four colour tiles,
   a big ring that counts down (ticks in the last five seconds), lights for who has answered, a drumroll before the answer,
   the right tile glowing, then the standings moving into their new places, and a podium at the end.
   The stage is built once per step (lobby / a question / its answer / the end) and only small parts change in between,
   so nothing restarts when a player answers.   DFShow.update(el, {S, P, nameOf, stepStart}) */
(function () {
  "use strict";
  const Q_S = 20;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const play = k => { if (self.FX) FX.play(k); };
  const L = ["أ", "ب", "ج", "د"], COLS = ["#7c3aed", "#f03e7a", "#1c7ed6", "#ff7a1a"];
  const later = (ms, f) => { const t = setTimeout(f, reduce ? 0 : ms); timers.push(t); };
  let key = "", timers = [], ring = null, lastTick = -1, seenNames = new Set(), answered = new Set(), prevOrder = null;

  const css = document.createElement("style");
  css.textContent = `
body.dfshow{background:#120a2e;color:#fff}
body.dfshow::before{content:"";position:fixed;inset:-50%;z-index:-1;background:
 conic-gradient(from 0deg at 50% 50%,rgba(124,58,237,.0) 0 10deg,rgba(124,58,237,.18) 10deg 20deg,rgba(124,58,237,0) 20deg 40deg,rgba(255,178,30,.10) 40deg 50deg,rgba(124,58,237,0) 50deg 70deg) ,
 radial-gradient(circle at 50% 40%,#3b1a78 0,#120a2e 60%);animation:dfspin 60s linear infinite}
@keyframes dfspin{to{transform:rotate(360deg)}}
body.dfshow .fn-bg{display:none}
body.dfshow header .brand,body.dfshow .gamesbar{opacity:.55}
body.dfshow .card.side{background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.18);box-shadow:none}
body.dfshow .card.side .code{color:#ffd166}body.dfshow .card.side .note,body.dfshow .card.side .lbl{color:#cbbdf0}
body.dfshow .chip{background:rgba(255,255,255,.12);color:#e9e2ff}
.dfs{position:relative;z-index:2;min-height:70vh;font-family:var(--f-display)}
.dfs.dfsb .dfs-q,.dfs.dfsb .dfs-opt.dim,.dfs.dfsb .dfs-note{display:none}.dfs.dfsb .dfs-opts{grid-template-columns:1fr;max-width:620px;margin-inline:auto}.dfs.dfsb .dfs-banner{margin-top:14px}
.dfs-top{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:clamp(18px,2.2vw,28px);font-weight:800;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.5)}
.dfs-top b{color:#ffd166}
.dfs-title{text-align:center;margin:10px 0 0}
.dfs-title img{width:clamp(90px,12vw,150px);height:auto;filter:drop-shadow(0 10px 30px rgba(255,178,30,.35));animation:dfbob 3s ease-in-out infinite}
.dfs-title h1{font-size:clamp(44px,6vw,86px);margin:6px 0 0;color:#fff;text-shadow:0 6px 0 #5b21b6,0 0 40px rgba(124,58,237,.7)}
.dfs-title p{font-size:clamp(18px,2vw,28px);color:#cbbdf0;margin:4px 0 0;font-weight:800}
@keyframes dfbob{50%{transform:translateY(-10px) rotate(-3deg)}}
.dfs-plates{display:flex;flex-wrap:wrap;gap:14px;justify-content:center;margin-top:28px}
.dfs-plate{background:linear-gradient(180deg,#2a1563,#1d0f47);border:2px solid #7c3aed;border-radius:18px;padding:12px 26px;font-size:clamp(20px,2.4vw,34px);font-weight:800;box-shadow:0 0 24px rgba(124,58,237,.45)}
.dfs-plate.pop{animation:dfpop .6s cubic-bezier(.2,1.6,.4,1) both}
@keyframes dfpop{0%{transform:scale(.2) translateY(30px);opacity:0}100%{transform:none;opacity:1}}
.dfs-q{position:relative;margin:18px auto 0;max-width:1100px;background:linear-gradient(180deg,#fff,#efe7ff);color:#2b1745;border-radius:28px;padding:28px 34px;
 font-size:clamp(26px,3.4vw,52px);font-weight:800;line-height:1.35;text-align:center;box-shadow:0 0 0 6px #ffd166,0 20px 60px rgba(0,0,0,.45)}
.dfs-q.land{animation:dfland .7s cubic-bezier(.2,1.4,.4,1) both}
@keyframes dfland{0%{transform:translateY(-60px) scale(.8);opacity:0}100%{transform:none;opacity:1}}
.dfs-mid{display:grid;grid-template-columns:1fr auto;gap:22px;align-items:center;margin-top:22px}
.dfs-opts{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.dfs-opt{--c:#7c3aed;position:relative;display:flex;align-items:center;gap:14px;background:linear-gradient(180deg,color-mix(in srgb,var(--c) 85%,#fff),var(--c));
 border-radius:20px;padding:16px 20px;font-size:clamp(20px,2.4vw,38px);font-weight:800;color:#fff;box-shadow:0 8px 0 color-mix(in srgb,var(--c) 60%,#000);transition:opacity .5s,transform .5s,filter .5s}
.dfs-opt b{flex:none;width:1.6em;height:1.6em;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.25)}
.dfs-opt.in{animation:dfslide .5s ease-out both}
@keyframes dfslide{0%{transform:translateX(60px);opacity:0}100%{transform:none;opacity:1}}
.dfs-opt.dim{opacity:.22;filter:grayscale(.7);transform:scale(.96)}
.dfs-opt.win{--c:#12a874;transform:scale(1.06);box-shadow:0 8px 0 #0a6b49,0 0 0 6px #b6ffdf,0 0 60px rgba(18,168,116,.9);animation:dfglow 1s ease-in-out infinite alternate}
@keyframes dfglow{to{box-shadow:0 8px 0 #0a6b49,0 0 0 10px #b6ffdf,0 0 90px rgba(18,168,116,1)}}
.dfs-opt small{position:absolute;bottom:-14px;inset-inline-start:16px;font-size:clamp(13px,1.3vw,18px);background:#120a2e;color:#fff;border:1.5px solid rgba(255,255,255,.35);border-radius:999px;padding:2px 12px;white-space:nowrap;max-width:90%;overflow:hidden;text-overflow:ellipsis}
.dfs-ring{position:relative;width:clamp(130px,14vw,210px);aspect-ratio:1}
.dfs-ring svg{width:100%;height:100%;transform:rotate(-90deg)}
.dfs-ring circle{fill:none;stroke-width:12}
.dfs-ring .bg{stroke:rgba(255,255,255,.12)}.dfs-ring .fg{stroke:#ffd166;stroke-linecap:round;transition:stroke .3s}
.dfs-ring span{position:absolute;inset:0;display:grid;place-items:center;font-size:clamp(46px,5vw,84px);font-weight:800;color:#fff}
.dfs-ring.hot .fg{stroke:#ff4d6d}.dfs-ring.hot span{color:#ff8fa3;animation:dfbeat 1s ease-in-out infinite}
@keyframes dfbeat{0%{transform:scale(1)}20%{transform:scale(1.25)}}
.dfs-who{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:30px}
.dfs-who span{font-size:clamp(16px,1.8vw,26px);font-weight:800;padding:8px 18px;border-radius:999px;background:rgba(255,255,255,.08);color:#9d8fc4;border:2px dashed rgba(255,255,255,.2);transition:all .3s}
.dfs-who span.on{background:#ffd166;color:#2b1745;border:2px solid #ffd166;box-shadow:0 0 24px rgba(255,209,102,.6);animation:dfpop .45s cubic-bezier(.2,1.6,.4,1)}
.dfs-banner{margin:26px auto 0;max-width:900px;text-align:center;font-size:clamp(22px,2.6vw,40px);font-weight:800;color:#ffd166;animation:dfland .6s both}
.dfs-note{text-align:center;color:#cbbdf0;font-size:clamp(16px,1.8vw,26px);margin-top:10px;font-weight:700}
.dfs-board{margin:26px auto 0;max-width:1000px;display:grid;gap:10px;position:relative}
.dfs-row{display:grid;grid-template-columns:3em 1fr auto auto;align-items:center;gap:14px;background:linear-gradient(90deg,#2a1563,#1d0f47);border:1.5px solid rgba(124,58,237,.7);border-radius:16px;padding:10px 18px;font-size:clamp(20px,2.3vw,34px);font-weight:800;transition:transform .9s cubic-bezier(.3,1.3,.5,1)}
.dfs-row .r{color:#ffd166;text-align:center}.dfs-row .d{color:#7dffc8;opacity:0;transition:opacity .4s}.dfs-row .d.show{opacity:1}
.dfs-row .s{min-width:3.5em;text-align:end;direction:ltr}
.dfs-row:first-child{border-color:#ffd166;box-shadow:0 0 30px rgba(255,209,102,.35)}
.dfs-pod{display:flex;align-items:flex-end;justify-content:center;gap:clamp(12px,2vw,30px);margin-top:10px;min-height:44vh}
.dfs-pod>div{display:flex;flex-direction:column;align-items:center;gap:10px;opacity:0;transform:translateY(80px);transition:all .9s cubic-bezier(.2,1.4,.4,1)}
.dfs-pod>div.up{opacity:1;transform:none}
.dfs-pod .n{font-size:clamp(22px,2.6vw,40px);font-weight:800;text-align:center;max-width:14ch}
.dfs-pod .p{font-size:clamp(16px,1.6vw,24px);color:#cbbdf0;font-weight:800;direction:ltr}
.dfs-pod .blk{width:clamp(120px,15vw,240px);border-radius:18px 18px 0 0;display:grid;place-items:start center;padding-top:14px;font-size:clamp(40px,5vw,80px);font-weight:800;color:#2b1745}
.dfs-pod .g1 .blk{height:24vh;background:linear-gradient(180deg,#ffe08a,#ffb21e)}
.dfs-pod .g2 .blk{height:16vh;background:linear-gradient(180deg,#eef0f7,#b8bfd4)}
.dfs-pod .g3 .blk{height:10vh;background:linear-gradient(180deg,#ffc9a3,#e08a4c)}
.dfs-pod .g1 .n{color:#ffd166;font-size:clamp(28px,3.4vw,54px);text-shadow:0 0 30px rgba(255,209,102,.6)}
.dfs-crown{font-size:clamp(40px,5vw,72px);animation:dfbob 2s ease-in-out infinite}
.dfs-rest{text-align:center;color:#cbbdf0;font-size:clamp(16px,1.8vw,24px);margin-top:16px;font-weight:800}
.dfs-drum{position:absolute;inset:0;display:grid;place-items:center;z-index:5;pointer-events:none;font-size:clamp(40px,5vw,80px);font-weight:800;color:#ffd166;text-shadow:0 0 40px rgba(255,209,102,.8);animation:dfdrum .9s ease-in-out both}
@keyframes dfdrum{0%{opacity:0;transform:scale(.6)}30%{opacity:1;transform:scale(1.1)}80%{opacity:1}100%{opacity:0;transform:scale(1.4)}}
@media (max-width:900px){.dfs-mid{grid-template-columns:1fr}.dfs-ring{margin:0 auto}.dfs-opts{grid-template-columns:1fr}}`;
  document.head.appendChild(css);

  const clear = () => { timers.forEach(clearTimeout); timers = []; if (ring) cancelAnimationFrame(ring); ring = null; };
  const order = S => Object.keys(S.scores || {}).sort((a, b) => (S.scores[b] || 0) - (S.scores[a] || 0));

  function ringLoop(el, start) {
    const fg = el.querySelector(".dfs-ring .fg"), num = el.querySelector(".dfs-ring span"), box = el.querySelector(".dfs-ring"), C = 2 * Math.PI * 54;
    if (!fg) return;
    fg.style.strokeDasharray = C;
    const step = () => {
      const left = Math.max(0, Q_S * 1000 - (Date.now() - start)), sec = Math.ceil(left / 1000);
      fg.style.strokeDashoffset = C * (1 - left / (Q_S * 1000));
      if (num.textContent !== String(sec)) {
        num.textContent = sec;
        box.classList.toggle("hot", sec <= 5);
        if (sec <= 5 && sec > 0 && sec !== lastTick) { lastTick = sec; play("tick"); }
      }
      if (left > 0) ring = requestAnimationFrame(step);
    };
    step();
  }

  function build(el, o) {
    const { S, nameOf } = o, ids = S.order || [];
    const top = S.q ? `<div class="dfs-top"><span>السؤال <b>${S.idx + 1}</b>${S.inf ? " · ♾️" : " من <b>" + S.total + "</b>"}</span><span>${S.q.diff ? esc(S.q.diff) : ""}</span></div>` : "";
    if (S.phase === "lobby") {
      el.innerHTML = `<div class="dfs"><div class="dfs-title"><img src="../icons/dafour.png" alt=""><h1>الدافور</h1><p>🎙️ ننتظر المتسابقين…</p></div><div class="dfs-plates" id="dfsPlates"></div></div>`;
      seenNames = new Set(); return;
    }
    if (S.phase === "q") {
      answered = new Set(); lastTick = -1;
      el.innerHTML = `<div class="dfs">${top}<div class="dfs-q land">${esc(S.q.text)}</div>
        <div class="dfs-mid"><div class="dfs-opts">${(S.q.opts || []).map((t, i) => `<div class="dfs-opt in" style="--c:${COLS[i]};animation-delay:${.35 + i * .12}s"><b>${L[i]}</b><span>${esc(t)}</span></div>`).join("")}</div>
        <div class="dfs-ring"><svg viewBox="0 0 120 120"><circle class="bg" cx="60" cy="60" r="54"/><circle class="fg" cx="60" cy="60" r="54"/></svg><span>${Q_S}</span></div></div>
        <div class="dfs-who">${ids.map(id => `<span data-id="${esc(id)}">${esc(nameOf(id))}</span>`).join("")}</div></div>`;
      play("whoosh"); ringLoop(el, o.stepStart); return;
    }
    if (S.phase === "reveal") {
      const r = S.reveal || {}, picks = r.picks || {};
      const after = order(S), before = after.slice().sort((a, b) => ((S.scores[b] || 0) - ((r.deltas || {})[b] || 0)) - ((S.scores[a] || 0) - ((r.deltas || {})[a] || 0)));
      el.innerHTML = `<div class="dfs">${top}<div class="dfs-q">${esc(S.q.text)}</div>
        <div class="dfs-opts" style="margin-top:22px">${(S.q.opts || []).map((t, i) => { const who = ids.filter(id => picks[id] === i).map(nameOf); return `<div class="dfs-opt" data-i="${i}" style="--c:${COLS[i]}"><b>${L[i]}</b><span>${esc(t)}</span>${who.length ? `<small>${esc(who.join("، "))}</small>` : ""}</div>`; }).join("")}</div>
        <div id="dfsAfter"></div><div class="dfs-drum">🥁</div></div>`;
      play("whoosh");
      later(900, () => {
        el.querySelectorAll(".dfs-opt").forEach(t => t.classList.add(+t.dataset.i === r.correct ? "win" : "dim"));
        play((r.right || []).length ? "right" : "wrong");
        const a = el.querySelector("#dfsAfter"); if (!a) return;
        a.innerHTML = (r.fastest ? `<div class="dfs-banner">⚡ أسرع جواب صح: ${esc(nameOf(r.fastest))}</div>` : `<div class="dfs-banner">ولا أحد جابها 😅</div>`) + (r.note ? `<div class="dfs-note">💡 ${esc(r.note)}</div>` : "");
      });
      later(3200, () => standings(el, S, r, before, after, nameOf));
      return;
    }
    if (S.phase === "end") {
      const rk = order(S), pod = [rk[1], rk[0], rk[2]], cls = ["g2", "g1", "g3"], num = ["2", "1", "3"];
      el.innerHTML = `<div class="dfs"><div class="dfs-title"><h1 style="font-size:clamp(34px,4.4vw,64px)">🏆 دافور الشلة</h1></div>
        <div class="dfs-pod">${pod.map((id, i) => id ? `<div class="${cls[i]}">${cls[i] === "g1" ? `<div class="dfs-crown">👑</div>` : ""}<div class="n">${esc(nameOf(id))}</div><div class="p">${S.scores[id] || 0}</div><div class="blk">${num[i]}</div></div>` : "<div></div>").join("")}</div>
        ${rk.length > 3 ? `<div class="dfs-rest">${rk.slice(3).map((id, i) => `${i + 4}. ${esc(nameOf(id))} (${S.scores[id] || 0})`).join(" · ")}</div>` : ""}</div>`;
      const up = c => { const d = el.querySelector(".dfs-pod ." + c); if (d) d.classList.add("up"); };
      later(500, () => { up("g3"); play("whoosh"); });
      later(1700, () => { up("g2"); play("whoosh"); });
      later(3200, () => { up("g1"); play("win"); if (self.FA) FA.confetti(); later(1200, () => self.FA && FA.confetti()); });
    }
  }

  // the standings: rows start in the old order, then glide to the new one while the points count up
  function standings(el, S, r, before, after, nameOf) {
    const a = el.querySelector("#dfsAfter"); if (!a) return;
    const box = el.querySelector(".dfs"); if (box) box.classList.add("dfsb");
    const d = r.deltas || {}, rowH = () => { const x = a.querySelector(".dfs-row"); return x ? x.getBoundingClientRect().height + 10 : 60; };
    a.innerHTML = `<div class="dfs-board">${before.map((id, i) => `<div class="dfs-row" data-id="${esc(id)}"><span class="r">${i + 1}</span><span>${esc(nameOf(id))}</span><span class="d">${d[id] ? "+" + d[id] : ""}</span><span class="s">${(S.scores[id] || 0) - (d[id] || 0)}</span></div>`).join("")}</div>`;
    play("whoosh");
    later(700, () => {
      const h = rowH();
      a.querySelectorAll(".dfs-row").forEach(row => {
        const id = row.dataset.id, from = before.indexOf(id), to = after.indexOf(id);
        row.style.transform = `translateY(${(to - from) * h}px)`;
        row.querySelector(".r").textContent = to + 1;
        const dd = row.querySelector(".d"); if (d[id]) dd.classList.add("show");
        if (self.FA && d[id]) FA.countUp(row.querySelector(".s"), S.scores[id] || 0, (S.scores[id] || 0) - d[id]); else row.querySelector(".s").textContent = S.scores[id] || 0;
      });
      if (before[0] !== after[0]) later(900, () => play("reveal"));
    });
  }

  function update(el, o) {
    const S = o.S; if (!S) return;
    const k = S.phase + ":" + (S.q ? S.q.id : "") + ":" + (S.phase === "end" ? Object.keys(S.scores || {}).length : "");
    document.body.classList.add("dfshow");
    if (k !== key || !el.querySelector(".dfs")) { clear(); key = k; build(el, o); }
    // the small live parts
    if (S.phase === "lobby") {
      const box = el.querySelector("#dfsPlates"); if (!box) return;
      const ids = Object.keys(o.P || {}).sort((a, b) => (o.P[a].at || 0) - (o.P[b].at || 0));
      ids.forEach(id => { if (seenNames.has(id)) return; seenNames.add(id); const s = document.createElement("div"); s.className = "dfs-plate pop"; s.textContent = o.nameOf(id); box.appendChild(s); play("tap"); });
    }
    if (S.phase === "q" && S.q) {
      el.querySelectorAll(".dfs-who span").forEach(s => {
        const p = (o.P || {})[s.dataset.id], on = !!(p && p.ans && p.ans.q === S.q.id);
        if (on && !answered.has(s.dataset.id)) { answered.add(s.dataset.id); s.classList.add("on"); play("tap"); }
      });
    }
  }
  function stop() { clear(); key = ""; document.body.classList.remove("dfshow"); }
  self.DFShow = { update, stop };
})();
