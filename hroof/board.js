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
  // the look: raised glossy tiles (a darker side under a lit face), rounded corners, glowing selected cell and winning path
  const SK = { 0: ["#fffaf2", "#efe2cc", "#c7b391", "#3b0f7a"], 1: ["#5be3a8", "#13a06a", "#0a6845", "#fff"], 2: ["#ffb262", "#f2650f", "#a8430a", "#fff"], s: ["#fff4b0", "#ffbe1a", "#b7791f", "#3b0f7a"] };
  function svg(B, o) {
    o = o || {};
    const own = B.own || [], L = B.L || [], winList = o.win || [], win = new Set(winList), uid = "h" + Math.random().toString(36).slice(2, 7);
    const Q = 0.65, W = R3 * (N + 0.5) + 1.6 + 2 * Q, H = 1.5 * (N - 1) + 2 + 1.6 + 2 * Q, P = 0.2 + Q;   // P: shift the tiles inside the frame, Q: room for the labelled rails
    const g = (id, a, b) => `<linearGradient id="${uid}${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
    let s = `<svg class="hrb${o.big ? " big" : ""}" viewBox="0 0 ${W.toFixed(2)} ${H.toFixed(2)}" role="img" aria-label="لوحة الحروف" direction="ltr"><defs>` +
      Object.keys(SK).map(k => g("f" + k, SK[k][0], SK[k][1])).join("") +
      `<radialGradient id="${uid}bg" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#5b21b6"/><stop offset="1" stop-color="#1e0645"/></radialGradient>
<filter id="${uid}glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="0.18" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
<rect x="0.3" y="0.3" width="${(W - 0.6).toFixed(2)}" height="${(H - 0.6).toFixed(2)}" rx="0.7" fill="url(#${uid}bg)"/>`;
    // the edges each team has to join: soft glowing rails, green top and bottom, orange left and right
    const rail = (x, y, w, h, c) => `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${(Math.min(w, h) / 2).toFixed(2)}" fill="${c}"/>`;
    const RW = 0.74, lab = (x, y, rot, t) => `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" transform="rotate(${rot} ${x.toFixed(2)} ${y.toFixed(2)})" text-anchor="middle" dominant-baseline="central" font-size="0.46" font-weight="800" fill="#fff" font-family="Almarai,Tajawal,sans-serif" direction="rtl">${t}</text>`;
    s += rail(1.1, 0.1, W - 2.2, RW, EDGE[1]) + rail(1.1, H - 0.1 - RW, W - 2.2, RW, EDGE[1]) + rail(0.1, 1.1, RW, H - 2.2, EDGE[2]) + rail(W - 0.1 - RW, 1.1, RW, H - 2.2, EDGE[2]);
    // the direction written on the rails themselves, all game long
    const tG = "🟢 الأخضر يوصّل من فوق لين تحت", tO = "🟠 البرتقالي يوصّل من اليمين لين اليسار";
    s += lab(W / 2, 0.1 + RW / 2, 0, tG) + lab(W / 2, H - 0.1 - RW / 2, 0, tG) + lab(0.1 + RW / 2, H / 2, -90, tO) + lab(W - 0.1 - RW / 2, H / 2, 90, tO);
    const at = i => { const [x, y] = center(i); return [x + P, y + P]; };
    // the winning path: a line of light that shines between its cells
    if (winList.length > 1) s += `<polyline points="${winList.map(i => at(i).map(v => v.toFixed(2)).join(",")).join(" ")}" fill="none" stroke="#fff6c2" stroke-width=".22" stroke-linecap="round" stroke-linejoin="round" filter="url(#${uid}glow)" pointer-events="none"/>`;
    for (let i = 0; i < N * N; i++) {
      const [x, y] = at(i), t = own[i] || 0, sel = o.sel === i, free = !t, k = sel ? "s" : t, c = SK[k];
      const cls = ["cell", "t" + t, sel ? "sel" : "", win.has(i) ? "win" : "", o.tap && free ? "tap" : ""].filter(Boolean).join(" ");
      s += `<g class="${cls}" ${o.tap && free ? `data-cell="${i}" role="button" tabindex="0" aria-label="${esc(L[i])}"` : ""}>`;
      if (sel || win.has(i)) s += `<polygon points="${hexPts(x, y, 0.98)}" fill="#ffd166" opacity=".95" filter="url(#${uid}glow)" stroke="#ffd166" stroke-width=".25" stroke-linejoin="round"/>`;
      s += `<polygon points="${hexPts(x, y + 0.12, 0.84)}" fill="${c[2]}" stroke="${c[2]}" stroke-width=".16" stroke-linejoin="round"/>`;
      s += `<polygon class="hx" points="${hexPts(x, y, 0.84)}" fill="url(#${uid}f${k})" stroke="${win.has(i) ? "#ffe27a" : `url(#${uid}f${k})`}" stroke-width="${win.has(i) ? ".2" : ".16"}" stroke-linejoin="round"/>`;
      s += `<polygon points="${hexPts(x, y - 0.05, 0.62)}" fill="none" stroke="#fff" stroke-opacity="${t ? ".22" : ".55"}" stroke-width=".05" stroke-linejoin="round"/>`;
      s += `<text x="${x.toFixed(3)}" y="${(y + 0.02).toFixed(3)}" text-anchor="middle" dominant-baseline="central" font-size="0.92" font-weight="800" fill="${c[3]}" font-family="Almarai,Tajawal,sans-serif"${t ? ` style="paint-order:stroke" stroke="rgba(0,0,0,.18)" stroke-width=".06"` : ""}>${esc(L[i] || "")}</text></g>`;
    }
    return s + "</svg>";
  }
  const css = `.hrb{display:block;width:100%;height:auto;max-height:62vh;margin:0 auto;user-select:none;-webkit-user-select:none}
.hrb .cell.tap{cursor:pointer}.hrb .cell.tap:hover{filter:brightness(1.06)}
.hrb .cell.tap:active{transform:translateY(.06px)}
.hrb .cell.sel{animation:hrbsel 1s ease-in-out infinite alternate}
.hrb .cell.t1,.hrb .cell.t2{animation:hrbpop .45s cubic-bezier(.2,1.6,.4,1)}
.hrb .cell{transform-box:fill-box;transform-origin:center}
.hrlogo{display:flex;flex-direction:column;align-items:center;line-height:1;font-family:Almarai,Tajawal,sans-serif;font-weight:800;margin:0 auto 8px;transform:rotate(-3deg);user-select:none}
.hrlogo b,.hrlogo em{font-style:normal;paint-order:stroke fill;-webkit-text-stroke:.14em #2b1745;text-shadow:0 .09em 0 #2b1745;letter-spacing:.01em}
.hrlogo b{font-size:2.5em;color:#ffd166}
.hrlogo i{font-style:normal;font-size:1em;color:#fff;background:#e03131;border:.12em solid #2b1745;border-radius:999px;padding:.05em .7em .12em;margin:-.15em 0 .05em;transform:rotate(5deg);box-shadow:0 .12em 0 #2b1745;position:relative;z-index:1}
.hrlogo em{font-size:2.3em;color:#ff8fab;max-width:100%;white-space:nowrap}
.hrlogo.sm{font-size:12px}.hrlogo.md{font-size:18px}.hrlogo.lg{font-size:clamp(20px,2.2vw,30px)}
@keyframes hrbsel{to{filter:brightness(1.12) drop-shadow(0 0 .2px #ffd166)}}
@keyframes hrbpop{0%{transform:scale(.85);opacity:.5}100%{transform:none;opacity:1}}`;
  if (typeof document !== "undefined" && !document.getElementById("hrb-css")) { const st = document.createElement("style"); st.id = "hrb-css"; st.textContent = css; document.head.appendChild(st); }
  // a new board: 25 different letters, only ones that still have questions
  function newBoard(have, rnd) {
    rnd = rnd || Math.random;
    const pool = LETTERS.filter(l => !have || (have[l] || 0) > 0), out = [];
    while (out.length < N * N && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    return { L: out, own: Array(N * N).fill(0) };
  }
    // the show's name: «حروف مع فلان» (the presenter's name), or «خلية الحروف» without one
  function logo(name, cls) {
    name = String(name || "").trim().slice(0, 16);
    return name ? `<div class="hrlogo ${cls || ""}"><b>حروف</b><i>مع</i><em>${esc(name)}</em></div>` : `<div class="hrlogo ${cls || ""}"><b>خلية</b><em>الحروف</em></div>`;
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
  self.HRB = { N, LETTERS, neighbors, chain, winner, need, hint, logo, svg, newBoard, COL };
})();
