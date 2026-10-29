/* لوحة الكلمات — swipe over the letters in the circle to make words; the words of the level fill a small
   crossword. A real word that is not in the board is a «كلمة إضافية» and gives a star; 5 stars buy a hint
   (one letter). 400 levels (levels.js), from 3 letters to 7, and after each one «كلمة ومعناها».
   Progress on this phone (words-v1), backed up by MindSync (../sync.js). */
(function () {
  "use strict";
  const app = document.getElementById("app");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rint = n => Math.floor(Math.random() * n);
  const $ = id => document.getElementById(id);
  const LV = self.WORDS_LEVELS || [], MEAN = self.WORDS_MEAN || [], N = LV.length;
  const DICT = new Set((self.WORDS_DICT || "").split(" "));   // real words: «كلمة إضافية» when they are not in the board
  const CLUE = self.WORDS_CLUE || {};                          // classical words: their meaning, shown when tapped
  const T = self.WORDS_TEST || {};   // only the automatic tests set this
  const KEY = "words-v1", HINT = 5, START = 10, OWNER = "words-owner";
  // the owner's secret code (5 taps on the level number): only its PBKDF2 hash is here, never the code
  const OWNER_HASH = "a9b74395a868a7860184bb3c80138eea1442f47d6ee1b7263fe0f7c158027ead";

  /* ---------------- the levels ---------------- */
  // "letters|rows|cols|word,r,c,d[,j];…" · d = h (right to left) or v (top to bottom) · j = a classical word
  function parse(n) {
    const [letters, h, w, ws] = LV[n - 1].split("|");
    const words = ws.split(";").map(x => { const [t, r, c, d, j] = x.split(","); return { t, r: +r, c: +c, d, j: j === "j" }; });
    const cells = {};
    words.forEach((wd, i) => {
      wd.keys = [...wd.t].map((ch, k) => {
        const key = wd.d === "h" ? wd.r + "," + (wd.c + k) : (wd.r + k) + "," + wd.c;
        (cells[key] = cells[key] || { ch, ws: [] }).ws.push(i);
        return key;
      });
    });
    // a classical word shows its first letter from the start (✨), and its meaning when you tap it
    const given = new Set(words.filter(x => x.j).map(x => x.keys[0]));
    return { n, letters: [...letters], h: +h, w: +w, words, cells, given, sig: letters + "|" + ws };
  }

  /* ---------------- saved progress ---------------- */
  const fresh = () => ({ v: 1, level: 1, round: 0, stars: START, cur: null, words: 0, bonus: 0, hints: 0, sessions: [], days: {}, first: null });
  let G;
  try { G = Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY) || "null") || {}); } catch (e) { G = fresh(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(G)); } catch (e) {} };
  const backup = () => { if (self.MindSync) MindSync.save("words"); };
  const dayKey = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const totalMin = () => Object.values(G.days).reduce((a, b) => a + b, 0);
  function streakDays() { let n = 0; const d = new Date(); if (!G.days[dayKey(d)]) d.setDate(d.getDate() - 1); while (G.days[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); } return n; }
  const ahead = (a, b) => (a.round || 0) - (b.round || 0) || (a.level || 1) - (b.level || 1) || (a.stars || 0) - (b.stars || 0);
  function merge(a, b) {
    const hi = ahead(b, a) > 0 ? b : a, out = Object.assign(fresh(), hi), seen = new Set();
    out.sessions = [];
    (a.sessions || []).concat(b.sessions || []).sort((x, y) => x.t - y.t).forEach(s => { if (!seen.has(s.t)) { seen.add(s.t); out.sessions.push(s); } });
    out.sessions = out.sessions.slice(-500);
    out.days = {};
    Object.keys(Object.assign({}, a.days, b.days)).forEach(k => out.days[k] = Math.max((a.days || {})[k] || 0, (b.days || {})[k] || 0));
    out.first = [a.first, b.first].filter(x => x).sort()[0] || null;
    ["words", "bonus", "hints"].forEach(k => out[k] = Math.max(a[k] || 0, b[k] || 0));
    // both phones in the middle of the same level: keep what each one found
    if (a.cur && b.cur && a.cur.n === b.cur.n && a.level === b.level && (a.round || 0) === (b.round || 0)) {
      const u = k => [...new Set((a.cur[k] || []).concat(b.cur[k] || []))];
      out.cur = { n: a.cur.n, f: u("f"), b: u("b"), h: u("h") };
    }
    return out;
  }
  let view = "intro", S = null, last = null;
  const take = o => { G = merge(G, Object.assign(fresh(), o)); save(); if (view === "play" && S && (!G.cur || G.cur.n !== S.L.n || G.level !== S.L.n)) startLevel(); };
  if (self.MindSync) {
    MindSync.register("words", { get: () => G, merge: take, after: () => { if (view === "intro") render(); } });
    const inc = MindSync.incoming("words"); if (inc) { take(inc); backup(); }
  }
  const allDone = () => G.level > N;

  /* ---------------- sound ---------------- */
  let AC = null;
  function ac() {
    if (!AC) { const C = self.AudioContext || self.webkitAudioContext; if (C) try { AC = new C(); } catch (e) {} }
    if (AC && AC.state === "suspended") AC.resume().catch(() => {});
    return AC;
  }
  const muted = () => self.FX && FX.muted;
  function tone(f, t0 = 0, dur = 0.3, type = "triangle", vol = 0.15) {
    const a = ac(); if (!a || muted()) return;
    const t = a.currentTime + t0, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  const NOTES = [523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77, 1046.5];
  const sLetter = i => tone(NOTES[Math.min(i, 7)], 0, 0.22, "sine", 0.13);
  const sFound = len => [0, 1, 2].forEach(i => tone(NOTES[Math.min(7, len - 2 + i * 2)], i * 0.07, 0.35, "triangle", 0.16));
  const sBonus = () => [1318.5, 1568, 2093].forEach((f, i) => tone(f, i * 0.06, 0.3, "sine", 0.11));
  const sNo = () => { tone(220, 0, 0.18, "sine", 0.12); tone(185, 0.09, 0.22, "sine", 0.1); };
  const vib = p => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} };

  /* ---------------- pages ---------------- */
  function progressCard() {
    const tot = totalMin(), done = Math.min(N, G.level - 1) + (G.round || 0) * N;
    return `<div class="card"><h2>📊 تقدمك</h2><div class="prog">
      <div><small>📶 المستويات اللي خلّصتها</small><b>${done}</b> من ${N}</div>
      <div><small>🔤 كلمات لقيتها</small><b>${(G.words || 0).toLocaleString("en-US")}</b> كلمة</div>
      <div><small>⭐ كلمات إضافية</small><b>${(G.bonus || 0).toLocaleString("en-US")}</b> كلمة</div>
      <div><small>أيام متتالية</small><b>${streakDays()}</b> ${streakDays() === 1 ? "يوم" : "أيام"} 🔥</div>
      <div style="grid-column:1/-1"><small>مجموع لعبك</small>${tot < 60 ? `<b>${Math.floor(tot)}</b> دقيقة` : `<b>${(tot / 60).toFixed(1)}</b> ساعة`}</div>
    </div></div>`;
  }
  function introView() {
    const lvl = Math.min(G.level, N);
    app.innerHTML = `<header class="hero"><img src="../../icons/words.png" alt=""><h1>لوحة الكلمات</h1><p>تمرين المفردات</p></header>
      <div class="card record"><div data-act="lvtap"><small>${allDone() ? "خلّصت" : G.level > 1 ? "وصلت" : "تبدأ من"}</small><b>${allDone() ? "🏆 كل المستويات" : "المستوى " + lvl}</b><small class="of">من ${N}</small></div><div><small>نجومك</small><b>⭐ ${G.stars}</b><small class="of">💡 = ${HINT} ⭐</small></div></div>
      ${allDone() ? `<p class="note">🏆 خلّصت الـ${N} مستوى كلها! تقدر تعيدها من الأول، ونجومك وأرقامك تبقى معك.</p><button type="button" class="btn" data-act="again">العب من المستوى 1 من جديد</button>`
        : `<button type="button" class="btn" data-act="start">${G.level > 1 || G.cur ? "كمّل من المستوى " + lvl : "ابدأ المستوى 1"} ←</button>`}
      <div class="card" style="margin-top:14px"><h2>🎯 وش تدرّب</h2><div class="chips"><span class="chip">📚 المفردات</span><span class="chip">⚡ سرعة تذكّر الكلمات</span><span class="chip">🔤 الإملاء</span></div>
        <p class="small" style="margin:10px 0 0">🔬 <b>قوة الدليل العلمي:</b> قوي إنك تتعلم كلمات جديدة لما تشوفها مع معناها، وضعيف لفوايد العقل العامة.</p></div>
      <div class="card"><h2>📅 كم تلعب؟</h2>
        <p style="margin:0">ننصح بـ <b>10 إلى 15 دقيقة يومياً</b>، على راحتك وبدون وقت.</p>
        <p class="small muted" style="margin:6px 0 0">ما فيه دراسة تحدد كمية لهاللعبة بالذات، فهذي نصيحة عامة. المهم تستمر كل يوم شوي.</p></div>
      <div class="card"><h2>🔬 وش لقوا الباحثين</h2><ul class="list">
        <li>دراسة كبيرة (2019) على أكثر من 19 ألف شخص فوق الخمسين: اللي يحلّون ألغاز الكلمات كثير كان أداؤهم أفضل في اختبارات الانتباه والتفكير والذاكرة.</li>
        <li>بس الدراسة قارنت ناس بناس، وما تثبت إن الألغاز هي السبب.</li>
        <li>الأكيد: الكلمة اللي تشوفها وتستخدمها وتعرف معناها، تثبت في ذاكرتك. وهذا يكبّر حصيلتك من الكلمات.</li></ul>
        <p class="note" style="margin:10px 0 0">يعني: الفايدة الأكيدة هي الكلمات والمعاني اللي تتعلمها، وسرعة تذكّرك للكلمات.</p></div>
      ${progressCard()}
      <div class="card"><h2>🎮 كيف تلعب</h2><ul class="list small">
        <li>اسحب إصبعك على الحروف اللي في الدائرة عشان تكوّن كلمة، وارفع إصبعك.</li>
        <li>إذا الكلمة من كلمات اللوحة، تنكتب في مكانها. عبّي اللوحة كلها وتخلص المستوى.</li>
        <li>إذا هي كلمة صحيحة بس مو في اللوحة، تنحسب لك <b>كلمة إضافية</b> وتاخذ ⭐.</li>
        <li>💡 المساعدة تكشف لك حرف بـ ${HINT} ⭐، و🔀 يخلط الحروف عشان تشوفها بشكل جديد.</li>
        <li>✨ من المستوى 101 تجيك كلمات فصيحة جزلة: أول حرف منها ظاهر، واضغط على مربعاتها تشوف معناها ببلاش.</li>
        <li>كل مستوى تخلّصه يعطيك ⭐، وبعده تتعلم <b>كلمة ومعناها</b>.</li>
        <li>على الكمبيوتر: تقدر تكتب الحروف بالكيبورد وتضغط Enter.</li></ul></div>
      ${self.MindSync ? MindSync.card() : ""}`;
  }
  function endView() {
    const r = last, m = r.mean, top = r.n >= N;
    app.innerHTML = `<div class="end">
      <div style="text-align:center;font-size:54px;line-height:1.2;margin-top:8px">${top ? "🏆" : "🎉"}</div>
      <h1>${top ? "خلّصت كل المستويات!" : "أحسنت!"}</h1><p class="sub">خلّصت المستوى ${r.n}</p>
      <div class="stats"><div>${r.words}<small>كلمات</small></div><div>${r.bonus.length}<small>إضافية</small></div><div>⭐ ${G.stars}<small>نجومك</small></div></div>
      ${m ? `<div class="mean"><span class="lb">📖 كلمة ومعناها</span><div class="w">${esc(m[0])}</div><p>${esc(m[1])}</p>${m[2] ? `<p class="ex">مثال: ${esc(m[2])}</p>` : ""}</div>` : ""}
      ${r.bonus.length ? `<p class="found">الكلمات الإضافية اللي لقيتها: <b>${r.bonus.map(esc).join("، ")}</b></p>` : `<p class="found">💡 جرّب تدوّر على كلمات إضافية، كل وحدة تعطيك ⭐.</p>`}
      <div class="card" style="padding:12px 16px"><div style="display:flex;justify-content:space-between;font-weight:800;font-size:14px;margin-bottom:6px"><span>📶 المستوى ${r.n} من ${N}</span><span class="muted">${top ? "🏆 خلصت" : "باقي " + (N - r.n)}</span></div><div class="bar"><i style="width:${(r.n / N * 100).toFixed(1)}%"></i></div></div>
      ${top ? `<button type="button" class="btn" data-act="again">العب من المستوى 1 من جديد</button>` : `<button type="button" class="btn" data-act="start">المستوى ${r.n + 1} ←</button>`}
      <button type="button" class="btn alt" data-act="menu">القائمة</button>
      ${self.MindSync && MindSync.code() ? `<p class="tip">🔑 رمز تقدمك: <b style="direction:ltr;unicode-bidi:isolate">${MindSync.show(MindSync.code())}</b></p>` : ""}</div>`;
  }
  function render() {
    document.querySelectorAll(".toast").forEach(x => x.remove());   // a message from the last screen
    document.body.classList.toggle("playing", view === "play");
    if (view === "play") return playView();
    (view === "end" ? endView : introView)();
  }

  /* ---------------- a level ---------------- */
  function startLevel() {
    if (allDone()) { view = "intro"; render(); return; }
    ac();
    const L = parse(G.level);
    // a level half done on this phone, but the level itself changed since (an update): start it again
    if (G.cur && G.cur.n === L.n && (G.cur.k ? G.cur.k !== L.sig : L.n > 100)) G.cur = null;
    if (!G.cur || G.cur.n !== L.n) G.cur = { n: L.n, f: [], b: [], h: [] };
    G.cur.k = L.sig;
    const pos = L.letters.map((_, i) => i);
    S = { L, pos, sel: [], ptr: null, lock: false, paused: false, taps: [] };
    if (!G.first) G.first = dayKey();
    save();
    scrollTo(0, 0);
    view = "play"; render();
    setTimeout(fit, 350); setTimeout(fit, 1200);   // iPhone: the toolbars finish moving after the page changes
    // a level the phone left half done: words that were already complete count again
    autoFound();
    if (L.given.size) { let seen = null; try { seen = localStorage.getItem("words-tip-j"); } catch (e) {}
      if (!seen) { setTimeout(() => toast("✨ كلمة فصيحة! أول حرف منها ظاهر، واضغط على مربعاتها تشوف معناها.", 6000), 700); try { localStorage.setItem("words-tip-j", "1"); } catch (e) {} } }
  }
  function playView() {
    app.innerHTML = `<div class="pl">
      <div class="ptop"><button type="button" class="x" data-act="pause" aria-label="إيقاف"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="5.5" y="4" width="4.5" height="16" rx="1.6" fill="#fff"/><rect x="14" y="4" width="4.5" height="16" rx="1.6" fill="#fff"/></svg></button>
        <span class="n" id="lvn" data-act="lvtap">المستوى ${S.L.n}</span><span class="st" id="stars">⭐ ${G.stars}</span></div>
      <p class="pprog" id="prog"></p>
      <div class="board" id="board"><div class="cw" id="cw"></div></div>
      <div class="say" id="say" aria-live="polite"></div>
      <div class="wheelbox" id="wb"><div class="wheel" id="wheel"><svg id="trail"></svg>${S.L.letters.map((ch, i) => `<span class="k" data-k="${i}">${esc(ch)}</span>`).join("")}</div>
        <button type="button" class="side sh" data-act="shuffle" aria-label="اخلط الحروف">🔀</button>
        <button type="button" class="side hi" data-act="hint" aria-label="مساعدة: اكشف حرف">💡<small>${HINT} ⭐</small></button>
        <button type="button" class="side bo" data-act="bonus" aria-label="الكلمات الإضافية">📖<small id="bc">${G.cur.b.length}</small></button></div></div>`;
    paintBoard(); fit(); paintTop();
    const w = $("wheel");
    w.addEventListener("pointerdown", down); w.addEventListener("pointermove", move);
    w.addEventListener("pointerup", up); w.addEventListener("pointercancel", up);
  }
  const shown = () => {   // cells you can read: in a found word, opened by a hint, or a classical word's first letter
    const s = new Set([...G.cur.h, ...S.L.given]);
    G.cur.f.forEach(i => S.L.words[i].keys.forEach(k => s.add(k)));
    return s;
  };
  function paintBoard(neu, again) {
    const L = S.L, el = $("cw"); if (!el) return;
    const vis = shown(), fr = new Set(neu != null ? L.words[neu].keys : []), ag = new Set(again != null ? L.words[again].keys : []);
    const found = new Set(); G.cur.f.forEach(i => L.words[i].keys.forEach(k => found.add(k)));
    let h = "";
    for (let r = 0; r < L.h; r++) for (let c = L.w - 1; c >= 0; c--) {   // right to left
      const k = r + "," + c, cell = L.cells[k];
      if (!cell) { h += "<i></i>"; continue; }
      if (fr.has(k)) h += `<i class="c f new" style="animation-delay:${L.words[neu].keys.indexOf(k) * 70}ms">${esc(cell.ch)}</i>`;
      else if (found.has(k)) h += `<i class="c f${ag.has(k) ? " again" : ""}">${esc(cell.ch)}</i>`;
      else {
        const jw = cell.ws.find(i => L.words[i].j && !G.cur.f.includes(i));   // part of a classical word: tap for its meaning
        const tag = jw != null ? ` data-jw="${jw}"` : "", star = L.given.has(k) && jw != null ? " j" : "";
        h += vis.has(k) ? `<i class="c h${star}"${tag}>${esc(cell.ch)}</i>` : `<i class="c${star}" data-cell="${k}"${tag}></i>`;
      }
    }
    el.style.gridTemplateColumns = `repeat(${L.w},var(--cs))`;
    el.innerHTML = h;
  }
  function paintTop() {
    if (!$("stars")) return;
    $("stars").textContent = "⭐ " + G.stars;
    $("prog").textContent = `${G.cur.f.length} من ${S.L.words.length} كلمات`;
    if ($("bc")) $("bc").textContent = G.cur.b.length;
  }
  // sizes: the circle first, then the board takes the space that is left
  let geo = null;
  function fit() {
    if (view !== "play" || !S || !$("wheel")) return;
    const pl = document.querySelector(".pl"), vv = self.visualViewport;
    // only the part of the screen you can really see: iPhone Safari can lay the page out taller than that
    const H = Math.floor(Math.min(innerHeight, vv && vv.height ? vv.height : innerHeight)), W = app.clientWidth || innerWidth, n = S.L.letters.length;
    pl.style.height = H + "px";
    const land = matchMedia("(orientation:landscape) and (max-height:560px)").matches;
    const big = H >= 900 && W >= 700;   // computer or TV: everything a bit larger
    let D = land ? Math.min(H - 100, W / 2 - 130, 300) : Math.min(W - 130, H * 0.34, big ? 430 : 330);
    D = Math.max(160, Math.floor(D));
    const wheel = $("wheel"), wb = $("wb");
    for (let k = 0; k < 4; k++) {
      wheel.style.width = wheel.style.height = D + "px";
      wb.style.height = D + 16 + "px"; wb.style.width = Math.min(W - 24, D + 124) + "px";
      const over = pl.scrollHeight - pl.clientHeight;       // the board can shrink; the rest must fit
      if (over <= 0 || D <= 160) break;
      D = Math.max(160, D - over - 6);
    }
    const ks = Math.round(Math.min(84, D * (n <= 4 ? 0.28 : n === 5 ? 0.26 : n === 6 ? 0.24 : 0.22))), R = D / 2 - ks / 2 - D * 0.05;
    geo = { D, ks, R, c: [] };
    for (let j = 0; j < n; j++) { const a = -Math.PI / 2 + j * 2 * Math.PI / n; geo.c.push([D / 2 + R * Math.cos(a), D / 2 + R * Math.sin(a)]); }
    wheel.querySelectorAll(".k").forEach(el => {
      const [x, y] = geo.c[S.pos[+el.dataset.k]];
      el.style.left = x + "px"; el.style.top = y + "px"; el.style.width = el.style.height = ks + "px"; el.style.fontSize = Math.round(ks * 0.52) + "px";
    });
    $("trail").setAttribute("width", D); $("trail").setAttribute("height", D);
    $("cw").style.setProperty("--cs", "1px");      // measure the free space without the old board in it
    const b = $("board"), L = S.L, bw = b.clientWidth, bh = b.clientHeight - 12;
    const MAXC = big ? 76 : 58;
    let gap = 5, cs = Math.floor(Math.min((bw - (L.w - 1) * gap) / L.w, (bh - (L.h - 1) * gap) / L.h, MAXC));
    if (cs < 34) { gap = 3; cs = Math.floor(Math.min((bw - (L.w - 1) * gap) / L.w, (bh - (L.h - 1) * gap) / L.h, MAXC)); }
    $("cw").style.setProperty("--cs", Math.max(16, cs) + "px"); $("cw").style.setProperty("--gap", gap + "px");
    drawTrail();
  }
  if (self.visualViewport) visualViewport.addEventListener("resize", () => requestAnimationFrame(fit));
  addEventListener("resize", () => requestAnimationFrame(fit));

  /* ---------------- swiping ---------------- */
  const word = () => S.sel.map(i => S.L.letters[i]).join("");
  function at(e, grab) {
    const r = $("wheel").getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let best = -1, bd = 1e9;
    S.L.letters.forEach((_, i) => { const [cx, cy] = geo.c[S.pos[i]], d = Math.hypot(x - cx, y - cy); if (d < bd) { bd = d; best = i; } });
    return { i: bd < geo.ks * (grab ? 0.75 : 0.5) ? best : -1, x, y };
  }
  function pick(i) {
    if (i < 0) return;
    const k = S.sel.indexOf(i);
    if (k < 0) { S.sel.push(i); sLetter(S.sel.length - 1); vib(6); }
    else if (k === S.sel.length - 2) S.sel.pop();   // going back one letter takes it off
    paintSel();
  }
  function paintSel() {
    $("wheel").querySelectorAll(".k").forEach(el => el.classList.toggle("on", S.sel.includes(+el.dataset.k)));
    const w = word();
    if (w) { clearTimeout(S.sayT); S.sayT = null; $("say").innerHTML = `<b>${esc(w)}</b>`; }
    else if (!S.sayT) $("say").innerHTML = "";
    drawTrail();
  }
  function drawTrail(fx, fy) {
    const t = $("trail"); if (!t || !geo) return;
    const pts = S.sel.map(i => geo.c[S.pos[i]]);
    if (fx != null && S.sel.length) pts.push([fx, fy]);
    t.innerHTML = pts.length > 1 ? `<polyline points="${pts.map(p => p.map(v => v.toFixed(1)).join(",")).join(" ")}" fill="none" stroke="#ffd43b" stroke-width="${Math.max(8, geo.ks * 0.16).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round" opacity=".9" style="filter:drop-shadow(0 0 6px rgba(255,212,59,.7))"/>` : "";
  }
  function down(e) {
    if (!S || S.paused || S.lock || S.ptr != null) return;
    e.preventDefault();
    try { $("wheel").setPointerCapture(e.pointerId); } catch (x) {}
    S.ptr = e.pointerId; S.sel = [];
    const p = at(e, true); pick(p.i); drawTrail(p.x, p.y);
  }
  function move(e) {
    if (!S || S.ptr !== e.pointerId) return;
    const p = at(e, false); pick(p.i); drawTrail(p.x, p.y);
  }
  function up(e) {
    if (!S || S.ptr !== e.pointerId) return;
    S.ptr = null; submit();
  }

  /* ---------------- a word ---------------- */
  function say(html, ms = 1100) {
    const s = S;
    clearTimeout(s.sayT);
    $("say").innerHTML = html;
    s.sayT = setTimeout(() => { s.sayT = null; if (S === s && $("say") && !s.sel.length) $("say").innerHTML = ""; }, ms);
  }
  function submit(text) {
    if (!S || S.lock) return;
    const w = text != null ? text : word(), L = S.L;
    S.sel = []; paintSel(); drawTrail();
    if ([...w].length < 2) { $("say").innerHTML = ""; return; }
    const i = L.words.findIndex(x => x.t === w);
    if (i >= 0) {
      if (G.cur.f.includes(i)) { say(`<b class="old">${esc(w)}</b><small>موجودة في اللوحة ✓</small>`); paintBoard(null, i); return "again"; }
      found(i); return "word";
    }
    if (w.length >= 3 && DICT.has(w)) {
      if (G.cur.b.includes(w)) { say(`<b class="old">${esc(w)}</b><small>لقيتها قبل</small>`); return "again"; }
      G.cur.b.push(w); G.bonus++; G.stars++; save();
      say(`<b class="ok">${esc(w)}</b><small style="color:#7cf0c0">كلمة صحيحة مو في اللوحة · <bdi dir="ltr">+1 ⭐</bdi></small>`, 1500);
      sBonus(); vib(20); flyStar(); paintTop();
      return "bonus";
    }
    say(`<b class="no">${esc(w)}</b>`, 700); sNo(); vib(40);
    return "no";
  }
  function found(i) {
    G.cur.f.push(i); G.words++;
    save(); paintBoard(i); paintTop();
    sFound(S.L.words[i].t.length); vib([15, 30, 15]);
    say(`<b class="ok">${esc(S.L.words[i].t)}</b>`, 900);
    setTimeout(() => { if (S && view === "play") paintBoard(); }, 900);
    autoFound(true);
  }
  // a word whose letters are all showing (hints, or crossing words) counts as found
  function autoFound(quiet) {
    if (!S) return;
    const vis = shown();
    S.L.words.forEach((w, i) => { if (!G.cur.f.includes(i) && w.keys.every(k => vis.has(k))) { G.cur.f.push(i); G.words++; } });
    save(); paintTop();
    if (!quiet) paintBoard();
    if (G.cur.f.length === S.L.words.length && !S.lock) levelDone();
  }
  function flyStar() {
    const from = $("say").getBoundingClientRect(), to = $("stars").getBoundingClientRect();
    const s = document.createElement("span"); s.className = "fly"; s.textContent = "⭐";
    s.style.left = from.left + from.width / 2 - 13 + "px"; s.style.top = from.top + "px";
    document.body.appendChild(s);
    requestAnimationFrame(() => requestAnimationFrame(() => { s.style.transform = `translate(${to.left + to.width / 2 - (from.left + from.width / 2)}px,${to.top - from.top}px) scale(.7)`; s.style.opacity = ".4"; }));
    setTimeout(() => { s.remove(); const st = $("stars"); if (st) { st.classList.add("glow"); setTimeout(() => st.classList.remove("glow"), 500); } }, 720);
  }
  function hint() {
    if (!S || S.lock) return;
    if (G.stars < HINT) { toast(`💡 تحتاج ${HINT} ⭐ للمساعدة، وعندك ${G.stars}. لقِ كلمات إضافية أو خلّص المستوى وتجمع نجوم.`); sNo(); return; }
    // the word with the fewest letters showing; its first hidden letter
    const vis = shown(), L = S.L;
    let pickW = -1, bestScore = 1e9;
    L.words.forEach((w, i) => {
      if (G.cur.f.includes(i)) return;
      const open = w.keys.filter(k => vis.has(k)).length, sc = open / w.keys.length * 10 + w.keys.length * 0.1;
      if (sc < bestScore) { bestScore = sc; pickW = i; }
    });
    if (pickW < 0) return;
    const key = L.words[pickW].keys.find(k => !vis.has(k));
    G.stars -= HINT; G.hints++; G.cur.h.push(key); save();
    paintBoard(); paintTop(); sBonus();
    const el = [...$("cw").children].find(x => x.textContent && !x.classList.contains("f") && x.classList.contains("h") && cellKeyOf(x) === key);
    if (el) el.classList.add("flash");
    autoFound();
  }
  function cellKeyOf(el) {   // position of a cell element in the board (drawn right to left)
    const i = [...el.parentNode.children].indexOf(el), r = Math.floor(i / S.L.w), c = S.L.w - 1 - (i % S.L.w);
    return r + "," + c;
  }
  function shuffleLetters() {
    if (!S || S.lock || S.ptr != null) return;
    const n = S.pos.length; let p;
    do { p = S.pos.slice(); for (let i = n - 1; i > 0; i--) { const j = rint(i + 1); [p[i], p[j]] = [p[j], p[i]]; } } while (n > 1 && p.every((v, i) => v === S.pos[i]));
    S.pos = p; fit(); tone(700, 0, 0.12, "sine", 0.08);
  }
  function toast(t, ms = 2600) {
    document.querySelectorAll(".toast").forEach(x => x.remove());
    const d = document.createElement("div"); d.className = "toast"; d.setAttribute("role", "status"); d.textContent = t;
    document.body.appendChild(d); setTimeout(() => d.remove(), ms);
  }
  function levelDone() {
    if (S.lock) return;
    S.lock = true;
    const L = S.L, cur = G.cur;
    setTimeout(() => {
      if (!S || S.L !== L) return;
      G.stars += 1;
      G.sessions.push({ t: Date.now(), lv: L.n, b: cur.b.length, h: cur.h.length, r: G.round || 0 }); G.sessions = G.sessions.slice(-500);
      last = { n: L.n, words: L.words.length, bonus: cur.b.slice(), mean: MEAN[L.n - 1] };
      G.level = L.n + 1; G.cur = null;
      save(); backup();
      S = null; view = "end"; render(); scrollTo(0, 0);
      if (self.FA) { FA.confetti(); FA.play("win", [40, 40, 120]); }
    }, T.fast ? 50 : 1100);
  }

  /* ---------------- time played (only while the board is on the screen) ---------------- */
  let tick = 0;
  setInterval(() => {
    if (view !== "play" || !S || S.paused || document.hidden) return;
    const d = dayKey(); G.days[d] = (G.days[d] || 0) + 5 / 60;
    if (++tick % 6 === 0) save();
  }, 5000);

  /* ---------------- pause ---------------- */
  function overlay(html) {
    closeOv();
    const o = document.createElement("div"); o.className = "ov"; o.id = "ov"; o.innerHTML = `<div class="box">${html}</div>`;
    document.body.appendChild(o);
    const f = o.querySelector("input,[data-act]"); if (f) f.focus({ preventScroll: true });
    return o;
  }
  const closeOv = () => { const o = $("ov"); if (o) o.remove(); };
  const sndLabel = () => muted() ? "🔇 الصوت مقفل · شغّله" : "🔊 الصوت شغال · اقفله";
  function pause() {
    if (!S || S.paused) return;
    S.paused = true; S.ptr = null; S.sel = []; paintSel();
    overlay(`<h2>⏸️ وقفنا</h2><p class="small muted" style="margin:0 0 12px">اللي لقيته محفوظ، وترجع له متى ما بغيت.</p>
      <button type="button" class="btn" data-act="resume">كمّل</button><button type="button" class="btn alt" data-act="mute">${sndLabel()}</button><button type="button" class="btn alt" data-act="menu">القائمة</button>`);
  }
  function resume() { closeOv(); if (S) { S.paused = false; fit(); } }
  function bonusList() {
    if (!S) return;
    const b = G.cur.b;
    S.paused = true;
    overlay(`<h2>📖 الكلمات الإضافية</h2><p class="small muted" style="margin:0">كلمات صحيحة مو في اللوحة. كل وحدة أعطتك ⭐.</p>
      ${b.length ? `<div class="blist">${b.map(w => `<span>${esc(w)}</span>`).join("")}</div>` : `<p style="margin:14px 0">ما لقيت كلمات إضافية في هالمستوى للحين. جرّب!</p>`}
      <p class="small muted" style="margin:0 0 12px">كل الكلمات الإضافية اللي لقيتها: ${(G.bonus || 0).toLocaleString("en-US")}</p>
      <button type="button" class="btn" data-act="resume">رجوع</button>`);
  }

  /* ---------------- the owner: jump to any level ---------------- */
  const isOwner = () => { try { return localStorage.getItem(OWNER) === "1"; } catch (e) { return false; } };
  function lvTap() {
    const now = Date.now(), t = (lvTap.t || []).filter(x => now - x < 2500); t.push(now); lvTap.t = t;
    if (t.length < 5) return;
    lvTap.t = [];
    if (S) S.paused = true;
    if (isOwner()) jumpBox(); else codeBox();
  }
  function codeBox(msg) {
    overlay(`<h2>🔐 الرمز السري</h2><p class="small muted" style="margin:0">هذي لصاحب الموقع بس.</p>
      <input id="oc" type="password" inputmode="numeric" autocomplete="off" maxlength="12" aria-label="الرمز السري">
      <p class="small" id="ocm" style="margin:-6px 0 10px;color:#ffd43b">${esc(msg || "")}</p>
      <button type="button" class="btn" data-act="ocode">تأكيد</button><button type="button" class="btn alt" data-act="resume">إلغاء</button>`);
  }
  async function hashOf(code) {
    const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(code), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode("fridaynight-words-owner"), iterations: 120000, hash: "SHA-256" }, k, 256);
    return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, "0")).join("");
  }
  async function checkCode() {
    const v = (($("oc") || {}).value || "").replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).trim();
    let ok = false;
    try { ok = !!v && await hashOf(v) === OWNER_HASH; } catch (e) {}
    if (!ok) { codeBox("الرمز غلط."); return; }
    try { localStorage.setItem(OWNER, "1"); } catch (e) {}
    jumpBox();
  }
  function jumpBox(msg) {
    overlay(`<h2>🚀 انتقل لمستوى</h2><p class="small muted" style="margin:0">اكتب رقم من 1 إلى ${N}.</p>
      <input id="oj" type="number" inputmode="numeric" min="1" max="${N}" value="${Math.min(G.level, N)}" aria-label="رقم المستوى">
      <p class="small" style="margin:-6px 0 10px;color:#ffd43b">${esc(msg || "")}</p>
      <button type="button" class="btn" data-act="ojump">انتقل</button><button type="button" class="btn alt" data-act="resume">إلغاء</button>`);
  }
  function jump() {
    const n = parseInt(String(($("oj") || {}).value || "").replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)), 10);
    if (!(n >= 1 && n <= N)) { jumpBox(`اكتب رقم من 1 إلى ${N}.`); return; }
    closeOv();
    G.level = n; G.cur = null; save(); backup();
    startLevel();
  }

  /* ---------------- buttons and keys ---------------- */
  function clue(i) {
    const w = S.L.words[i], m = CLUE[w.t];
    if (!m) return;
    const n = [...w.t].length;
    toast(`✨ كلمة فصيحة من ${n} ${n <= 10 ? "حروف" : "حرف"}: ${m}`, 4200);
    tone(880, 0, 0.15, "sine", 0.08);
  }
  document.addEventListener("click", e => {
    const jc = view === "play" && S && e.target.closest("#cw [data-jw]");
    if (jc) { clue(+jc.dataset.jw); return; }
    const b = e.target.closest("[data-act]"); if (!b) return;
    const a = b.dataset.act;
    if (a === "start") startLevel();
    else if (a === "again") { G.round = (G.round || 0) + 1; G.level = 1; G.cur = null; save(); backup(); startLevel(); }
    else if (a === "pause") pause();
    else if (a === "resume") resume();
    else if (a === "hint") hint();
    else if (a === "shuffle") shuffleLetters();
    else if (a === "bonus") bonusList();
    else if (a === "lvtap") lvTap();
    else if (a === "ocode") checkCode();
    else if (a === "ojump") jump();
    else if (a === "mute") { const x = document.querySelector(".fx-mute"); if (x) x.click(); b.textContent = sndLabel(); }
    else if (a === "menu") { closeOv(); S = null; save(); backup(); view = "intro"; render(); scrollTo(0, 0); }
  });
  document.addEventListener("keydown", e => {
    const ov = $("ov");
    if (ov && e.key === "Enter") { const t = ov.querySelector("[data-act=ocode],[data-act=ojump]"); if (t) { e.preventDefault(); t.click(); } return; }
    if (ov && e.key === "Escape") { e.preventDefault(); resume(); return; }
    if (view !== "play" || !S || S.paused || S.lock || ov) return;
    if (e.key === "Enter") { e.preventDefault(); submit(); return; }
    if (e.key === "Backspace") { e.preventDefault(); S.sel.pop(); paintSel(); return; }
    if (e.key === "Escape") { S.sel = []; paintSel(); return; }
    if (e.key === " ") { e.preventDefault(); shuffleLetters(); return; }
    const i = S.L.letters.findIndex((ch, k) => ch === e.key && !S.sel.includes(k));
    if (i >= 0) { e.preventDefault(); S.sel.push(i); sLetter(S.sel.length - 1); paintSel(); }
  });
  document.addEventListener("touchmove", e => { if (view === "play") e.preventDefault(); }, { passive: false });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { save(); if (view === "play" && S && !S.paused) pause(); } });

  // from the owner's page: mind/words/#jump=300 opens that level (only on a phone marked as the owner's)
  function hashJump() {
    const m = /^#jump=(\d{1,4})$/.exec(location.hash || "");
    if (!m) return false;
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    const n = +m[1];
    if (!isOwner() || !(n >= 1 && n <= N)) return false;
    G.level = n; G.cur = null; save(); backup();
    startLevel();
    return true;
  }

  if (!N) app.innerHTML = `<div class="card">ما قدرت أفتح المستويات. حدّث الصفحة.</div>`;
  else if (!hashJump()) render();
  if (self.FX && !document.querySelector(".fx-mute")) FX.muteButton();
  self.WORDS = { get G() { return G; }, get S() { return S; }, submit, parse, hint, startLevel, get geo() { return geo; } };   // test hook
})();
