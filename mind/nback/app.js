/* قبل كم؟ — a working-memory exercise (n-back). A square lights up every 2.5 s; press «نفس المكان» when it
   is the same square as N steps back. «مزدوجة» adds a sound with every step: press «نفس الصوت» when the
   sound is the same as N steps back. After each round N goes up (fewer than 3 mistakes in every part) or
   down (more than 5 in any part). No stages: each session starts where the last one ended, and the number
   to beat is the highest N you passed (fewer than 3 mistakes) — pressing at random can never beat it.
   Progress on this phone (nback-v1), backed up by MindSync. */
(function () {
  "use strict";
  const app = document.getElementById("app");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rint = n => Math.floor(Math.random() * n);
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rint(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const T = self.NBACK_TEST || {};   // only the automatic tests set this, to play faster
  const KEY = "nback-v1", ROUNDS = 5, BASE = 20, STEP = T.step || 2500, SHOW = T.show || 500, CD = T.cd || 650, TARGETS = 6;
  const DAY_MIN = 20, WEEKS = 4, PLAN_MIN = 400;          // the well-known studies: ~20 minutes a day for 3-4 weeks
  const MODES = { one: "عادية", two: "مزدوجة" };
  const TILE = ["#3ec6ff", "#a855f7", "#ff5fd2", "#ffb21e", "#3ee65a", "#ff4d3d", "#5df5ff", "#ffd43b", "#7c5cff"];
  const dark = c => "#" + c.slice(1).match(/../g).map(h => Math.round(parseInt(h, 16) * 0.55).toString(16).padStart(2, "0")).join("");

  /* ---------------- saved progress ---------------- */
  const fresh = () => ({ v: 1, mode: "one", best: { one: 0, two: 0 }, lastN: { one: 1, two: 1 }, sessions: [], days: {}, first: null });
  let G;
  try { const o = JSON.parse(localStorage.getItem(KEY) || "null") || {}; G = Object.assign(fresh(), o); G.best = Object.assign(fresh().best, o.best); G.lastN = Object.assign(fresh().lastN, o.lastN); } catch (e) { G = fresh(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(G)); } catch (e) {} };
  const dayKey = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const fromKey = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const totalMin = () => Object.values(G.days).reduce((a, b) => a + b, 0);
  function streakDays() { let n = 0; const d = new Date(); if (!G.days[dayKey(d)]) d.setDate(d.getDate() - 1); while (G.days[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); } return n; }
  const week = () => G.first ? Math.min(WEEKS, Math.floor((new Date() - fromKey(G.first)) / (7 * 864e5)) + 1) : 1;
  function merge(a, b) {
    const out = fresh(), seen = new Set();
    a.sessions.concat(b.sessions).sort((x, y) => x.t - y.t).forEach(s => { if (!seen.has(s.t)) { seen.add(s.t); out.sessions.push(s); } });
    out.sessions = out.sessions.slice(-300);
    ["one", "two"].forEach(m => {
      out.best[m] = Math.max((a.best || {})[m] || 0, (b.best || {})[m] || 0);
      const lastS = out.sessions.filter(s => s.mode === m).pop();
      out.lastN[m] = lastS ? lastS.next : Math.max((a.lastN || {})[m] || 1, (b.lastN || {})[m] || 1);
    });
    Object.keys(Object.assign({}, a.days, b.days)).forEach(k => out.days[k] = Math.max(a.days[k] || 0, b.days[k] || 0));
    out.first = [a.first, b.first].filter(x => x).sort()[0] || null;
    out.mode = a.mode || "one";
    return out;
  }
  const take = o => { G = merge(G, Object.assign(fresh(), o)); save(); };
  if (self.MindSync) {
    MindSync.register("nback", { get: () => G, merge: take, after: () => { if (view === "intro") render(); } });
    const inc = MindSync.incoming("nback"); if (inc) { take(inc); MindSync.save("nback"); }
  }

  /* ---------------- sound ---------------- */
  // normal mode: every square has its own note (helps eye and ear together)
  // two-part mode: a separate stream of 6 very different sounds, the second thing to remember
  let AC = null;
  function ac() {
    if (!AC) { const C = self.AudioContext || self.webkitAudioContext; if (C) try { AC = new C(); } catch (e) {} }
    if (AC && AC.state === "suspended") AC.resume().catch(() => {});
    return AC;
  }
  const muted = () => !!(self.FX && FX.muted);
  function env(g, t, vol, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  function osc(a, type, f, t, vol, dur, f2) {
    const o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur * 0.8);
    env(g, t, vol, dur); o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98];
  function note(i) { const a = ac(); if (!a || muted()) return; osc(a, "triangle", NOTES[i], a.currentTime, 0.16, 0.45); }
  const SOUNDS = [
    a => osc(a, "sine", 170, a.currentTime, 0.55, 0.35, 50),                                    // دق: a low drum
    a => { const t = a.currentTime; osc(a, "sine", 1320, t, 0.17, 0.9); osc(a, "sine", 2650, t, 0.06, 0.6); },   // a bell
    a => osc(a, "sine", 650, a.currentTime, 0.15, 0.4, 1700),                                   // a rising whistle
    a => { const t = a.currentTime, o = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain(); o.type = "square"; o.frequency.value = 196; f.type = "lowpass"; f.frequency.value = 1300; env(g, t, 0.13, 0.35); o.connect(f).connect(g).connect(a.destination); o.start(t); o.stop(t + 0.4); },   // a buzz
    a => { const t = a.currentTime, b = a.createBuffer(1, Math.round(a.sampleRate * 0.12), a.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 4);
      const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); s.buffer = b; f.type = "bandpass"; f.frequency.value = 1800; f.Q.value = 3; g.gain.value = 1.4; s.connect(f).connect(g).connect(a.destination); s.start(t); },   // a wood knock
    a => { const t = a.currentTime; osc(a, "triangle", 988, t, 0.2, 0.22); osc(a, "triangle", 659, t + 0.15, 0.2, 0.28); },   // two notes going down
  ];
  function sound(i) { const a = ac(); if (a) SOUNDS[i](a); }

  /* ---------------- views ---------------- */
  let view = "intro", S = null, last = null;
  const bar = (v, max) => `<div class="bar"><i style="width:${Math.min(100, v / max * 100).toFixed(1)}%"></i></div>`;
  function programCard() {
    const today = G.days[dayKey()] || 0, tot = totalMin();
    return `<div class="card"><h2>📊 تقدمك في برنامج التدريب</h2><div class="prog">
      <div><small>دقايقك اليوم</small><b>${Math.min(DAY_MIN, Math.floor(today))}</b> من ${DAY_MIN}${bar(today, DAY_MIN)}</div>
      <div><small>أيام متتالية</small><b>${streakDays()}</b> ${streakDays() === 1 ? "يوم" : "أيام"} 🔥</div>
      <div><small>مجموع تدريبك</small>${tot < 60 ? `<b>${Math.floor(tot)}</b> دقيقة` : `<b>${(tot / 60).toFixed(1)}</b> ساعة`} من 7 ساعات${bar(tot, PLAN_MIN)}</div>
      <div><small>أنت في الأسبوع</small><b>${week()}</b> من ${WEEKS}${bar(week(), WEEKS)}</div>
    </div></div>`;
  }
  const strip = n => {   // a little example: step 3 is the same square as step 1
    const g = on => `<div class="g">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => `<i${i === on ? ' class="on"' : ""}></i>`).join("")}</div>`;
    return `<div class="strip"><div class="s">${g(2)}<small>١</small></div><span class="arrow">←</span><div class="s">${g(4)}<small>٢</small></div><span class="arrow">←</span><div class="s yes">${g(2)}<small>٣ ✋ اضغط!</small></div><span class="arrow">←</span><div class="s">${g(6)}<small>٤ لا تضغط</small></div></div>`;
  };
  function introView() {
    const m = G.mode, best = G.best[m];
    app.innerHTML = `<header class="hero"><img src="../../icons/nback.png" alt=""><h1>قبل كم؟</h1><p>تمرين الذاكرة العاملة</p></header>
      <div class="card record"><div><small>🏅 رقمك اللي تكسره (${MODES[m]})</small><span class="muted small">أعلى «قبل» عبرتها بأقل من 3 أغلاط</span></div><b>${best ? "قبل " + best : "🎯"}</b></div>
      <div class="seg" role="radiogroup" aria-label="نوع اللعب">
        <button type="button" data-mode="one" class="${m === "one" ? "on" : ""}" aria-pressed="${m === "one"}">عادية<small>تتابع المكان</small></button>
        <button type="button" data-mode="two" class="${m === "two" ? "on" : ""}" aria-pressed="${m === "two"}">🎧 مزدوجة · أصعب<small>المكان والصوت مع بعض</small></button>
      </div>
      <button type="button" class="btn" data-act="start">ابدأ الجلسة (5 دقايق تقريباً) · قبل ${G.lastN[m]}</button>
      <p class="tip">${m === "two" ? "🔊 شغّل الصوت، والأفضل سماعة. وفي الآيفون فك وضع الصامت." : "💡 ركّز على المكان. وكل مربع له نغمة تساعدك تتذكر."} وعلى الكمبيوتر: زر A للمكان${m === "two" ? " وL للصوت" : ""}.</p>
      <div class="card"><h2>🎯 وش تدرّب</h2><div class="chips"><span class="chip">🧠 الذاكرة العاملة</span><span class="chip">🎯 التركيز</span><span class="chip">🔄 تحديث المعلومات في بالك</span></div>
        <p class="small" style="margin:10px 0 0">🔬 <b>قوة الدليل العلمي:</b> متوسط للذاكرة العاملة في التمارين المشابهة، وضعيف ومختلف عليه لرفع الذكاء.</p></div>
      <div class="card"><h2>📅 كم تلعب عشان تستفيد؟</h2>
        <p style="margin:0">الدراسات المشهورة استخدمت تقريباً <b>20 دقيقة يومياً، 5 أيام بالأسبوع، لمدة 3 إلى 4 أسابيع</b>. يعني تقريباً <b>4 جلسات يومياً</b>.</p>
        <p class="small muted" style="margin:6px 0 0">الجلسة الوحدة 5 دقايق تقريباً، فيها 5 جولات.</p></div>
      ${programCard()}
      <div class="card"><h2>🔬 وش لقوا الباحثين</h2><ul class="list">
        <li>دراسة 2008 المشهورة لقت إن اللي تدربوا على النسخة <b>المزدوجة</b> تحسّنوا في اختبار ذكاء، وكل ما تدربوا أكثر زاد التحسن.</li>
        <li>بس دراسات كثيرة بعدها ما قدرت تكرر النتيجة نفسها.</li>
        <li>التحليلات الكبيرة لقت إن الفايدة الأكيدة: تتحسن في التمارين اللي تشبه اللعبة.</li></ul>
        <p class="note" style="margin:10px 0 0">يعني: ذاكرتك العاملة بتتحسن في التمارين المشابهة أكيد، أما رفع الذكاء فما انحسم علمياً.</p></div>
      <div class="card"><h2>🎮 كيف تلعب</h2>
        <p class="small" style="margin:0 0 12px">مثال على «قبل 2»: تتابع المربع اللي ينوّر، وتضغط إذا رجع نفس المكان اللي قبل خطوتين.</p>
        ${strip()}
        <ul class="list small" style="margin-top:12px"><li>الخطوة ٣ نفس مكان الخطوة ١ ← تضغط «✋ نفس المكان».</li><li>الخطوة ٤ مكان جديد ← لا تضغط.</li>
          ${m === "two" ? "<li>وبنفس الوقت تسمع صوت مع كل خطوة. إذا الصوت نفس اللي قبل خطوتين ← تضغط «🔊 نفس الصوت».</li>" : ""}
          <li>الجلسة ${ROUNDS} جولات. بعد كل جولة: أغلاطك أقل من 3؟ تصير «قبل 3». أكثر من 5؟ ترجع خطوة.</li>
          <li>ما فيه مراحل: كل جلسة تبدأ من الرقم اللي وقفت عنده، ورقمك هو <b>أعلى «قبل» عبرتها بأقل من 3 أغلاط</b>. كل ما زاد أحسن.</li></ul></div>
      ${self.MindSync ? MindSync.card() : ""}`;
  }
  function bars(rs, score) {
    const max = Math.max(...rs.map(r => r.n), 2);
    let gold = false;
    return `<div class="bars">${rs.map(r => { const top = !gold && r.ok && r.n === score; if (top) gold = true;
      return `<div class="${top ? "top" : ""}" style="height:${(r.n / max * 100).toFixed(0)}%;${r.ok ? "" : "opacity:.45"}"><b>${r.n}${r.ok ? "" : "✗"}</b></div>`; }).join("")}</div>`;
  }
  function resultView() {
    const r = last;
    let msg;
    if (!r.score) msg = "😅 ما عبرت ولا جولة هالمرة (كل جولة كان فيها 3 أغلاط أو أكثر). خذها على راحتك: اضغط بس إذا متأكد.";
    else if (r.first) msg = "🎯 هذا أول رقم لك. المرة الجاية حاول تكسره!";
    else if (r.record) msg = `🎉 رقم قياسي جديد! كسرت رقمك السابق (قبل ${r.prevBest}).`;
    else if (r.score === r.prevBest) msg = `👌 نفس أعلى رقم لك (قبل ${r.prevBest}). استمر وبتعديه.`;
    else msg = `😴 أقل من أعلى رقم لك (قبل ${r.prevBest}). التعب وقلة النوم يأثرون على الذاكرة، جرّب وأنت مرتاح.`;
    app.innerHTML = `<div class="card big"><span class="u">رقمك في هالجلسة (${MODES[r.mode]})</span><div class="v">${r.score ? "قبل " + r.score : "–"}</div><span class="u">أعلى «قبل» عبرتها بأقل من 3 أغلاط</span>
        <div class="stats"><div><bdi>${r.acc}%</bdi><small>🎯 دقتك</small></div><div>${G.best[r.mode] ? "قبل " + G.best[r.mode] : "–"}<small>🏅 أعلى رقم لك</small></div><div>${G.sessions.length}<small>جلسة</small></div></div></div>
      <div class="card"><p class="msg" style="margin:0;font-weight:700">${esc(msg)}</p></div>
      <div class="card"><h2>📈 وين وصلت في كل جولة</h2>${bars(r.rounds, r.score)}<p class="small muted" style="text-align:center;margin:8px 0 0">من الجولة الأولى ← للأخيرة · الأصفر رقمك · ✗ جولة ما عبرتها<br>الجلسة الجاية تبدأ «قبل ${r.next}»</p></div>
      ${programCard()}
      <button type="button" class="btn" data-act="start">العب جلسة ثانية</button>
      <a class="btn alt" href="../">ألعاب Mind Games</a>
      ${self.MindSync && MindSync.code() ? `<p class="tip">🔑 رمز تقدمك: <b style="direction:ltr;unicode-bidi:isolate">${MindSync.show(MindSync.code())}</b></p>` : ""}`;
  }
  function render() {
    document.body.classList.toggle("playing", view === "play");
    ({ intro: introView, play: playView, result: resultView }[view] || introView)();
  }

  /* ---------------- a session ---------------- */
  function makeRound(n, dual) {
    const len = BASE + n;
    const stream = k => {
      const tg = new Set(shuffle([...Array(BASE).keys()].map(i => i + n)).slice(0, TARGETS)), s = [];
      for (let i = 0; i < len; i++) {
        if (tg.has(i)) s.push(s[i - n]);
        else { let v; do { v = rint(k); } while (i >= n && v === s[i - n]); s.push(v); }   // no accidental matches
      }
      return { s, tg };
    };
    return { n, len, pos: stream(9), snd: dual ? stream(SOUNDS.length) : null, pp: new Set(), ps: new Set() };
  }
  function startSession() {
    const mode = G.mode, dual = mode === "two";
    ac();   // sound needs a tap to start on phones
    if (dual) {
      try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}   // iPhone: play even on silent
      if (muted()) { const b = document.querySelector(".fx-mute"); if (b) b.click(); }
    }
    S = { mode, dual, n: G.lastN[mode] || 1, r: 0, rounds: [], R: null, i: -1, timer: 0, paused: false, streak: 0, t0: Date.now(), active: 0, mark: 0 };
    view = "play"; render(); round();
  }
  function playView() {
    app.innerHTML = `<div class="pl">
      <div class="ptop"><button type="button" class="x" data-act="pause" aria-label="إيقاف"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="5.5" y="4" width="4.5" height="16" rx="1.6" fill="#fff"/><rect x="14" y="4" width="4.5" height="16" rx="1.6" fill="#fff"/></svg></button><span id="pinfo"></span><span class="n" id="pn"></span></div>
      <div class="bar pbar"><i id="pb" style="width:0%"></i></div>
      <div class="mid"><div class="streak" id="st"></div><div class="nb" id="nb">${TILE.map((c, i) => `<i style="--c:${c};--c2:${dark(c)}" data-t="${i}"></i>`).join("")}</div><div id="over"></div></div>
      <p class="hintline" id="hl"></p>
      <div class="keys"><button type="button" data-press="p" disabled>✋ نفس المكان${S.dual ? "<small>A</small>" : ""}</button>${S.dual ? `<button type="button" class="snd" data-press="s" disabled>🔊 نفس الصوت<small>L</small></button>` : ""}</div></div>`;
  }
  const $ = id => document.getElementById(id);
  function round() {
    if (!S) return;
    S.R = makeRound(S.n, S.dual); S.i = -1; S.streak = 0;
    $("pn").textContent = "قبل " + S.n;
    $("pinfo").textContent = `الجولة ${S.r + 1} من ${ROUNDS}`;
    $("pb").style.width = "0%"; $("st").innerHTML = "";
    $("hl").innerHTML = `اضغط إذا نوّر <b>نفس المكان${S.dual ? " أو انسمع نفس الصوت" : ""}</b> اللي ${S.n === 1 ? "قبل خطوة" : S.n === 2 ? "قبل خطوتين" : `قبل ${S.n} خطوات`}`;
    let c = 3; const over = $("over");
    const tick = () => {
      if (!S || S.paused) return;
      if (c > 0) { over.innerHTML = `<div class="cd">${c}</div>`; c--; S.timer = setTimeout(tick, CD); }
      else { over.innerHTML = ""; S.mark = performance.now(); next(); }
    };
    tick();
  }
  function next() {
    if (!S || S.paused) return;
    const R = S.R;
    if (S.i >= 0) endStep(S.i);
    S.i++;
    if (S.i >= R.len) return roundDone();
    const i = S.i, p = R.pos.s[i], tile = $("nb").children[p];
    tile.classList.add("on");
    if (S.dual) sound(R.snd.s[i]); else note(p);
    setTimeout(() => tile.classList.remove("on"), SHOW);
    $("pb").style.width = ((i + 1) / R.len * 100).toFixed(1) + "%";
    document.querySelectorAll("[data-press]").forEach(b => { b.disabled = i < R.n; b.classList.remove("ok", "bad"); });
    S.timer = setTimeout(next, STEP);
  }
  function press(k) {
    if (!S || S.paused || !S.R) return;
    const R = S.R, i = S.i, set = k === "p" ? R.pp : R.ps, str = k === "p" ? R.pos : R.snd;
    if (i < R.n || !str || set.has(i)) return;
    set.add(i);
    const ok = str.tg.has(i), b = document.querySelector(`[data-press="${k}"]`);
    if (b) b.classList.add(ok ? "ok" : "bad");
    if (ok) { if (k === "p") $("nb").children[R.pos.s[i]].classList.add("hit"); }
    else if (self.FX) FX.buzz(60);
  }
  function endStep(i) {
    const R = S.R; if (i < R.n) return;
    let right = true;
    [["p", R.pos, R.pp], ["s", R.snd, R.ps]].forEach(([k, str, set]) => {
      if (!str) return;
      const tg = str.tg.has(i), pr = set.has(i);
      if (tg !== pr) right = false;
      if (tg && !pr) {   // a match you didn't press: show it
        if (k === "p") { const t = $("nb").children[str.s[i]]; t.classList.add("miss"); setTimeout(() => t.classList.remove("miss"), 600); }
        const b = document.querySelector(`[data-press="${k}"]`); if (b) { b.classList.add("bad"); setTimeout(() => b.classList.remove("bad"), 400); }
        if (self.FX) FX.buzz(60);
      }
    });
    [...$("nb").children].forEach(t => t.classList.remove("hit"));
    S.streak = right ? S.streak + 1 : 0;
    $("st").innerHTML = S.streak >= 3 ? `<b>🔥 ×${S.streak}</b>` : "";
  }
  function count(str, set) {
    if (!str) return null;
    let hit = 0, miss = 0, fa = 0;
    str.tg.forEach(i => set.has(i) ? hit++ : miss++);
    set.forEach(i => { if (!str.tg.has(i)) fa++; });
    return { hit, miss, fa, err: miss + fa };
  }
  function roundDone() {
    const R = S.R, P = count(R.pos, R.pp), Q = count(R.snd, R.ps);
    S.active += performance.now() - S.mark;
    const errs = [P, Q].filter(Boolean).map(x => x.err);
    const nextN = errs.every(e => e < 3) ? R.n + 1 : errs.some(e => e > 5) ? Math.max(1, R.n - 1) : R.n;
    S.rounds.push({ n: R.n, p: P, s: Q, ok: errs.every(e => e < 3) });
    S.r++; S.n = nextN;
    if (S.r >= ROUNDS) return finish();
    const word = nextN > R.n ? `<b class="up">قبل ${nextN} ⬆️</b>` : nextN < R.n ? `<b class="down">قبل ${nextN} ⬇️</b>` : `<b>قبل ${nextN}</b> (نفس الرقم)`;
    document.querySelectorAll("[data-press]").forEach(b => { b.disabled = true; b.classList.remove("ok", "bad"); });
    $("over").innerHTML = `<div class="between"><div class="box"><h2>✅ الجولة ${S.r} خلصت</h2>
      <p style="margin:0">أغلاطك: المكان ${P.err}${Q ? ` · الصوت ${Q.err}` : ""}</p>
      <p style="margin:6px 0 14px">الجولة الجاية: ${word}</p>
      <button type="button" class="btn" data-act="go">كمّل</button></div></div>`;
    document.querySelector("[data-act=go]").focus({ preventScroll: true });
  }
  function finish() {
    const s = S; S = null; clearTimeout(s.timer);
    const decisions = s.rounds.reduce((a, r) => a + BASE * (r.s ? 2 : 1), 0);
    const wrong = s.rounds.reduce((a, r) => a + r.p.err + (r.s ? r.s.err : 0), 0);
    const acc = Math.round((1 - wrong / decisions) * 100);
    const score = Math.max(0, ...s.rounds.filter(r => r.ok).map(r => r.n)), maxN = Math.max(...s.rounds.map(r => r.n));
    const prevBest = G.best[s.mode];
    const mins = Math.min(10, s.active / 60000), today = dayKey(), t = Date.now();
    if (!G.first) G.first = today;
    G.days[today] = (G.days[today] || 0) + mins;
    G.sessions.push({ t, mode: s.mode, score, max: maxN, acc, next: s.n, ns: s.rounds.map(r => r.n), ok: s.rounds.map(r => r.ok) }); G.sessions = G.sessions.slice(-300);
    const record = score > 0 && score > prevBest; if (record) G.best[s.mode] = score;
    G.lastN[s.mode] = s.n;
    save(); if (self.MindSync) MindSync.save("nback");
    last = { mode: s.mode, score, maxN, acc, prevBest, record, first: !prevBest, rounds: s.rounds, next: s.n };
    view = "result"; render(); scrollTo(0, 0);
    if (self.FA) { if (record) { FA.confetti(); FA.play("win", [40, 40, 120]); } else FA.play("reveal"); }
  }

  /* ---------------- pause ---------------- */
  function pause() {
    if (!S || S.paused) return;
    S.paused = true; clearTimeout(S.timer);
    if (S.i >= 0 && S.R && S.i < S.R.len) S.active += performance.now() - S.mark;
    const o = document.createElement("div"); o.className = "ov"; o.id = "ov";
    o.innerHTML = `<div class="box"><h2>⏸️ وقفنا</h2><p class="small muted" style="margin:0 0 12px">لما ترجع، الجولة هذي تبدأ من جديد.</p>
      <button type="button" class="btn" data-act="resume">كمّل</button><button type="button" class="btn alt" data-act="mute">${muted() ? "🔇 الصوت مقفل · شغّله" : "🔊 الصوت شغال · اقفله"}</button><button type="button" class="btn alt" data-act="quit">اطلع</button></div>`;
    document.body.appendChild(o);
    o.querySelector("[data-act=resume]").focus({ preventScroll: true });
  }
  function resume() {
    const o = document.getElementById("ov"); if (o) o.remove();
    if (!S) return;
    S.paused = false;
    if (!document.querySelector(".between")) round();     // the round starts again (unless we were between rounds)
  }

  /* ---------------- buttons and keys ---------------- */
  // the two answer buttons: answered on touch-down (faster), and without the site's tap sound, so the only sounds are the game's
  document.addEventListener("pointerdown", e => { const b = e.target.closest("[data-press]"); if (!b) return; e.preventDefault(); e.stopPropagation(); if (!b.disabled) press(b.dataset.press); }, true);
  document.addEventListener("click", e => {
    const m = e.target.closest("[data-mode]");
    if (m) { G.mode = m.dataset.mode; save(); render(); return; }
    const b = e.target.closest("[data-act]"); if (!b) return;
    const a = b.dataset.act;
    if (a === "start") startSession();
    else if (a === "go") { $("over").innerHTML = ""; round(); }
    else if (a === "pause") pause();
    else if (a === "resume") resume();
    else if (a === "mute") { const m = document.querySelector(".fx-mute"); if (m) m.click(); b.textContent = muted() ? "🔇 الصوت مقفل · شغّله" : "🔊 الصوت شغال · اقفله"; }
    else if (a === "quit") {
      if (!confirm("تطلع من الجلسة؟ ما راح تنحسب.")) return;
      const o = document.getElementById("ov"); if (o) o.remove();
      if (S) clearTimeout(S.timer); S = null; view = "intro"; render(); scrollTo(0, 0);
    }
  });
  document.addEventListener("keydown", e => {
    if (view !== "play" || !S || e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === "a" || k === "ش" || (!S.dual && (k === " " || k === "enter"))) { e.preventDefault(); press("p"); }
    else if (S.dual && (k === "l" || k === "م")) { e.preventDefault(); press("s"); }
  });
  document.addEventListener("touchmove", e => { if (view === "play") e.preventDefault(); }, { passive: false });
  document.addEventListener("visibilitychange", () => { if (document.hidden && view === "play" && S) pause(); });

  render();
  if (self.FX && !document.querySelector(".fx-mute")) FX.muteButton();
  self.NBACK = { get G() { return G; }, get S() { return S; }, makeRound, press };   // test hook
})();
