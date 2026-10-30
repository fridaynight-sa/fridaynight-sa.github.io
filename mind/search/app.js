/* دوّر الكلمة — find the words hidden in a grid of letters: swipe over a word in a straight line (or tap its first
   letter, then its last). 400 levels (levels.js), from 6×6 with 4 words to 10×10 with 12 in any direction.
   📰 جريدة اليوم: one newspaper page a day (paper.js, loaded only when it opens); the letters no word uses spell a
   proverb. Everybody gets the same issue; the times go to paper/<issue>/<phone> for «ترتيب العدد».
   Progress on this phone (search-v1), backed up by MindSync (../sync.js). */
(function () {
  "use strict";
  const app = document.getElementById("app"), $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const LV = self.WS_LEVELS || [], TH = self.WS_THEMES || [], N = LV.length;
  const KEY = "search-v1", HINT = 3, START = 5;
  const D = [[0, -1], [1, 0], [1, -1], [1, 1], [0, 1], [-1, 0], [-1, 1], [-1, -1]];   // row, column steps (see scripts/search/gen.py)
  const COLORS = ["#7c5cff", "#f472b6", "#f59e0b", "#34d399", "#3ec6ff", "#fb7185", "#a3e635", "#c084fc", "#fbbf24", "#22d3ee", "#f97316", "#e879f9"];
  const me = document.currentScript, VER = me ? new URL(me.src).searchParams.get("v") || "" : "";
  const AR = n => String(n).replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[d]);
  const clock = s => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");

  /* ---------------- a grid ---------------- */
  // "rows cols topic[ saying]|letters row by row|rcdL rcdL …" (a word: first cell, direction, length)
  function parse(s) {
    const [h, g, ws] = s.split("|"), [R, C, t, x] = h.split(" ").map(Number), L = [...g];
    const words = ws.split(" ").map(k => {
      const r = +k[0], c = +k[1], d = +k[2], n = +k.slice(3);
      const cells = Array.from({ length: n }, (_, i) => [r + D[d][0] * i, c + D[d][1] * i]);
      return { t: cells.map(([a, b]) => L[a * C + b]).join(""), cells };
    });
    return { R, C, t, x, L, words, sig: s };
  }
  const level = n => Object.assign(parse(LV[n - 1]), { n });

  /* ---------------- saved progress ---------------- */
  const fresh = () => ({ v: 1, level: 1, round: 0, stars: START, score: 0, words: 0, hints: 0, cur: null, days: {}, sessions: [], paper: {}, pname: "", first: null });
  let G;
  try { G = Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY) || "null") || {}); } catch (e) { G = fresh(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(G)); } catch (e) {} };
  const backup = () => { if (self.MindSync) MindSync.save("search"); };
  const dayKey = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const totalMin = () => Object.values(G.days || {}).reduce((a, b) => a + b, 0);
  const ahead = (a, b) => (a.round || 0) - (b.round || 0) || (a.level || 1) - (b.level || 1);
  function merge(a, b) {
    const hi = ahead(b, a) > 0 ? b : a, out = Object.assign(fresh(), hi), seen = new Set();
    out.sessions = [];
    (a.sessions || []).concat(b.sessions || []).sort((x, y) => x.t - y.t).forEach(s => { if (!seen.has(s.t)) { seen.add(s.t); out.sessions.push(s); } });
    out.sessions = out.sessions.slice(-300);
    ["score", "words", "hints"].forEach(k => out[k] = Math.max(a[k] || 0, b[k] || 0));
    out.days = Object.assign({}, a.days, b.days);
    Object.keys(out.days).forEach(k => out.days[k] = Math.max((a.days || {})[k] || 0, (b.days || {})[k] || 0));
    out.paper = {};   // each issue: the solved one wins, then the further one
    new Set(Object.keys(a.paper || {}).concat(Object.keys(b.paper || {}))).forEach(k => {
      const x = (a.paper || {})[k], y = (b.paper || {})[k];
      out.paper[k] = !x ? y : !y ? x : x.done && !y.done ? x : y.done && !x.done ? y : (x.f || []).length >= (y.f || []).length ? x : y;
    });
    out.pname = a.pname || b.pname || "";
    return out;
  }
  let view = "intro", S = null, last = null, paper = null;
  const take = o => { G = merge(G, Object.assign(fresh(), o)); save(); if (view === "intro") render(); };
  if (self.MindSync) {
    MindSync.register("search", { get: () => G, merge: take, after: () => { if (view === "intro") render(); } });
    const inc = MindSync.incoming("search"); if (inc) { take(inc); backup(); }
  }
  const allDone = () => G.level > N;
  const play = (k, v) => { if (self.FX) FX.play(k, v); };

  /* ---------------- the newspaper's day ---------------- */
  const saNow = () => new Date(Date.now() + 3 * 36e5);
  // each phone has its own paper: the first issue it hasn't solved, and only one a day.
  // Solved today → today's stays (the next one opens tomorrow); not solved → it stays until it is.
  const saDay = t => Math.floor((t + 3 * 36e5) / 864e5);
  function issueNo() {
    const P = G.paper || {}, max = (self.WS_ISSUES || []).length || 730;
    let n = 1; while (n < max && P[n] && P[n].done) n++;
    let last = 0; for (const k in P) if (P[k] && P[k].done && (!last || (P[k].at || 0) > (P[last].at || 0))) last = +k;
    return last && saDay(P[last].at || 0) >= saDay(Date.now()) ? last : n;
  }
  const canOpen = n => n === issueNo() || !!((G.paper || {})[n] || {}).done;
  function dateLine(t) {
    const d = new Date(saDay(t) * 864e5 + 12 * 36e5), o = { timeZone: "UTC" };
    let h = "", g = "";
    try { h = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", Object.assign({ weekday: "long", day: "numeric", month: "long", year: "numeric" }, o)).format(d); } catch (e) {}
    try { g = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-arab", Object.assign({ day: "numeric", month: "long", year: "numeric" }, o)).format(d); } catch (e) {}
    return { h, g };
  }
  function loadPaper() {
    return new Promise((res, rej) => {
      if (self.WS_ISSUES) return res();
      const s = document.createElement("script"); s.src = "paper.js" + (VER ? "?v=" + VER : "");
      s.onload = () => self.WS_ISSUES ? res() : rej(); s.onerror = rej; document.head.appendChild(s);
    });
  }
  const issue = n => { const I = self.WS_ISSUES; return Object.assign(parse(I[(n - 1) % I.length]), { n }); };
  const KIND = { "م": "مثلاً", "خ": "مثلاً شعبياً", "ح": "حديثاً شريفاً", "ش": "شطر بيت شعر" };
  const words3 = n => n === 1 ? "كلمة وحدة" : n === 2 ? "كلمتين" : n <= 10 ? n + " كلمات" : n + " كلمة";
  const norm = s => String(s || "").replace(/[^ء-ي]/g, "").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/ؤ/g, "و").replace(/ئ/g, "ي");

  /* ---------------- intro ---------------- */
  function introView() {
    const lvl = Math.min(G.level, N), n = issueNo(), p = (G.paper || {})[n];
    app.innerHTML = `<header class="hero"><img src="../../icons/search.png" alt=""><h1>دوّر الكلمة</h1><p>تمرين التركيز</p></header>
      <div class="card record"><div><small>${allDone() ? "خلّصت" : G.level > 1 ? "وصلت" : "تبدأ من"}</small><b>${allDone() ? "🏆 كل المستويات" : "المستوى " + lvl}</b><small class="of">من ${N}</small></div><div><small>نجومك</small><b>⭐ ${G.stars}</b><small class="of">💡 = ${HINT} ⭐</small></div></div>
      ${allDone() ? `<p class="note">🏆 خلّصت الـ${N} مستوى كلها! تقدر تعيدها من الأول، ونجومك وأرقامك تبقى معك.</p><button type="button" class="btn" data-act="again">العب من المستوى 1 من جديد</button>`
        : `<button type="button" class="btn" data-act="start">${G.level > 1 || G.cur ? "كمّل من المستوى " + lvl : "ابدأ المستوى 1"} ←</button>`}
      <button type="button" class="paperbtn" data-act="paper"><span class="pb-ic">📰</span><span><b>جريدة اليوم</b><small>العدد ${n} · ${p && p.done ? "✅ حليتها في " + clock(p.s) : p && (p.f || []).length ? "كمّل حلّها" : "الكلمة الضائعة: لغز جديد كل يوم"}</small></span><span class="pb-go">←</span></button>
      <div class="card" style="margin-top:14px"><h2>🎯 وش تدرّب</h2><div class="chips"><span class="chip">🔎 التركيز الانتقائي</span><span class="chip">👀 المسح بالنظر</span><span class="chip">📚 المفردات</span></div>
        <p class="small" style="margin:10px 0 0">🔬 <b>قوة الدليل العلمي:</b> ضعيف لفوايد العقل العامة. الأكيد إنك تتمرّن على التركيز وسط حروف كثيرة، وتمر عليك كلمات من مواضيع كثيرة.</p></div>
      <div class="card"><h2>📅 كم تلعب؟</h2><p style="margin:0">مستوى أو مستويين يومياً، وجريدة اليوم. على راحتك.</p></div>
      ${progressCard()}
      <div class="card"><h2>🎮 كيف تلعب</h2><ul class="list small">
        <li>الكلمات اللي تحت مخبّاة في الشبكة بخط مستقيم: بالعرض أو بالطول أو بالمايل.</li>
        <li>اسحب إصبعك من أول حرف في الكلمة لآخر حرف. أو اضغط أول حرف وبعدها آخر حرف.</li>
        <li>أول المستويات من اليمين لليسار ومن فوق لتحت، وبعدين تجي بالمايل، ومن المستوى 121 تجي بالعكس بعد.</li>
        <li>💡 التلميح يورّيك أول حرف من كلمة بـ ${HINT} ⭐. كل مستوى تخلّصه يعطيك ⭐، ولو كنت سريع ⭐ زيادة.</li>
        <li>📰 في الجريدة: بعد ما تلقى كل الكلمات، الحروف اللي تبقى تكوّن مثلاً. لو عرفته قبل، اكتبه وخلّص أسرع.</li></ul></div>
      ${self.MindSync ? MindSync.card() : ""}`;
  }
  function progressCard() {
    const done = Math.min(G.level - 1, N) + (G.round || 0) * N, tot = totalMin(), solved = Object.values(G.paper || {}).filter(p => p.done).length;
    return `<div class="card"><h2>📊 تقدمك</h2><div class="prog">
      <div><small>📶 مستويات خلّصتها</small><b>${done}</b> من ${N}</div>
      <div><small>🔤 كلمات لقيتها</small><b>${(G.words || 0).toLocaleString("en-US")}</b></div>
      <div><small>🏅 نقاطك</small><b>${(G.score || 0).toLocaleString("en-US")}</b></div>
      <div><small>📰 جرايد حليتها</small><b>${solved}</b></div>
      <div style="grid-column:1/-1"><small>مجموع لعبك</small>${tot < 60 ? `<b>${Math.floor(tot)}</b> دقيقة` : `<b>${(tot / 60).toFixed(1)}</b> ساعة`}</div>
    </div></div>`;
  }

  /* ---------------- a level (the Mind Games look) ---------------- */
  function startLevel() {
    if (allDone()) { view = "intro"; render(); return; }
    const L = level(G.level);
    if (G.cur && (G.cur.n !== L.n || G.cur.k !== L.sig)) G.cur = null;
    if (!G.cur) G.cur = { n: L.n, k: L.sig, f: [], h: [], t: 0 };
    S = { kind: "level", L, P: G.cur, sel: null, anchor: null, lock: false, paused: false };
    if (!G.first) G.first = Date.now();
    save(); view = "play"; render(); scrollTo(0, 0);
    setTimeout(fit, 60); setTimeout(fit, 400);
  }
  function playView() {
    const L = S.L, P = S.P, th = TH[L.t] || ["", ""];
    app.innerHTML = `<div class="pl">
      <div class="ptop"><button type="button" class="x" data-act="pause" aria-label="وقفة">⏸</button><span class="n">المستوى ${L.n}</span><span class="st" id="st">⭐ ${G.stars}</span></div>
      <div class="pinfo"><b>${esc(th[0])}</b><span>⏱ <span id="tm">${clock(P.t)}</span></span><span id="cnt">${P.f.length} / ${L.words.length}</span></div>
      <div class="board" id="bd"><div class="gw" id="gw">${grid(L)}<div class="caps" id="caps"></div></div></div>
      <div class="cur" id="cur"></div>
      <div class="wl" id="wl">${wordList(L, P)}</div>
      <div class="acts"><button type="button" data-act="hint">💡 تلميح <small>${HINT} ⭐</small></button></div>
    </div>`;
    bind($("gw"));
  }
  const grid = L => `<div class="ws" id="ws" style="--R:${L.R};--C:${L.C}">${L.L.map((ch, i) => `<i data-i="${i}">${esc(ch)}</i>`).join("")}</div>`;
  const wordList = (L, P) => L.words.map((w, i) => `<span class="${P.f.includes(i) ? "ok" : ""}" style="--c:${COLORS[i % COLORS.length]}">${esc(w.t)}</span>`).join("");
  // the size of the letters: as big as the space allows
  function fit() {
    if (!S) return;
    const ws = $("ws"), bd = $("bd"); if (!ws || !bd) return;
    const { R, C } = S.L, gap = S.kind === "paper" ? 0 : 4;
    let cs;
    if (S.kind === "paper") cs = Math.floor(Math.min((bd.clientWidth - 8) / C, 46));
    else {
      const H = Math.floor(Math.min(innerHeight, (self.visualViewport && visualViewport.height) || innerHeight));
      const pl = document.querySelector(".pl"); if (pl) pl.style.height = H + "px";
      cs = Math.floor(Math.min((bd.clientWidth - 4 - gap * (C - 1)) / C, (bd.clientHeight - 4 - gap * (R - 1)) / R, 58));
    }
    ws.style.setProperty("--cs", Math.max(22, cs) + "px"); ws.style.setProperty("--g", gap + "px");
    S.cs = Math.max(22, cs); S.gap = gap;
    drawFound();
  }
  addEventListener("resize", () => setTimeout(fit, 60));
  if (self.visualViewport) visualViewport.addEventListener("resize", () => setTimeout(fit, 60));

  /* ---------------- choosing a line of letters ---------------- */
  const cellXY = (r, c) => { const step = S.cs + S.gap; return [c * step + S.cs / 2, r * step + S.cs / 2]; };   // the grid runs left to right (column 0 on the left)
  function cellAt(x, y, clamp) {
    const ws = $("ws"); if (!ws) return null;
    const b = ws.getBoundingClientRect(), step = S.cs + S.gap;
    let c = Math.floor((x - b.left) / step), r = Math.floor((y - b.top) / step);
    if (!clamp && (r < 0 || c < 0 || r >= S.L.R || c >= S.L.C)) return null;
    return [Math.max(0, Math.min(S.L.R - 1, r)), Math.max(0, Math.min(S.L.C - 1, c))];
  }
  // from the first cell toward the finger: the nearest of the eight straight lines
  function line(a, b) {
    const dr = b[0] - a[0], dc = b[1] - a[1];
    if (!dr && !dc) return [a];
    const k = Math.round(Math.atan2(dr, dc) / (Math.PI / 4)), sr = Math.round(Math.sin(k * Math.PI / 4)), sc = Math.round(Math.cos(k * Math.PI / 4));
    let n = Math.round((dr * sr + dc * sc) / (sr * sr + sc * sc));
    const inside = i => { const r = a[0] + sr * i, c = a[1] + sc * i; return r >= 0 && c >= 0 && r < S.L.R && c < S.L.C; };
    while (n > 0 && !inside(n)) n--;
    return Array.from({ length: Math.max(0, n) + 1 }, (_, i) => [a[0] + sr * i, a[1] + sc * i]);
  }
  const textOf = cells => cells.map(([r, c]) => S.L.L[r * S.L.C + c]).join("");
  function bind(gw) {
    gw.addEventListener("pointerdown", e => {
      if (S.lock || S.paused || S.done) return;
      const a = cellAt(e.clientX, e.clientY); if (!a) return;
      e.preventDefault(); try { gw.setPointerCapture(e.pointerId); } catch (x) {}
      S.ptr = { id: e.pointerId, a, moved: false }; S.sel = [a]; drawSel(); play("tick");
    });
    gw.addEventListener("pointermove", e => {
      if (!S.ptr || e.pointerId !== S.ptr.id) return;
      const b = cellAt(e.clientX, e.clientY, true); if (!b) return;
      const sel = line(S.ptr.a, b);
      if (sel.length !== S.sel.length || sel.some((x, i) => x[0] !== S.sel[i][0] || x[1] !== S.sel[i][1])) { S.sel = sel; S.ptr.moved = true; drawSel(); play("tick"); }
    });
    const up = e => {
      if (!S.ptr || e.pointerId !== S.ptr.id) return;
      const p = S.ptr; S.ptr = null;
      if (!p.moved || S.sel.length < 2) {                         // a tap: first letter, then the last one
        if (S.anchor && (S.anchor[0] !== p.a[0] || S.anchor[1] !== p.a[1])) { const sel = line(S.anchor, p.a); S.anchor = null; S.sel = sel; drawSel(); finish(sel); }
        else { S.anchor = S.anchor ? null : p.a; S.sel = S.anchor ? [p.a] : null; drawSel(); }
        return;
      }
      S.anchor = null; finish(S.sel);
    };
    gw.addEventListener("pointerup", up); gw.addEventListener("pointercancel", e => { if (S.ptr && e.pointerId === S.ptr.id) { S.ptr = null; S.sel = null; drawSel(); } });
  }
  function finish(sel) {
    const t = textOf(sel), L = S.L, P = S.P;
    const i = L.words.findIndex((w, k) => !P.f.includes(k) && w.cells.length === sel.length &&
      (w.cells.every((x, j) => x[0] === sel[j][0] && x[1] === sel[j][1]) || w.cells.every((x, j) => x[0] === sel[sel.length - 1 - j][0] && x[1] === sel[sel.length - 1 - j][1])));
    S.sel = null; drawSel();
    if (i >= 0) found(i);
    else if (sel.length >= 2) { say(t, "no"); play("wrong", 30); if (S.kind === "level" && L.words.some((w, k) => P.f.includes(k) && w.t === t)) say(t, "old"); }
  }
  function say(t, cls) {
    const el = $("cur"); if (!el) return;
    el.innerHTML = t ? `<b class="${cls || ""}">${esc(t)}</b>` : "";
    clearTimeout(say.t); if (t) say.t = setTimeout(() => { if ($("cur")) $("cur").innerHTML = ""; }, 1400);
  }
  // the line being chosen
  function drawSel() {
    const caps = $("caps"); if (!caps) return;
    let el = $("selcap");
    if (!S.sel || !S.sel.length) { if (el) el.remove(); if (S.kind === "level" && !S.anchor) say(""); return; }
    if (!el) { el = document.createElement("div"); el.id = "selcap"; el.className = "cap sel"; caps.appendChild(el); }
    capsule(el, S.sel);
    if (S.kind === "level") { const c = $("cur"); if (c) c.innerHTML = `<b class="now">${esc(textOf(S.sel))}</b>`; }
  }
  function capsule(el, cells) {
    const [x1, y1] = cellXY(...cells[0]), [x2, y2] = cellXY(...cells[cells.length - 1]), s = S.cs;
    const L = Math.hypot(x2 - x1, y2 - y1) + s * .9, a = Math.atan2(y2 - y1, x2 - x1), h = s * (S.kind === "paper" ? .78 : .86);
    el.style.cssText = `width:${L}px;height:${h}px;left:${(x1 + x2) / 2 - L / 2}px;top:${(y1 + y2) / 2 - h / 2}px;transform:rotate(${a}rad)`;
  }
  // the words already found (and the hint letters)
  function drawFound() {
    const caps = $("caps"); if (!caps || !S) return;
    caps.querySelectorAll(".cap.done,.hint").forEach(x => x.remove());
    const svg = $("pen"); if (svg) svg.innerHTML = "";
    S.P.f.forEach(i => {
      const w = S.L.words[i];
      if (S.kind === "paper") ring(w.cells, i);
      else { const el = document.createElement("div"); el.className = "cap done"; capsule(el, w.cells); el.style.background = COLORS[i % COLORS.length] + "cc"; caps.appendChild(el); }
    });
    (S.P.h || []).forEach(k => {
      const [r, c] = k.split(",").map(Number), [x, y] = cellXY(r, c), el = document.createElement("div");
      el.className = "hint"; el.style.cssText = `left:${x - S.cs / 2}px;top:${y - S.cs / 2}px;width:${S.cs}px;height:${S.cs}px`; caps.appendChild(el);
    });
    if (S.kind === "paper") paperLeft();
  }
  function found(i) {
    const P = S.P, w = S.L.words[i];
    P.f.push(i); G.words = (G.words || 0) + 1;
    P.h = (P.h || []).filter(k => k !== w.cells[0].join(",") && k !== w.cells[w.cells.length - 1].join(","));
    if (S.kind === "level") G.score = (G.score || 0) + w.t.length * 10;
    save(); play("right", 25);
    drawFound();
    if (S.kind === "level") {
      say(w.t, "ok");
      const wl = $("wl"); if (wl) wl.innerHTML = wordList(S.L, P);
      const cn = $("cnt"); if (cn) cn.textContent = P.f.length + " / " + S.L.words.length;
      if (P.f.length === S.L.words.length) levelDone();
    } else {
      const li = document.querySelector(`#plist [data-w="${i}"]`); if (li) li.classList.add("x");
      if (P.f.length === S.L.words.length) paperSolved(false);
    }
  }
  function hint() {
    if (S.lock || S.done) return;
    if (G.stars < HINT) { toast(`💡 التلميح يحتاج ${HINT} ⭐. خلّص مستويات وتجمع نجوم.`); return; }
    const P = S.P, left = S.L.words.map((w, i) => i).filter(i => !P.f.includes(i) && !(P.h || []).includes(S.L.words[i].cells[0].join(",")));
    if (!left.length) { toast("💡 أول حرف من كل الكلمات الباقية ظاهر لك."); return; }
    const i = left[Math.floor(Math.random() * left.length)];
    P.h = (P.h || []).concat([S.L.words[i].cells[0].join(",")]); G.stars -= HINT; G.hints = (G.hints || 0) + 1; save();
    const st = $("st"); if (st) st.textContent = "⭐ " + G.stars;
    drawFound(); play("reveal"); toast(`💡 أول حرف من «${S.L.words[i].t}» يلمع لك.`);
  }
  function levelDone() {
    if (S.lock) return; S.lock = true;
    const L = S.L, P = S.P, par = L.words.length * 14, fast = P.t <= par;
    const bonus = Math.max(0, par - P.t) * 5;
    G.score = (G.score || 0) + bonus; G.stars += fast ? 2 : 1;
    G.sessions.push({ t: Date.now(), n: L.n, s: P.t, w: L.words.length }); G.sessions = G.sessions.slice(-300);
    last = { n: L.n, t: P.t, w: L.words.length, fast, bonus, th: (TH[L.t] || [""])[0] };
    G.level++; G.cur = null; save(); backup();
    if (self.FA) FA.confetti(); play("win", [40, 40, 80]);
    setTimeout(() => { S = null; view = "end"; render(); scrollTo(0, 0); }, 900);
  }
  function endView() {
    const r = last, top = r.n >= N;
    app.innerHTML = `<div class="end">
      <div style="text-align:center;font-size:54px;line-height:1.2;margin-top:8px">${top ? "🏆" : "🎉"}</div>
      <h1>${top ? "خلّصت كل المستويات!" : "أحسنت!"}</h1><p class="sub">خلّصت المستوى ${r.n} · ${esc(r.th)}</p>
      <div class="stats"><div>${clock(r.t)}<small>وقتك</small></div><div>${r.w}<small>كلمات</small></div><div>⭐ ${G.stars}<small>نجومك</small></div></div>
      <p class="found">${r.fast ? `⚡ كنت سريع: ⭐ زيادة و${r.bonus.toLocaleString("en-US")} نقطة.` : `💡 لو تخلّصه في أقل من ${clock(r.w * 14)} تاخذ ⭐ زيادة.`}</p>
      <div class="card" style="padding:12px 16px"><div style="display:flex;justify-content:space-between;font-weight:800;font-size:14px;margin-bottom:6px"><span>📶 المستوى ${r.n} من ${N}</span><span class="muted">${top ? "🏆 خلصت" : "باقي " + (N - r.n)}</span></div><div class="bar"><i style="width:${(r.n / N * 100).toFixed(1)}%"></i></div></div>
      ${top ? `<button type="button" class="btn" data-act="again">العب من المستوى 1 من جديد</button>` : `<button type="button" class="btn" data-act="start">المستوى ${r.n + 1} ←</button>`}
      <button type="button" class="paperbtn" data-act="paper"><span class="pb-ic">📰</span><span><b>جريدة اليوم</b><small>العدد ${issueNo()}</small></span><span class="pb-go">←</span></button>
      <button type="button" class="btn alt" data-act="menu">القائمة</button></div>`;
  }

  /* ---------------- 📰 the newspaper ---------------- */
  async function openPaper(n) {
    app.innerHTML = `<div class="card" style="text-align:center">📰 لحظة… نجيب الجريدة</div>`;
    try { await loadPaper(); } catch (e) { app.innerHTML = `<div class="card" style="text-align:center">ما قدرت أجيب الجريدة. تأكد من النت وجرّب مرة ثانية.<br><button type="button" class="btn" data-act="paper" style="margin-top:12px">جرّب مرة ثانية</button><button type="button" class="btn alt" data-act="menu">رجوع</button></div>`; return; }
    if (!n || !canOpen(n)) n = issueNo();
    const L = issue(n), key = String(n);
    G.paper = G.paper || {};
    const P = G.paper[key] && G.paper[key].k === L.sig ? G.paper[key] : (G.paper[key] = { k: L.sig, f: [], h: [], t: 0 });
    S = { kind: "paper", L, P, n, sel: null, anchor: null, lock: false, paused: false, done: !!P.done };
    paper = { n, rank: null };
    view = "paper"; render(); scrollTo(0, 0);
    setTimeout(fit, 60); setTimeout(fit, 500);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => setTimeout(fit, 30));
    loadRank(n);
  }
  function paperView() {
    const L = S.L, P = S.P, n = S.n, th = TH[L.t] || ["", ""], say0 = (self.WS_SAYINGS || [])[L.x] || ["م", ""];
    const parts = say0[1].split(/\s+/), { h, g } = dateLine(P.done ? P.at || Date.now() : Date.now()), ads = self.WS_ADS || [], next = issue(n + 1);
    const boxes = parts.map(w => `<span class="aw">${[...w.replace(/[^ء-ي]/g, "")].map(() => `<i></i>`).join("")}</span>`).join("");
    app.innerHTML = `<div class="paperwrap"><div class="ptools"><button type="button" data-act="menu">→ رجوع</button><button type="button" data-act="archive">📚 الأعداد القديمة</button></div>
      <article class="page"><svg class="inkdefs" aria-hidden="true" focusable="false"><filter id="bp" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="1.5" numOctaves="2" seed="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale=".7" xChannelSelector="R" yChannelSelector="G" result="d"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.05 0 0 0 .45" result="m"/><feComposite in="d" in2="m" operator="in"/></filter></svg>
      <div class="mast"><h1>الجـمـعـة</h1><div class="msub">جريدة Friday Night اليومية · صفحة التسلية</div></div>
      <div class="dline"><span>${esc(h)}</span><span>العدد ${AR(n)}</span><span>${esc(g)}</span></div>
      <div class="secbar">تسلية وألغاز</div>
      <h2>الكلمة الضائعة</h2>
      <p class="how">ابحث عن كلمات موضوع «<b>${esc(th[0])}</b>» في الجدول، والحروف اللي تبقى تكوّن ${KIND[say0[0]] || "مثلاً"} من ${words3(parts.length)}.</p>
      <div class="ptime" id="tm">${P.done ? "✔ " + AR(clock(P.s)) : "⏱ " + AR(clock(P.t))}</div>
      <div class="board pboard" id="bd"><div class="gw" id="gw">${grid(L)}<div class="caps" id="caps"></div><svg class="pen" id="pen"></svg></div></div>
      <ul class="plist" id="plist">${L.words.map((w, i) => i).sort((a, b) => L.words[a].t.localeCompare(L.words[b].t, "ar")).map(i => `<li data-w="${i}" class="${P.f.includes(i) ? "x" : ""}">${esc(L.words[i].t)}</li>`).join("")}</ul>
      <div class="ans"><span class="al">الحل:</span><div class="ab" id="ab">${boxes}</div></div>
      <div id="guess">${P.done ? solvedBox() : `<button type="button" class="gbtn" data-act="guess">✍️ عرفت الحل؟ اكتبه</button>`}</div>
      <div class="minis"><div><b>ترتيب العدد</b><div id="rank">${rankBox()}</div></div><div><b>إعلان</b>${esc(ads[(n - 1) % (ads.length || 1)] || "")}</div><div><b>عدد بكرة</b>الموضوع: «${esc((TH[next.t] || [""])[0])}»</div></div>
      </article></div>`;
    bind($("gw"));
    fillAnswer(P.done);
  }
  const solvedBox = () => `<p class="solved">✔ حليتها في <b>${AR(clock(S.P.s))}</b>${S.P.g ? " · عرفت الحل قبل ما تخلّص الكلمات ✍️" : ""}</p>${S.n === issueNo() ? `<p class="pnext">📅 العدد ${AR(S.n + 1)} يفتح لك بكرة</p>` : ""}`;
  // the pen: a hand-drawn ring around a found word
  function ring(cells, i) {
    const svg = $("pen"); if (!svg) return;
    const NS = "http://www.w3.org/2000/svg", [x1, y1] = cellXY(...cells[0]), [x2, y2] = cellXY(...cells[cells.length - 1]), s = S.cs;
    let k = i * 7 + 3; const rnd = () => (((Math.sin(++k * 12.9898) * 43758.5453) % 1) + 1) % 1;
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2, a = (Math.hypot(x2 - x1, y2 - y1) + s * .95) / 2, b = s * .44, ang = Math.atan2(y2 - y1, x2 - x1) + (rnd() - .5) * .06;
    // like a ballpoint pen: a turn and a bit more, thin where it lands and lifts off, a little uneven
    const t0 = -Math.PI * (.2 + rnd() * .5), turn = Math.PI * 2 * (1.08 + rnd() * .08), f1 = rnd() * 6.3, f2 = rnd() * 6.3, sw = Math.max(2, s * .075);
    const pt = u => { const t = t0 + u * turn, w = 1 + .03 * Math.sin(2 * t + f1) + .02 * Math.sin(3 * t + f2) + .06 * u, px = Math.cos(t) * a * w, py = Math.sin(t) * b * w;
      return [cx + px * Math.cos(ang) - py * Math.sin(ang), cy + px * Math.sin(ang) + py * Math.cos(ang)]; };
    const wd = u => sw * Math.min(1, .4 + u * 16) * Math.min(1, .15 + (1 - u) * 6) * (1 + .15 * Math.sin(u * 11 + f1));
    const band = (u0, u1) => {
      const L = [], R = [], n = Math.ceil((u1 - u0) * 140) + 2;
      for (let j = 0; j <= n; j++) {
        const u = u0 + (u1 - u0) * j / n, [x, y] = pt(u), [xa, ya] = pt(Math.max(0, u - .002)), [xb, yb] = pt(Math.min(1, u + .002)), l = Math.hypot(xb - xa, yb - ya) || 1, h = wd(u) / 2, nx = -(yb - ya) / l * h, ny = (xb - xa) / l * h;
        L.push((x + nx).toFixed(1) + " " + (y + ny).toFixed(1)); R.push((x - nx).toFixed(1) + " " + (y - ny).toFixed(1));
      }
      return "M" + L.join("L") + "L" + R.reverse().join("L") + "Z";
    };
    const g = document.createElementNS(NS, "g"), one = 2 * Math.PI / turn;   // the bit after one turn goes over the start: darker there
    g.setAttribute("class", "ring"); g.setAttribute("filter", "url(#bp)");
    [band(0, one), band(one - .003, 1)].forEach(d => { const p = document.createElementNS(NS, "path"); p.setAttribute("d", d); g.appendChild(p); });
    svg.appendChild(g);
  }
  // the letters no word uses (row by row, right to left): the answer
  function leftCells() {
    const used = new Set(); S.L.words.forEach(w => w.cells.forEach(([r, c]) => used.add(r + "," + c)));
    const out = []; for (let r = 0; r < S.L.R; r++) for (let c = S.L.C - 1; c >= 0; c--) if (!used.has(r + "," + c)) out.push([r, c]);
    return out;
  }
  function paperLeft() {
    if (!S.P.done) return;
    const caps = $("caps"); if (!caps) return;
    leftCells().forEach(([r, c]) => { const [x, y] = cellXY(r, c), el = document.createElement("div"); el.className = "hint left"; el.style.cssText = `left:${x - S.cs / 2}px;top:${y - S.cs / 2}px;width:${S.cs}px;height:${S.cs}px`; caps.appendChild(el); });
  }
  function fillAnswer(all) {
    const say0 = (self.WS_SAYINGS || [])[S.L.x] || ["", ""], letters = [...say0[1].replace(/[^ء-ي]/g, "")];
    document.querySelectorAll("#ab i").forEach((b, i) => { b.textContent = all ? letters[i] || "" : ""; if (all) b.style.animationDelay = (i * .06) + "s"; b.classList.toggle("on", !!all); });
  }
  function paperSolved(byGuess) {
    const P = S.P; if (P.done) return;
    P.done = true; P.s = Math.max(1, P.t); P.g = byGuess ? 1 : 0; P.at = Date.now(); S.done = true;
    G.sessions.push({ t: Date.now(), p: S.n, s: P.s }); save(); backup();
    const tm = $("tm"); if (tm) tm.textContent = "✔ " + AR(clock(P.s));
    fillAnswer(true); drawFound();
    const gu = $("guess"); if (gu) gu.innerHTML = solvedBox();
    if (self.FA) FA.confetti(); play("win", [40, 40, 80]);
    sendRank();
  }
  function guessBox(msg) {
    const g = $("guess"); if (!g) return;
    g.innerHTML = `<div class="gform"><input id="gin" autocomplete="off" placeholder="اكتب المثل هنا" aria-label="الحل"><button type="button" data-act="gok">تأكيد</button><button type="button" data-act="gx">إلغاء</button></div>${msg ? `<p class="gmsg">${esc(msg)}</p>` : ""}`;
    const i = $("gin"); if (i) i.focus();
  }
  function checkGuess() {
    const v = ($("gin") || {}).value || "", say0 = (self.WS_SAYINGS || [])[S.L.x] || ["", ""];
    if (!norm(v)) return;
    if (norm(v) === norm(say0[1])) { paperSolved(true); return; }
    S.P.t += 30; save(); const tm = $("tm"); if (tm) tm.textContent = "⏱ " + AR(clock(S.P.t));
    play("wrong", 40); guessBox("مو هو. انضافت 30 ثانية على وقتك.");
  }
  // «ترتيب العدد»: everybody's time for this issue
  let db = null;
  try { const C = self.FIREBASE_CONFIG; if (C && C.databaseURL && self.firebase) { if (!firebase.apps.length) firebase.initializeApp(C); db = firebase.database(); } } catch (e) { db = null; }
  const devId = () => { try { const d = JSON.parse(localStorage.getItem("fn-dev") || "null"); return d && /^[a-z0-9]{16}$/.test(d.id || "") ? d.id : null; } catch (e) { return null; } };
  function myName() {
    if (G.pname) return G.pname;
    try {
      const g = JSON.parse(localStorage.getItem("fn-gname") || "null"); if (typeof g === "string" && g.trim()) return g.trim();
      for (const k of ["bs-me-v1", "sq-me-v1", "mf-me-v1", "draw-me-v1", "df-me-v1", "fn-night-v1", "seenjeem-remote-v1"]) {
        const v = JSON.parse(localStorage.getItem(k) || "null"), n = v && typeof v.name === "string" ? (self.FNT ? FNT.base(v.name) : v.name).trim() : "";
        if (n) return n;
      }
    } catch (e) {}
    return "";
  }
  function rankBox() {
    const r = paper && paper.rank;
    if (!db) return `<span class="muted">يحتاج نت.</span>`;
    if (!r) return `<span class="muted">لحظة…</span>`;
    if (!r.length) return `<span class="muted">محد حلّها للحين. كن الأول!</span>`;
    const id = devId();
    return `<ol class="rk">${r.slice(0, 5).map(x => `<li class="${x.id === id ? "me" : ""}"><span>${esc(x.n)}</span><b>${AR(clock(x.s))}</b></li>`).join("")}</ol>${r.length > 5 ? `<small>وحلّها ${AR(r.length)} شخص</small>` : ""}`;
  }
  function loadRank(n) {
    if (!db) return;
    db.ref("paper/" + n).get().then(s => {
      const v = s.val() || {};
      if (!paper || paper.n !== n) return;
      paper.rank = Object.entries(v).filter(([, x]) => x && typeof x.s === "number" && typeof x.n === "string").map(([id, x]) => ({ id, n: x.n, s: x.s })).sort((a, b) => a.s - b.s);
      const el = $("rank"); if (el) el.innerHTML = rankBox();
    }).catch(() => { if (paper) paper.rank = []; const el = $("rank"); if (el) el.innerHTML = `<span class="muted">ما قدرت أجيب الترتيب.</span>`; });
  }
  function sendRank(name) {
    const id = devId(), n = S.n; if (!db || !id) return;
    const nm = (name || myName()).trim();
    if (!nm) { const el = $("rank"); if (el) el.innerHTML = `<div class="gform"><input id="rn" maxlength="18" placeholder="اسمك في الترتيب" aria-label="اسمك"><button type="button" data-act="rname">حفظ</button></div>`; return; }
    const shown = self.FNT ? FNT.show(nm) : nm;
    db.ref("paper/" + n + "/" + id).set({ n: shown.slice(0, 60), s: S.P.s, at: Date.now() }).then(() => loadRank(n)).catch(() => loadRank(n));
  }
  function archiveView() {
    const P = G.paper || {}, list = Object.keys(P).map(Number).filter(n => P[n] && P[n].done);
    if (!list.includes(issueNo())) list.push(issueNo());
    let rows = "";
    for (const n of list.sort((a, b) => b - a).slice(0, 60)) {
      const L = issue(n), p = P[n], { h } = dateLine(p && p.done ? p.at || Date.now() : Date.now());
      rows += `<button type="button" class="arow" data-act="open" data-n="${n}"><span class="an">${AR(n)}</span><span class="at"><b>${esc((TH[L.t] || [""])[0])}</b><small>${esc(h)}</small></span><span class="as">${p && p.done ? "✔ " + AR(clock(p.s)) : p && (p.f || []).length ? "✏️" : ""}</span></button>`;
    }
    app.innerHTML = `<div class="paperwrap"><div class="ptools"><button type="button" data-act="paper">→ عدد اليوم</button></div>
      <article class="page"><div class="mast"><h1>الجـمـعـة</h1><div class="msub">الأعداد القديمة</div></div><div class="secbar">الأرشيف</div><div class="alist">${rows}</div></article></div>`;
  }

  /* ---------------- screens ---------------- */
  function overlay(html) { closeOv(); const d = document.createElement("div"); d.className = "ov"; d.id = "ov"; d.innerHTML = `<div class="box">${html}</div>`; document.body.appendChild(d); }
  function closeOv() { const o = $("ov"); if (o) o.remove(); }
  function toast(t, ms) { document.querySelectorAll(".toast").forEach(x => x.remove()); const d = document.createElement("div"); d.className = "toast"; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), ms || 2600); }
  const sndLabel = () => self.FX && FX.muted ? "🔇 الصوت مطفي" : "🔊 الصوت شغال";
  function pause() {
    if (!S || S.lock) return; S.paused = true;
    overlay(`<h2>⏸ وقفة</h2><p class="small muted" style="margin:0 0 12px">المستوى ${S.L.n} · ${S.P.f.length} من ${S.L.words.length} كلمات</p>
      <button type="button" class="btn" data-act="resume">كمّل</button><button type="button" class="btn alt" data-act="mute">${sndLabel()}</button><button type="button" class="btn alt" data-act="menu">القائمة</button>`);
  }
  function resume() { closeOv(); if (S) S.paused = false; }
  function render() {
    document.querySelectorAll(".toast").forEach(x => x.remove());
    document.body.classList.toggle("playing", view === "play");
    document.body.classList.toggle("onpaper", view === "paper" || view === "archive");
    if (view === "play") return playView();
    if (view === "paper") return paperView();
    if (view === "archive") return archiveView();
    (view === "end" ? endView : introView)();
  }

  /* ---------------- buttons, the clock ---------------- */
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const a = b.dataset.act;
    if (a === "start") startLevel();
    else if (a === "again") { G.round = (G.round || 0) + 1; G.level = 1; G.cur = null; save(); backup(); startLevel(); }
    else if (a === "pause") pause();
    else if (a === "resume") resume();
    else if (a === "hint") hint();
    else if (a === "mute") { const x = document.querySelector(".fx-mute"); if (x) x.click(); b.textContent = sndLabel(); }
    else if (a === "menu") { closeOv(); S = null; paper = null; save(); backup(); view = "intro"; render(); scrollTo(0, 0); }
    else if (a === "paper") { closeOv(); openPaper(); }
    else if (a === "open") openPaper(+b.dataset.n);
    else if (a === "archive") { S = null; view = "archive"; render(); scrollTo(0, 0); }
    else if (a === "guess") guessBox();
    else if (a === "gx") { const g = $("guess"); if (g) g.innerHTML = `<button type="button" class="gbtn" data-act="guess">✍️ عرفت الحل؟ اكتبه</button>`; }
    else if (a === "gok") checkGuess();
    else if (a === "rname") { const v = (($("rn") || {}).value || "").trim(); if (v) { G.pname = v.slice(0, 18); save(); sendRank(G.pname); } }
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Enter" && e.target && e.target.id === "gin") { e.preventDefault(); checkGuess(); }
    if (e.key === "Enter" && e.target && e.target.id === "rn") { e.preventDefault(); const b = document.querySelector("[data-act=rname]"); if (b) b.click(); }
    if (e.key === "Escape" && $("ov")) resume();
  });
  document.addEventListener("touchmove", e => { if (view === "play") e.preventDefault(); }, { passive: false });
  let tickN = 0;
  setInterval(() => {
    if (!S || S.paused || S.lock || S.done || document.hidden || $("ov") || (view !== "play" && view !== "paper")) return;
    S.P.t++; tickN++;
    const tm = $("tm"); if (tm) tm.textContent = view === "paper" ? "⏱ " + AR(clock(S.P.t)) : clock(S.P.t);
    if (tickN % 5 === 0) { const k = dayKey(); G.days[k] = (G.days[k] || 0) + 5 / 60; save(); }
  }, 1000);
  document.addEventListener("visibilitychange", () => { if (document.hidden) { save(); if (view === "play" && S && !S.paused && !S.lock) pause(); } });

  // mind/search/#paper opens today's newspaper (#paper=12: that issue)
  const fromLink = () => { if (!/^#paper(=\d+)?$/.test(location.hash)) return false; const m = /=(\d+)/.exec(location.hash); closeOv(); openPaper(m ? +m[1] : 0); return true; };
  addEventListener("hashchange", fromLink);
  if (!N) app.innerHTML = `<div class="card">ما قدرت أفتح المستويات. حدّث الصفحة.</div>`;
  else if (!fromLink()) render();
  if (self.FX && !document.querySelector(".fx-mute")) FX.muteButton();
  self.SEARCH = { get G() { return G; }, get S() { return S; }, parse, level, issueNo, line, found, finish, openPaper, norm };   // test hook
})();
