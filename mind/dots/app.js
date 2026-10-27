/* توصيل النقاط — join every pair of same-coloured dots with a line. Lines never cross, and every dot
   on the board has to be used. 400 levels in order (levels.js), two per session, 10 minutes on the clock.
   Touch a coloured dot to start (or restart) its line; touch the middle of a line to cut it there and go on.
   Progress is saved on this phone (dots-v1) and backed up by MindSync (../sync.js). */
(function () {
  "use strict";
  const LV = self.DOTS_LEVELS || [], app = document.getElementById("app");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const N = n => Math.round(n).toLocaleString("en-US");
  const rint = n => Math.floor(Math.random() * n);
  const KEY = "dots-v1", PER = 2, TIME = 10 * 60 * 1000, TOTAL = LV.length;
  const COLORS = ["#ff4d3d", "#ffd43b", "#ff5fd2", "#ff9a1f", "#3ee65a", "#4fe3ff", "#3d8bff", "#a855f7", "#f1f3f5", "#c08457"];

  /* ---------------- saved progress ---------------- */
  const fresh = () => ({ v: 1, level: 1, best: 0, top: [], sessions: [], days: {}, first: null });
  let G;
  try { G = Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY) || "null") || {}); } catch (e) { G = fresh(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(G)); } catch (e) {} };
  const dayKey = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const totalMin = () => Object.values(G.days).reduce((a, b) => a + b, 0);
  function streak() {
    let n = 0; const d = new Date();
    if (!G.days[dayKey(d)]) d.setDate(d.getDate() - 1);
    while (G.days[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function merge(a, b) {   // two copies of the progress → one (nothing is lost)
    const out = fresh(), seen = new Set();
    a.sessions.concat(b.sessions).sort((x, y) => x.t - y.t).forEach(s => { if (!seen.has(s.t)) { seen.add(s.t); out.sessions.push(s); } });
    out.sessions = out.sessions.slice(-200);
    out.level = Math.max(a.level || 1, b.level || 1);
    out.best = Math.max(a.best || 0, b.best || 0);
    const tops = new Map(); a.top.concat(b.top).forEach(x => tops.set(x.t, x));
    out.top = [...tops.values()].sort((x, y) => y.score - x.score || x.t - y.t).slice(0, 5);
    Object.keys(Object.assign({}, a.days, b.days)).forEach(k => out.days[k] = Math.max(a.days[k] || 0, b.days[k] || 0));
    out.first = [a.first, b.first].filter(x => x).sort()[0] || null;
    return out;
  }
  const take = o => { G = merge(G, Object.assign(fresh(), o)); save(); };
  if (self.MindSync) {
    MindSync.register("dots", { get: () => G, merge: take, after: () => { if (view === "intro") render(); } });
    const inc = MindSync.incoming("dots"); if (inc) { take(inc); MindSync.save("dots"); }
  }

  /* ---------------- a level ---------------- */
  function colourMap(lv) {   // the same level always gets the same colours; different levels get different ones
    const idx = COLORS.map((_, i) => i); let s = (lv * 7919) % 2147483646 + 1;
    for (let i = idx.length - 1; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    return idx;
  }
  function parse(lv) {
    const [ns, g] = LV[lv - 1].split(":"), n = +ns, k = new Set(g.toLowerCase()).size;
    const nb = i => { const r = Math.floor(i / n), c = i % n, o = []; if (r > 0) o.push(i - n); if (r < n - 1) o.push(i + n); if (c > 0) o.push(i - 1); if (c < n - 1) o.push(i + 1); return o; };
    const ends = [], sol = [], letters = [...new Set(g.toLowerCase())].sort();
    letters.forEach(ch => {
      const caps = [...g].map((x, i) => x === ch.toUpperCase() ? i : -1).filter(i => i >= 0);
      const path = [caps[0]]; let prev = -1, cur = caps[0];
      while (cur !== caps[1]) { const nx = nb(cur).find(u => u !== prev && g[u].toLowerCase() === ch); prev = cur; cur = nx; path.push(cur); }
      ends.push(caps); sol.push(path);
    });
    const map = colourMap(lv);
    return { lv, n, k, ends, sol, nb, cols: letters.map((_, i) => COLORS[map[i]]) };
  }

  /* ---------------- views ---------------- */
  let view = "intro", S = null, P = null, last = null;
  const lvlNow = () => Math.min(G.level, TOTAL);
  const sizeOf = lv => +LV[Math.max(0, Math.min(TOTAL, lv) - 1)].split(":")[0];
  function progressCard() {
    const done = Math.min(TOTAL, G.level - 1), tot = totalMin();
    const bar = (v, max) => `<div class="bar"><i style="width:${Math.min(100, v / max * 100).toFixed(1)}%"></i></div>`;
    return `<div class="card"><h2>📊 تقدمك</h2><div class="prog">
      <div><small>المستوى</small><b>${G.level > TOTAL ? TOTAL : G.level}</b> من ${TOTAL}${bar(done, TOTAL)}</div>
      <div><small>أيام متتالية</small><b>${streak()}</b> ${streak() === 1 ? "يوم" : "أيام"} 🔥</div>
      <div><small>الجلسات</small><b>${G.sessions.length}</b> جلسة</div>
      <div><small>مجموع لعبك</small>${tot < 60 ? `<b>${Math.floor(tot)}</b> دقيقة` : `<b>${(tot / 60).toFixed(1)}</b> ساعة`}</div>
    </div></div>`;
  }
  function introView() {
    const n = sizeOf(lvlNow());
    app.innerHTML = `<header class="hero"><img src="../../icons/dots.png" alt=""><h1>توصيل النقاط</h1><p>تمرين التخطيط</p></header>
      <div class="card record"><div><small>🏅 أفضل نتيجة</small><b>${G.best ? N(G.best) : "–"}</b></div><div><small>📶 المستوى</small><b>${G.level > TOTAL ? TOTAL : G.level}<span class="of">/${TOTAL}</span></b></div></div>
      <button type="button" class="btn" data-act="start">${G.level > TOTAL ? "العب (خلّصت كل المستويات 🎓)" : `ابدأ الجلسة: لغزين (شبكة ${n}×${n})`}</button>
      <p class="tip">⏱️ عندك 10 دقايق للغزين. وكل ما حليت أسرع، أخذت نقاط أكثر.</p>
      <div class="card"><h2>🎯 وش تدرّب</h2><div class="chips"><span class="chip">🧩 التخطيط</span><span class="chip">🗺️ تخيّل الأماكن والطرق</span><span class="chip">👀 الانتباه</span></div>
        <p class="small" style="margin:10px 0 0">🔬 <b>قوة الدليل العلمي:</b> ضعيف. اللعبة تشغّل هالمهارات، بس ما انثبت إنها تحسّنها برا اللعبة.</p></div>
      <div class="card"><h2>📅 كم تلعب؟</h2>
        <p style="margin:0">ننصح بـ <b>جلسة وحدة يومياً</b> (تقريباً 10 دقايق).</p>
        <p class="small muted" style="margin:6px 0 0">ما فيه دراسة تحدد كمية لهاللعبة، فهذي نصيحة عامة مو نتيجة دراسة. المهم تستمر.</p></div>
      <div class="card"><h2>🔬 وش لقوا الباحثين</h2>
        <p style="margin:0">دراسة سنة 2020 لقت إن أداء الناس في هاللعبة <b>مرتبط</b> بأدائهم في اختبارات الانتباه، وتخيّل الأشكال والأماكن، والتخطيط، وسرعة الحركة. يعني اللعبة تشغّل هالمهارات.</p>
        <p class="note" style="margin:10px 0 0">للحين ما فيه دراسة تثبت إن لعبها يحسّن هالمهارات في حياتك. اللي أكيد: بتتحسن في اللعبة نفسها مع التمرين.</p></div>
      ${progressCard()}
      <div class="card"><h2>🎮 كيف تلعب</h2><ol class="steps">
        <li>وصّل كل نقطة بأختها اللي بنفس اللون، بسحب صبعك.</li>
        <li>الخطوط ما تتقاطع، ولازم <b>تعبي كل النقاط</b> اللي في اللوحة.</li>
        <li>تبي تعيد خط؟ المس النقطة الملوّنة حقته ويبدأ من جديد.</li>
        <li>تبي تقصّره؟ المس أي مكان في نص الخط وكمّل منه.</li>
        <li>علقت؟ «💡 مساعدة» ترسم لك خط لون واحد صح، بس تنقص من نقاطك.</li>
        <li>400 مستوى بالترتيب. تبدأ بلوحة صغيرة 5×5 وتكبر لين 9×9.</li></ol></div>
      ${self.MindSync ? MindSync.card() : ""}`;
  }
  function relDay(t) {
    const d0 = new Date(); d0.setHours(0, 0, 0, 0);
    const days = Math.round((d0 - new Date(new Date(t).setHours(0, 0, 0, 0))) / 864e5);
    if (days <= 0) return "اليوم"; if (days === 1) return "أمس";
    if (days < 7) return `قبل ${days} أيام`;
    if (days < 30) { const w = Math.round(days / 7); return w === 1 ? "قبل أسبوع" : `قبل ${w} أسابيع`; }
    if (days < 365) { const m = Math.round(days / 30); return m === 1 ? "قبل شهر" : `قبل ${m} شهور`; }
    const y = Math.round(days / 365); return y === 1 ? "قبل سنة" : `قبل ${y} سنين`;
  }
  function topCard() {
    if (!G.top.length) return "";
    return `<div class="card"><h2>🏆 أعلى نتائجك</h2><ol class="tops">${G.top.map(x => `<li${last && x.t === last.t ? ' class="me"' : ""}><b>${N(x.score)}</b><span class="muted">${relDay(x.t)}</span></li>`).join("")}</ol></div>`;
  }
  function resultView() {
    const r = last;
    const msg = r.timeUp && !r.solved ? "⏰ خلص الوقت قبل ما تحل. اللغز يرجع لك الجلسة الجاية، وبتحله!"
      : r.record ? "🎉 أعلى نتيجة لك! كسرت رقمك السابق."
      : r.timeUp ? `⏰ خلص الوقت. حليت ${r.solved} من ${r.of}، والباقي يرجع لك الجلسة الجاية.`
      : "👌 حليت اللغزين. كمّل وحاول تكسر أعلى نتيجة لك.";
    app.innerHTML = `<div class="card big"><span class="u">نتيجتك في هالجلسة</span><div class="n">${N(r.score)}</div>
        <div class="stats"><div>${r.solved} من ${r.of}<small>حليت</small></div><div>${N(G.best)}<small>🏅 أعلى نتيجة</small></div><div>${G.level > TOTAL ? TOTAL : G.level}<small>📶 المستوى</small></div></div></div>
      <div class="card"><p class="msg" style="margin:0">${esc(msg)}</p>${r.hints ? `<p class="small muted" style="margin:6px 0 0">💡 استخدمت المساعدة ${r.hints} ${r.hints === 1 ? "مرة" : "مرات"}.</p>` : ""}</div>
      ${G.level > TOTAL && r.justDone ? `<div class="card done"><h2>🎓 خلّصت الـ400 مستوى!</h2><p style="margin:0">تقدر تكمّل تلعب مستويات عشوائية وتكسر أعلى نتيجة لك.</p></div>` : ""}
      ${topCard()}
      ${progressCard()}
      <button type="button" class="btn" data-act="start">العب جلسة ثانية</button>
      <a class="btn alt" href="../">ألعاب Mind Games</a>
      ${self.MindSync && MindSync.code() ? `<p class="tip">🔑 رمز تقدمك: <b style="direction:ltr;unicode-bidi:isolate">${MindSync.show(MindSync.code())}</b></p>` : ""}`;
  }
  function render() {
    document.body.classList.toggle("playing", view === "play");
    ({ intro: introView, play: playView, result: resultView }[view] || introView)();
  }

  /* ---------------- a session ---------------- */
  function startSession() {
    const list = [];
    for (let x = G.level; list.length < PER && x <= TOTAL; x++) list.push(x);
    while (list.length < PER) { const x = 1 + rint(TOTAL); if (!list.includes(x)) list.push(x); }   // all done: random levels
    S = { list, i: 0, score: 0, solved: 0, hints: 0, left: TIME, running: false, paused: false, active: 0, t0: Date.now(), startLevel: G.level };
    view = "play"; render(); load(list[0]); scrollTo(0, 0);
  }
  let cv, ctx, CS = 0, dpr = 1;
  function playView() {
    app.innerHTML = `<div class="pl">
      <div class="ptop"><button type="button" class="pause" data-act="pause" aria-label="إيقاف">⏸️</button><div class="pill"><span>النتيجة</span><b id="sc">0</b></div><div class="pill"><span>لغز</span><b id="pi"></b></div></div>
      <div class="ptime"><i id="tb"></i></div>
      <div class="ptools"><button type="button" class="hint" data-act="hint">💡 مساعدة</button><span id="lvl" class="muted"></span></div>
      <div class="pboard" id="pb"><canvas id="cv" aria-label="لوحة اللعب"></canvas></div>
      <p class="pmsg" id="pm" role="status"></p></div>`;
    cv = document.getElementById("cv"); ctx = cv.getContext("2d");
    cv.addEventListener("pointerdown", down); cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up); cv.addEventListener("lostpointercapture", up);
  }
  function fit() {
    const pb = document.getElementById("pb"); if (!pb || !P) return;
    CS = Math.floor(Math.min(pb.clientWidth - 8, pb.clientHeight - 8, 720)); if (CS < 200) CS = Math.min(pb.clientWidth - 8, 300);
    dpr = Math.min(2, self.devicePixelRatio || 1);
    cv.width = Math.round(CS * dpr); cv.height = Math.round(CS * dpr); cv.style.width = CS + "px"; cv.style.height = CS + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw();
  }
  function load(lv) {
    const p = parse(lv);
    P = Object.assign(p, { paths: p.ends.map(e => []), owner: new Int8Array(p.n * p.n).fill(-1), solved: false, hints: 0, used: 0 });
    p.ends.forEach((e, c) => e.forEach(x => P.owner[x] = c));
    document.getElementById("pi").textContent = `${S.i + 1} من ${S.list.length}`;
    document.getElementById("lvl").textContent = `المستوى ${lv} من ${TOTAL} · ${p.n}×${p.n}`;
    document.getElementById("sc").textContent = N(S.score);
    say("");
    S.running = true; fit(); tick();
  }
  function say(t) { const m = document.getElementById("pm"); if (m) m.textContent = t; }

  /* the clock: counts only while you are playing (not paused, not hidden, not between puzzles) */
  let lastT = 0, raf = 0;
  function tick() {
    cancelAnimationFrame(raf); lastT = performance.now();
    const step = now => {
      if (!S || view !== "play") return;
      const dt = now - lastT; lastT = now;
      if (S.running && !S.paused && !document.hidden) { S.left -= dt; S.active += dt; if (P && !P.solved) P.used += dt; }
      const tb = document.getElementById("tb"); if (tb) tb.style.width = Math.max(0, S.left / TIME * 100).toFixed(2) + "%";
      if (S.left <= 0 && S.running) { S.running = false; return finish(true); }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  /* ---------------- drawing ---------------- */
  function draw() {
    if (!P || !ctx) return;
    const n = P.n, cs = CS / n, X = i => (i % n) * cs + cs / 2, Y = i => Math.floor(i / n) * cs + cs / 2;
    ctx.clearRect(0, 0, CS, CS);
    const occ = occupancy();
    for (let i = 0; i < n * n; i++) if (occ[i] < 0) { ctx.fillStyle = "rgba(8,10,36,.78)"; ctx.beginPath(); ctx.arc(X(i), Y(i), cs * 0.2, 0, Math.PI * 2); ctx.fill(); }
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    P.paths.forEach((p, c) => {
      if (p.length < 2) return;
      ctx.strokeStyle = P.cols[c]; ctx.lineWidth = cs * 0.42; ctx.beginPath();
      p.forEach((x, j) => j ? ctx.lineTo(X(x), Y(x)) : ctx.moveTo(X(x), Y(x))); ctx.stroke();
    });
    P.ends.forEach((e, c) => e.forEach(x => {
      ctx.fillStyle = P.cols[c]; ctx.beginPath(); ctx.arc(X(x), Y(x), cs * 0.33, 0, Math.PI * 2); ctx.fill();
      if (done(c)) { ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = Math.max(2, cs * 0.06); ctx.stroke(); }
    }));
    if (drag && pt) { ctx.fillStyle = P.cols[drag.c] + "40"; ctx.beginPath(); ctx.arc(pt[0], pt[1], cs * 0.8, 0, Math.PI * 2); ctx.fill(); }
  }
  function occupancy() {
    const occ = new Int8Array(P.n * P.n).fill(-1);
    P.ends.forEach((e, c) => e.forEach(x => occ[x] = c));
    P.paths.forEach((p, c) => p.forEach(x => occ[x] = c));
    return occ;
  }
  const done = c => { const p = P.paths[c]; return p.length >= 2 && p[0] !== p[p.length - 1] && P.owner[p[p.length - 1]] === c && P.ends[c].includes(p[0]); };

  /* ---------------- touch ---------------- */
  let drag = null, pt = null;
  function cellAt(e) {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, cs = CS / P.n;
    pt = [x, y];
    const c = Math.max(0, Math.min(P.n - 1, Math.floor(x / cs))), rr = Math.max(0, Math.min(P.n - 1, Math.floor(y / cs)));
    return rr * P.n + c;
  }
  function down(e) {
    if (!P || P.solved || !S || S.paused || !S.running) return;
    e.preventDefault();
    const x = cellAt(e);
    let c = P.owner[x];
    if (c >= 0) P.paths[c] = [x];                                      // a dot: its line starts again from here
    else {
      c = P.paths.findIndex(p => p.includes(x));
      if (c < 0) { drag = null; return; }
      P.paths[c] = P.paths[c].slice(0, P.paths[c].indexOf(x) + 1);    // middle of a line: cut it here and go on
    }
    try { cv.setPointerCapture(e.pointerId); } catch (er) {}
    drag = { c, snap: P.paths.map(p => p.slice()) };
    say(""); draw();
  }
  function move(e) {
    if (!drag) return;
    e.preventDefault();
    const target = cellAt(e), n = P.n;
    let guard = 0;
    while (guard++ < 2 * n) {
      const p = P.paths[drag.c], head = p[p.length - 1];
      if (head === target) break;
      const hr = Math.floor(head / n), hc = head % n, tr = Math.floor(target / n), tc = target % n;
      const next = Math.abs(tr - hr) >= Math.abs(tc - hc) ? head + Math.sign(tr - hr) * n : head + Math.sign(tc - hc);
      if (!stepTo(next)) break;
    }
    draw();
  }
  function stepTo(x) {
    const c = drag.c, p = P.paths[c], at = p.indexOf(x);
    if (at >= 0) { P.paths[c] = p.slice(0, at + 1); restore(); return true; }    // going back over your own line
    if (done(c)) return false;                                                   // finished line: go back to change it
    if (P.owner[x] >= 0 && P.owner[x] !== c) return false;                       // another colour's dot
    p.push(x); restore(); return true;
  }
  // lines you cut while dragging come back if you move away again
  function restore() {
    const mine = new Set(P.paths[drag.c]);
    P.paths.forEach((_, d) => {
      if (d === drag.c) return;
      const s = drag.snap[d], i = s.findIndex(x => mine.has(x));
      P.paths[d] = i < 0 ? s.slice() : s.slice(0, i);
    });
  }
  function up() {
    if (!drag) return;
    drag = null; pt = null; draw();
    check();
  }
  function check() {
    if (!P || P.solved) return;
    const all = P.paths.every((_, c) => done(c)), full = occupancy().every(x => x >= 0) && P.paths.reduce((a, p) => a + p.length, 0) >= P.n * P.n;
    if (all && full) solved();
    else if (all) say("✋ باقي نقاط فاضية، لازم تعبي كل النقاط.");
  }

  /* ---------------- help, solved, end ---------------- */
  const same = (a, b) => a.length === b.length && (a.every((x, i) => x === b[i]) || a.every((x, i) => x === b[b.length - 1 - i]));
  function hint() {
    if (!P || P.solved || !S.running || S.paused) return;
    const wrong = P.sol.map((_, c) => c).filter(c => !same(P.paths[c], P.sol[c])).sort((a, b) => P.sol[b].length - P.sol[a].length);
    if (!wrong.length) return;
    const c = wrong[0], mine = new Set(P.sol[c]);
    P.paths[c] = P.sol[c].slice();
    P.paths.forEach((p, d) => { if (d === c) return; const i = p.findIndex(x => mine.has(x)); if (i >= 0) P.paths[d] = p.slice(0, i); });
    P.hints++; S.hints++;
    say("💡 رسمت لك خط لون واحد صح."); draw(); check();
  }
  function points() {
    const cells = P.n * P.n, base = cells * 10, T = cells * 4000;
    const bonus = Math.round(base * Math.max(0, 1 - P.used / T));
    return Math.max(Math.round(base * 0.2), base + bonus - Math.round(base * 0.25 * P.hints));
  }
  function solved() {
    P.solved = true; S.running = false;
    const pts = points(); S.score += pts; S.solved++;
    if (P.lv === G.level) { G.level++; if (!G.first) G.first = dayKey(); save(); if (self.MindSync) MindSync.save("dots"); }   // a solved level is never lost
    document.getElementById("sc").textContent = N(S.score);
    say(`✅ ممتاز! +${N(pts)}`);
    if (self.FA) { FA.play("right", [30, 40, 30]); FA.confetti(); }
    draw();
    setTimeout(() => {
      if (!S || view !== "play") return;
      S.i++;
      if (S.i >= S.list.length) finish(false); else load(S.list[S.i]);
    }, 1500);
  }
  function finish(timeUp) {
    const s = S; if (!s) return;
    S = null; cancelAnimationFrame(raf);
    const mins = Math.min(15, s.active / 60000), today = dayKey();
    G.days[today] = (G.days[today] || 0) + mins;
    if (!G.first) G.first = today;
    const t = Date.now(), prevBest = G.best;
    G.sessions.push({ t, score: s.score, solved: s.solved, of: s.list.length, lv: s.list, hints: s.hints }); G.sessions = G.sessions.slice(-200);
    G.top = G.top.concat([{ t, score: s.score }]).sort((x, y) => y.score - x.score || x.t - y.t).slice(0, 5);
    const record = s.score > 0 && s.score > prevBest; if (record) G.best = s.score;
    save(); if (self.MindSync) MindSync.save("dots");
    last = { t, score: s.score, solved: s.solved, of: s.list.length, hints: s.hints, timeUp, record, justDone: s.startLevel <= TOTAL && G.level > TOTAL };
    view = "result"; render(); scrollTo(0, 0);
    if (self.FA) { if (record) { FA.confetti(); FA.play("win", [40, 40, 120]); } else FA.play("reveal"); }
  }

  /* ---------------- pause ---------------- */
  function pause() {
    if (!S || S.paused) return;
    S.paused = true; drag = null;
    const o = document.createElement("div"); o.className = "ov"; o.id = "ov";
    o.innerHTML = `<div class="box"><h2>⏸️ وقفنا</h2><p class="small muted" style="margin:0 0 12px">الوقت واقف لين ترجع.</p>
      <button type="button" class="btn" data-act="resume">كمّل</button><button type="button" class="btn alt" data-act="reset">أعد اللغز من جديد</button><button type="button" class="btn alt" data-act="quit">اطلع</button></div>`;
    document.body.appendChild(o);
    o.querySelector("[data-act=resume]").focus({ preventScroll: true });
  }
  function resume() { const o = document.getElementById("ov"); if (o) o.remove(); if (S) { S.paused = false; lastT = performance.now(); } }

  /* ---------------- buttons ---------------- */
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const a = b.dataset.act;
    if (a === "start") startSession();
    else if (a === "pause") pause();
    else if (a === "resume") resume();
    else if (a === "hint") hint();
    else if (a === "reset") { if (P && !P.solved) { P.paths = P.ends.map(() => []); draw(); say(""); } resume(); }
    else if (a === "quit") {
      if (!confirm("تطلع من الجلسة؟ مستواك محفوظ، بس نتيجة هالجلسة ما تنحسب.")) return;
      resume(); S = null; P = null; cancelAnimationFrame(raf); view = "intro"; render(); scrollTo(0, 0);
    }
  });
  // the screen stays still while you play: no scrolling, no pull-to-refresh, no zoom
  document.addEventListener("touchmove", e => { if (view === "play") e.preventDefault(); }, { passive: false });
  document.addEventListener("visibilitychange", () => { if (document.hidden && view === "play" && S) pause(); });
  let rz = 0; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (view === "play") fit(); }, 150); });

  render();
  if (self.FX && !document.querySelector(".fx-mute")) FX.muteButton();
  self.DOTS = { get G() { return G; }, get P() { return P; }, get S() { return S; }, parse, TOTAL };   // test hook
})();
