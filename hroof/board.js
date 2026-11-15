/* خلية الحروف: the board, shared by the phones (hroof/app.js) and the TV (tv/app.js).
   5 rows × 5 hexagons (odd rows pushed half a cell), one letter each.
   Team 1 (green) joins the top edge to the bottom edge; team 2 (orange) joins the right edge to the left edge.
   own[i]: 0 free, 1 green, 2 orange.   HRB.svg({L, own}, {sel, win, tap, big})   HRB.winner(own) → {t, path} | null */
(function () {
  "use strict";
  const N = 5, R3 = Math.sqrt(3);
  const COL = { 0: "#ffffff", 1: "#12a874", 2: "#ff7a1a" };
  const EDGE = { 1: "#12a874", 2: "#ff7a1a" };
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  // the 26 letters a board picks from (ة and ء have no questions; ى is ي)
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
    let s = `<svg class="hrb${o.big ? " big" : ""}" viewBox="0 0 ${W.toFixed(2)} ${H.toFixed(2)}" role="img" aria-label="لوحة الحروف" direction="ltr">`;
    // the edges each team has to join: green top and bottom, orange left and right
    s += `<rect x="0" y="0" width="${W.toFixed(2)}" height="0.5" rx="0.25" fill="${EDGE[1]}"/><rect x="0" y="${(H - 0.5).toFixed(2)}" width="${W.toFixed(2)}" height="0.5" rx="0.25" fill="${EDGE[1]}"/>`;
    s += `<rect x="0" y="0.35" width="0.5" height="${(H - 0.7).toFixed(2)}" rx="0.25" fill="${EDGE[2]}"/><rect x="${(W - 0.5).toFixed(2)}" y="0.35" width="0.5" height="${(H - 0.7).toFixed(2)}" rx="0.25" fill="${EDGE[2]}"/>`;
    for (let i = 0; i < N * N; i++) {
      const [x, y] = center(i), t = own[i] || 0, sel = o.sel === i, free = !t;
      const cls = ["cell", "t" + t, sel ? "sel" : "", win.has(i) ? "win" : "", o.tap && free ? "tap" : ""].filter(Boolean).join(" ");
      s += `<g class="${cls}" ${o.tap && free ? `data-cell="${i}" role="button" tabindex="0" aria-label="${esc(L[i])}"` : ""}>`;
      s += `<polygon points="${hexPts(x, y, 0.96)}" fill="${COL[t]}" stroke="#2b1745" stroke-width="0.07"/>`;
      s += `<text x="${x.toFixed(3)}" y="${(y + 0.02).toFixed(3)}" text-anchor="middle" dominant-baseline="central" font-size="0.95" font-weight="800" fill="${t ? "#fff" : "#2b1745"}" font-family="Almarai,Tajawal,sans-serif">${esc(L[i] || "")}</text></g>`;
    }
    return s + "</svg>";
  }
  const css = `.hrb{display:block;width:100%;height:auto;max-height:62vh;margin:0 auto;user-select:none;-webkit-user-select:none}
.hrb .cell polygon{transition:fill .35s}
.hrb .cell.tap{cursor:pointer}.hrb .cell.tap:hover polygon{fill:#f3e8ff}
.hrb .cell.sel polygon{fill:#ffd166;animation:hrbsel 1s ease-in-out infinite alternate}
.hrb .cell.sel text{fill:#2b1745}
.hrb .cell.win polygon{stroke:#ffd166;stroke-width:.16}
.hrb .cell.t1 polygon,.hrb .cell.t2 polygon{animation:hrbpop .45s cubic-bezier(.2,1.6,.4,1)}
.hrb .cell{transform-box:fill-box;transform-origin:center}
@keyframes hrbsel{to{fill:#ffb21e}}
@keyframes hrbpop{0%{opacity:.4}100%{opacity:1}}`;
  if (typeof document !== "undefined" && !document.getElementById("hrb-css")) { const st = document.createElement("style"); st.id = "hrb-css"; st.textContent = css; document.head.appendChild(st); }
  // a new board: 25 different letters, only ones that still have questions
  function newBoard(have, rnd) {
    rnd = rnd || Math.random;
    const pool = LETTERS.filter(l => !have || (have[l] || 0) > 0), out = [];
    while (out.length < N * N && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    return { L: out, own: Array(N * N).fill(0) };
  }
  self.HRB = { N, LETTERS, neighbors, chain, winner, svg, newBoard, COL };
})();
