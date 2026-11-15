/* خلية الحروف: the board, shared by the phones (hroof/app.js) and the TV (tv/app.js).
   5 rows × 5 hexagons (odd rows pushed half a cell), one letter each.
   Team 1 (green) joins the top edge to the bottom edge; team 2 (orange) joins the right edge to the left edge.
   own[i]: 0 free, 1 green, 2 orange.   HRB.svg({L, own}, {sel, win, tap, big})   HRB.winner(own) → {t, path} | null */
(function () {
  "use strict";
  const N = 5, R3 = Math.sqrt(3);
  const COL = { 0: "url(#hrbC0)", 1: "url(#hrbC1)", 2: "url(#hrbC2)" };
  const EDGE = { 1: "#12a874", 2: "#ff7a1a" };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // the 28 letters a board picks from (ة, ء and ى are not letters of their own here)
  const LETTERS = ["ا", "ب", "ت", "ث", "ج", "ح", "خ", "د", "ذ", "ر", "ز", "س", "ش", "ص", "ض", "ط", "ظ", "ع", "غ", "ف", "ق", "ك", "ل", "م", "ن", "ه", "و", "ي"];
  function neighbors(i) {
    const r = Math.floor(i / N), c = i % N, odd = r % 2 === 1, out = [];
    const add = (rr, cc) => { if (rr >= 0 && rr < N && cc >= 0 && cc < N) out.push(rr * N + cc); };
    add(r, c - 1); add(r, c + 1);
    if (odd) { add(r - 1, c); add(r - 1, c + 1); add(r + 1, c); add(r + 1, c + 1); }
    else { add(r - 1, c - 1); add(r - 1, c); add(r + 1, c - 1); add(r + 1, c); }
    return out;
  }
  // a team's chain from one of its edges to the other (breadth first, so the path is a short one)
  function chain(own, t) {
    const start = [], goal = new Set();
    for (let k = 0; k < N; k++) {
      if (t === 1) { start.push(k); goal.add((N - 1) * N + k); }
      else { start.push(k * N); goal.add(k * N + N - 1); }
    }
    const prev = {}, q = [];
    start.forEach(i => { if (own[i] === t) { prev[i] = -1; q.push(i); } });
    while (q.length) {
      const i = q.shift();
      if (goal.has(i)) { const path = []; for (let x = i; x !== -1; x = prev[x]) path.push(x); return path; }
      neighbors(i).forEach(j => { if (own[j] === t && prev[j] === undefined) { prev[j] = i; q.push(j); } });
    }
    return null;
  }
  // how many more cells team t needs to join its two edges (its own cells cost 0, free ones 1, the other team's block); Infinity if blocked
  function need(own, t) {
    const dist = Array(N * N).fill(Infinity), q = [];
    const cost = i => own[i] === t ? 0 : own[i] ? Infinity : 1;
    for (let k = 0; k < N; k++) { const i = t === 1 ? k : k * N, c = cost(i); if (c < Infinity) { dist[i] = c; q.push(i); } }
    while (q.length) {
      q.sort((a, b) => dist[a] - dist[b]); const i = q.shift();
      neighbors(i).forEach(j => { const c = cost(j); if (c < Infinity && dist[i] + c < dist[j]) { dist[j] = dist[i] + c; q.push(j); } });
    }
    let best = Infinity;
    for (let k = 0; k < N; k++) { const i = t === 1 ? (N - 1) * N + k : k * N + N - 1; best = Math.min(best, dist[i]); }
    return best;
  }
  function winner(own) {
    for (const t of [1, 2]) { const p = chain(own, t); if (p) return { t, path: p }; }
    return null;
  }
  const center = i => { const r = Math.floor(i / N), c = i % N; return [R3 * (c + (r % 2 ? 1 : 0.5)) + 0.6, 1.5 * r + 1 + 0.6]; };
  const hexPts = (x, y, s) => Array.from({ length: 6 }, (_, k) => { const a = Math.PI / 180 * (60 * k - 30); return (x + s * Math.cos(a)).toFixed(3) + "," + (y + s * Math.sin(a)).toFixed(3); }).join(" ");
  function svg(B, o) {
    o = o || {};
    const own = B.own || [], L = B.L || [], win = new Set((o.win || []));
    const W = R3 * (N + 0.5) + 1.2, H = 1.5 * (N - 1) + 2 + 1.2;
    let s = `<svg class="hrb${o.big ? " big" : ""}" viewBox="0 0 ${W.toFixed(2)} ${H.toFixed(2)}" role="img" aria-label="لوحة الحروف" direction="ltr">
<defs><linearGradient id="hrbC0" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#f3dfb4"/></linearGradient>
<linearGradient id="hrbC1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4ee0a6"/><stop offset="1" stop-color="#0c8a5c"/></linearGradient>
<linearGradient id="hrbC2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb05a"/><stop offset="1" stop-color="#e2560a"/></linearGradient>
<linearGradient id="hrbCS" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd166"/><stop offset="1" stop-color="#f08c00"/></linearGradient></defs>
<rect x="0.25" y="0.25" width="${(W - 0.5).toFixed(2)}" height="${(H - 0.5).toFixed(2)}" rx="0.6" fill="#2e1065" stroke="#f5b72f" stroke-width="0.12"/>`;
    // the edges each team has to join: green top and bottom, orange left and right
    s += `<rect x="0" y="0" width="${W.toFixed(2)}" height="0.5" rx="0.25" fill="${EDGE[1]}"/><rect x="0" y="${(H - 0.5).toFixed(2)}" width="${W.toFixed(2)}" height="0.5" rx="0.25" fill="${EDGE[1]}"/>`;
    s += `<rect x="0" y="0.35" width="0.5" height="${(H - 0.7).toFixed(2)}" rx="0.25" fill="${EDGE[2]}"/><rect x="${(W - 0.5).toFixed(2)}" y="0.35" width="0.5" height="${(H - 0.7).toFixed(2)}" rx="0.25" fill="${EDGE[2]}"/>`;
    for (let i = 0; i < N * N; i++) {
      const [x, y] = center(i), t = own[i] || 0, sel = o.sel === i, free = !t;
      const cls = ["cell", "t" + t, sel ? "sel" : "", win.has(i) ? "win" : "", o.tap && free ? "tap" : ""].filter(Boolean).join(" ");
      s += `<g class="${cls}" ${o.tap && free ? `data-cell="${i}" role="button" tabindex="0" aria-label="${esc(L[i])}"` : ""}>`;
      s += `<polygon points="${hexPts(x, y + 0.08, 0.93)}" fill="#1e0645" opacity=".55"/>`;
      s += `<polygon class="hx" points="${hexPts(x, y, 0.93)}" fill="${sel ? "url(#hrbCS)" : COL[t]}" stroke="${t === 1 ? "#0b6b47" : t === 2 ? "#b0430a" : "#d9a441"}" stroke-width="0.09"/>`;
      s += `<text x="${x.toFixed(3)}" y="${(y + 0.02).toFixed(3)}" text-anchor="middle" dominant-baseline="central" font-size="0.95" font-weight="800" fill="${t ? "#fff" : "#3b0f7a"}" font-family="Almarai,Tajawal,sans-serif">${esc(L[i] || "")}</text></g>`;
    }
    return s + "</svg>";
  }
  const css = `.hrb{display:block;width:100%;height:auto;max-height:62vh;margin:0 auto;user-select:none;-webkit-user-select:none}
.hrb .cell polygon{transition:fill .35s}
.hrb .cell.tap{cursor:pointer}.hrb .cell.tap:hover .hx{fill:#fff}
.hrb .cell.sel .hx{stroke:#fff;stroke-width:.14;filter:drop-shadow(0 0 .35px #ffd166);animation:hrbsel .9s ease-in-out infinite alternate}
.hrb .cell.sel text{fill:#3b0f7a}
.hrb .cell.win .hx{stroke:#fff3a8;stroke-width:.18;filter:drop-shadow(0 0 .3px #fff3a8)}
.hrb .cell.t1 .hx,.hrb .cell.t2 .hx{animation:hrbpop .45s cubic-bezier(.2,1.6,.4,1)}
.hrb .cell{transform-box:fill-box;transform-origin:center}
@keyframes hrbsel{to{stroke:#ffb21e}}
@keyframes hrbpop{0%{opacity:.4}100%{opacity:1}}`;
  if (typeof document !== "undefined" && !document.getElementById("hrb-css")) { const st = document.createElement("style"); st.id = "hrb-css"; st.textContent = css; document.head.appendChild(st); }
  // a new board: 25 different letters, only ones that still have questions
  function newBoard(have, rnd) {
    rnd = rnd || Math.random;
    const pool = LETTERS.filter(l => !have || (have[l] || 0) > 0), out = [];
    while (out.length < N * N && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    return { L: out, own: Array(N * N).fill(0) };
  }
    // a line for the gold strip under the board: who is close to joining
  function hint(own) {
    if (!own || !own.some(x => x)) return "اختاروا حروفكم بذكاء: كل خلية تقرّبكم من الضفة الثانية 🎯";
    const T = { 1: "🟢 الأخضر", 2: "🟠 البرتقالي" }, n = { 1: need(own, 1), 2: need(own, 2) };
    const word = k => k === 1 ? "خلية وحدة" : k === 2 ? "خليتين" : k + " خلايا";
    const close = [1, 2].filter(t => n[t] <= 2).sort((a, b) => n[a] - n[b]);
    if (close.length === 2 && n[1] === n[2]) return `🔥 الفريقين على الحافة! كل واحد باقي له ${word(n[1])}`;
    if (close.length) return `🔥 ${T[close[0]]} باقي له ${word(n[close[0]])} ويفوز!`;
    if (n[1] === Infinity) return `🧱 ${T[2]} سكّر الطريق على ${T[1]}!`;
    if (n[2] === Infinity) return `🧱 ${T[1]} سكّر الطريق على ${T[2]}!`;
    return n[1] < n[2] ? `${T[1]} أقرب للفوز: باقي له ${word(n[1])}` : n[2] < n[1] ? `${T[2]} أقرب للفوز: باقي له ${word(n[2])}` : `تعادل! كل فريق باقي له ${word(n[1])}`;
  }
  self.HRB = { N, LETTERS, neighbors, chain, winner, need, hint, svg, newBoard, COL };
})();
