/* تذكّر المربعات — squares light up one after another; tap them in the same order («بالعكس»: last to first).
   Right → one more square next time. Wrong → you lose a heart and get a new row of the same length.
   Three hearts per session. No stages: the session's number is the longest row you got right, and each
   session starts a little below your last number. Progress on this phone (squares-v1), backed up by MindSync. */
(function () {
  "use strict";
  const app = document.getElementById("app");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rint = n => Math.floor(Math.random() * n);
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rint(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const T = self.SQ_TEST || {};   // only the automatic tests set this, to play faster
  const KEY = "squares-v1", HEARTS = 3, MAX = 9, FIRST = 3, ON = T.on || 650, GAP = T.gap || 250, WAIT = T.wait || 900;
  const MODES = { one: "بنفس الترتيب", back: "بالعكس" };

  /* ---------------- saved progress ---------------- */
  const fresh = () => ({ v: 1, mode: "one", best: { one: 0, back: 0 }, last: { one: 0, back: 0 }, sessions: [], days: {}, first: null });
  let G;
  try { const o = JSON.parse(localStorage.getItem(KEY) || "null") || {}; G = Object.assign(fresh(), o); G.best = Object.assign(fresh().best, o.best); G.last = Object.assign(fresh().last, o.last); } catch (e) { G = fresh(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(G)); } catch (e) {} };
  const dayKey = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const totalMin = () => Object.values(G.days).reduce((a, b) => a + b, 0);
  function streakDays() { let n = 0; const d = new Date(); if (!G.days[dayKey(d)]) d.setDate(d.getDate() - 1); while (G.days[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); } return n; }
  function merge(a, b) {
    const out = fresh(), seen = new Set();
    a.sessions.concat(b.sessions).sort((x, y) => x.t - y.t).forEach(s => { if (!seen.has(s.t)) { seen.add(s.t); out.sessions.push(s); } });
    out.sessions = out.sessions.slice(-300);
    ["one", "back"].forEach(m => {
      out.best[m] = Math.max((a.best || {})[m] || 0, (b.best || {})[m] || 0);
      const l = out.sessions.filter(s => s.mode === m).pop(); out.last[m] = l ? l.score : 0;
    });
    Object.keys(Object.assign({}, a.days, b.days)).forEach(k => out.days[k] = Math.max(a.days[k] || 0, b.days[k] || 0));
    out.first = [a.first, b.first].filter(x => x).sort()[0] || null;
    out.mode = a.mode || "one";
    return out;
  }
  const take = o => { G = merge(G, Object.assign(fresh(), o)); save(); };
  if (self.MindSync) {
    MindSync.register("squares", { get: () => G, merge: take, after: () => { if (view === "intro") render(); } });
    const inc = MindSync.incoming("squares"); if (inc) { take(inc); MindSync.save("squares"); }
  }
  const startLen = m => Math.min(MAX, Math.max(FIRST, (G.last[m] || 0) - 1));   // a little below your last number

  /* ---------------- sound: every square has its own note ---------------- */
  let AC = null;
  function ac() {
    if (!AC) { const C = self.AudioContext || self.webkitAudioContext; if (C) try { AC = new C(); } catch (e) {} }
    if (AC && AC.state === "suspended") AC.resume().catch(() => {});
    return AC;
  }
  const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98];
  function note(i, type = "triangle", vol = 0.17) {
    const a = ac(); if (!a || (self.FX && FX.muted)) return;
    const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = NOTES[i]; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.5);
  }
  function buzz() { const a = ac(); if (!a || (self.FX && FX.muted)) { if (self.FX) FX.buzz(80); return; } const t = a.currentTime, o = a.createOscillator(), g = a.createGain(); o.type = "sawtooth"; o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.3); g.gain.setValueAtTime(0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35); o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.4); if (self.FX) FX.buzz(80); }

  /* ---------------- views ---------------- */
  let view = "intro", S = null, last = null;
  function progressCard() {
    const tot = totalMin();
    return `<div class="card"><h2>📊 تقدمك</h2><div class="prog">
      <div><small>🏅 أعلى رقم (بنفس الترتيب)</small><b>${G.best.one || "–"}</b>${G.best.one ? " مربعات" : ""}</div>
      <div><small>🔁 أعلى رقم (بالعكس)</small><b>${G.best.back || "–"}</b>${G.best.back ? " مربعات" : ""}</div>
      <div><small>أيام متتالية</small><b>${streakDays()}</b> ${streakDays() === 1 ? "يوم" : "أيام"} 🔥</div>
      <div><small>مجموع لعبك</small>${tot < 60 ? `<b>${Math.floor(tot)}</b> دقيقة` : `<b>${(tot / 60).toFixed(1)}</b> ساعة`} · ${G.sessions.length} جلسة</div>
    </div></div>`;
  }
  function strip(back) {   // the example: 1 → 2 → 3 light up, then you tap them
    const g = (marks) => `<div class="g">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => marks[i] ? `<i class="${marks[i][0]}"></i>` : "<i></i>").join("")}</div>`;
    const tap = { 0: ["ok", "1"], 7: ["ok", "2"], 4: ["ok", "3"] };
    return `<div class="strip"><div class="s">${g({ 0: ["on", "1"] })}<small>ينوّر 1</small></div><span class="arrow">←</span><div class="s">${g({ 7: ["on", "2"] })}<small>ينوّر 2</small></div><span class="arrow">←</span><div class="s">${g({ 4: ["on", "3"] })}<small>ينوّر 3</small></div><span class="arrow">←</span><div class="s">${g(tap)}<small>${back ? "تضغط 3 ← 2 ← 1" : "تضغط 1 ← 2 ← 3"}</small></div></div>`;
  }
  function introView() {
    const m = G.mode, best = G.best[m];
    app.innerHTML = `<header class="hero"><img src="../../icons/squares.png" alt=""><h1>تذكّر المربعات</h1><p>تمرين ذاكرة الأماكن والترتيب</p></header>
      <div class="card record"><div><small>🏅 رقمك اللي تكسره (${MODES[m]})</small><span class="muted small">أطول ترتيب جبته صح</span></div><b>${best ? best + " مربعات" : "🎯"}</b></div>
      <div class="seg" role="radiogroup" aria-label="طريقة اللعب">
        <button type="button" data-mode="one" class="${m === "one" ? "on" : ""}" aria-pressed="${m === "one"}">بنفس الترتيب<small>من الأول للأخير</small></button>
        <button type="button" data-mode="back" class="${m === "back" ? "on" : ""}" aria-pressed="${m === "back"}">🔁 بالعكس · أصعب<small>من الأخير للأول</small></button>
      </div>
      <button type="button" class="btn" data-act="start">ابدأ الجلسة · تبدأ بـ ${startLen(m)} مربعات</button>
      <p class="tip">❤️❤️❤️ عندك 3 قلوب. كل غلطة تاخذ قلب، ولما تخلص القلوب تخلص الجلسة.</p>
      <div class="card"><h2>🎯 وش تدرّب</h2><div class="chips"><span class="chip">🗺️ ذاكرة الأماكن</span><span class="chip">🔢 تذكّر الترتيب</span><span class="chip">🎯 التركيز</span></div>
        <p class="small" style="margin:10px 0 0">🔬 <b>قوة الدليل العلمي:</b> متوسط للتحسن في التمارين المشابهة، وضعيف للفوايد برا اللعبة.</p></div>
      <div class="card"><h2>📅 كم تلعب؟</h2>
        <p style="margin:0">ننصح بـ <b>جلستين إلى 3 جلسات يومياً</b> (كل جلسة 2 إلى 4 دقايق).</p>
        <p class="small muted" style="margin:6px 0 0">ما فيه دراسة تحدد كمية لهالتمرين بالذات، فهذي نصيحة عامة مو نتيجة دراسة. المهم تستمر.</p></div>
      <div class="card"><h2>🔬 وش لقوا الباحثين</h2><ul class="list">
        <li>هالتمرين مأخوذ من اختبار معروف عند الأطباء اسمه «مكعبات كورسي»، يقيس <b>كم مكان تقدر تتذكر بالترتيب</b>. أغلب الكبار يتذكرون 5 إلى 7.</li>
        <li>التدريب على تمارين الذاكرة يحسّن أداءك فيها وفي اللي يشبهها.</li>
        <li>أما إنه يحسّن الذكاء أو أشياء بعيدة عن التمرين، فالدراسات ما أثبتت هالشي.</li></ul>
        <p class="note" style="margin:10px 0 0">يعني: بتتحسن في تذكّر الأماكن والترتيب أكيد. ونسخة «بالعكس» أصعب لأنها تخليك تقلب الترتيب في بالك.</p></div>
      ${progressCard()}
      <div class="card"><h2>🎮 كيف تلعب</h2>${strip(m === "back")}
        <ul class="list small" style="margin-top:12px"><li>المربعات تنوّر <b>وحدة ورا الثانية</b>، وكل مربع له نغمة.</li>
          <li>بعدها تضغطها ${m === "back" ? "<b>بالعكس</b>: من آخر واحد نوّر لأول واحد" : "<b>بنفس الترتيب</b> اللي نوّرت فيه"}.</li>
          <li>جبتها صح؟ المرة الجاية يزيد مربع. غلطت؟ ينقص قلب وتجيك محاولة جديدة بنفس العدد.</li>
          <li>ما فيه مراحل: رقمك هو أطول ترتيب جبته صح، وكل مرة تحاول تكسره.</li>
          <li>على الكمبيوتر: أزرار الأرقام تشتغل مثل المربعات (7 8 9 فوق).</li></ul></div>
      ${self.MindSync ? MindSync.card() : ""}`;
  }
  function bars(trials, score) {
    let gold = false;
    return `<div class="bars">${trials.map(t => { const top = !gold && t.ok && t.len === score; if (top) gold = true;
      return `<div class="${top ? "top" : t.ok ? "" : "bad"}" style="height:${(t.len / MAX * 100).toFixed(0)}%"><b>${t.len}</b></div>`; }).join("")}</div>`;
  }
  function resultView() {
    const r = last;
    let msg;
    if (r.top) msg = `🏆 وصلت لأعلى رقم (${MAX} مربعات)، يعني جبت كل المربعات! جرّب «بالعكس» إذا تبي تحدي أكبر.`;
    else if (!r.score) msg = "😅 ما جبت ولا ترتيب صح هالمرة. ركّز على أول مربع وآخر مربع، وردّد الترتيب في بالك.";
    else if (r.first) msg = "🎯 هذا أول رقم لك. المرة الجاية حاول تكسره!";
    else if (r.record) msg = `🎉 رقم قياسي جديد! كسرت رقمك السابق (${r.prevBest} مربعات).`;
    else if (r.score === r.prevBest) msg = `👌 نفس أعلى رقم لك (${r.prevBest} مربعات). قربت تكسره!`;
    else msg = `😴 أقل من أعلى رقم لك (${r.prevBest} مربعات). التعب وقلة النوم يأثرون على الذاكرة، جرّب وأنت مرتاح.`;
    app.innerHTML = `<div class="card big"><span class="u">رقمك في هالجلسة (${MODES[r.mode]})</span><div class="v">${r.score || "–"}</div><span class="u">${r.score ? "مربعات · أطول ترتيب جبته صح" : "ولا ترتيب صح"}</span>
        <div class="stats"><div>${G.best[r.mode] || "–"}<small>🏅 أعلى رقم لك</small></div><div>${r.trials.filter(t => t.ok).length} من ${r.trials.length}<small>✅ محاولات صح</small></div><div>${G.sessions.length}<small>جلسة</small></div></div></div>
      <div class="card"><p class="msg" style="margin:0;font-weight:700">${esc(msg)}</p></div>
      <div class="card"><h2>📈 محاولاتك</h2>${bars(r.trials, r.score)}<p class="small muted" style="text-align:center;margin:8px 0 0">من الأولى ← للأخيرة · الأحمر غلط · الأصفر رقمك<br>الجلسة الجاية تبدأ بـ ${startLen(r.mode)} مربعات</p></div>
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
  const $ = id => document.getElementById(id);
  let timers = [];
  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
  const stopAll = () => { timers.forEach(clearTimeout); timers = []; };
  function startSession() {
    ac();
    const mode = G.mode;
    S = { mode, back: mode === "back", len: startLen(mode), hearts: HEARTS, trials: [], seq: [], k: 0, phase: "wait", paused: false, t0: Date.now(), hidden: 0 };
    view = "play"; render(); trial();
  }
  function playView() {
    // squares are buttons; in RTL the first one is top-right
    app.innerHTML = `<div class="pl">
      <div class="ptop"><button type="button" class="x" data-act="pause" aria-label="إيقاف"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="5.5" y="4" width="4.5" height="16" rx="1.6" fill="#fff"/><rect x="14" y="4" width="4.5" height="16" rx="1.6" fill="#fff"/></svg></button>
        <span class="hearts" id="hearts" aria-label="القلوب"></span><span class="n" id="len"></span></div>
      <p class="say" id="say"></p><p class="sub" id="sub"></p>
      <div class="mid"><div class="sq" id="sq">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => `<button type="button" data-sq="${i}" aria-label="مربع ${i + 1}" disabled></button>`).join("")}</div><div class="flash" id="flash"></div></div></div>`;
  }
  const tiles = () => [...$("sq").children];
  function paintTop() {
    $("hearts").textContent = "❤️".repeat(S.hearts) + "🤍".repeat(HEARTS - S.hearts);
    $("len").textContent = S.len + " مربعات";
  }
  function trial() {
    if (!S || S.paused) return;
    stopAll();
    S.seq = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]).slice(0, S.len); S.k = 0; S.phase = "show";
    paintTop();
    $("say").textContent = "👀 شوف الترتيب…"; $("sub").textContent = "تنوّر وحدة ورا الثانية";
    $("flash").textContent = "";
    $("sq").classList.remove("input");
    tiles().forEach(b => { b.className = ""; b.textContent = ""; b.disabled = true; });
    let t = 700;
    S.seq.forEach((p, i) => {
      later(() => { tiles()[p].className = "on"; note(p); }, t);
      later(() => { tiles()[p].className = ""; }, t + ON);
      t += ON + GAP;
    });
    later(() => {
      S.phase = "input";
      $("say").textContent = S.back ? "✋ دورك: اضغطها بالعكس" : "✋ دورك: اضغطها بنفس الترتيب";
      $("sub").textContent = S.back ? `من آخر واحد نوّر · ضغطت 0 من ${S.len}` : `ضغطت 0 من ${S.len}`;
      $("sq").classList.add("input");
      tiles().forEach(b => b.disabled = false);
    }, t);
  }
  function tap(p) {
    if (!S || S.paused || S.phase !== "input") return;
    const want = S.back ? S.seq[S.seq.length - 1 - S.k] : S.seq[S.k], b = tiles()[p];
    if (p === want) {
      S.k++; b.className = "ok"; note(p, "sine", 0.2);
      $("sub").textContent = (S.back ? "من آخر واحد نوّر · " : "") + `ضغطت ${S.k} من ${S.len}`;
      if (S.k === S.len) done(true);
    } else {
      b.className = "bad"; b.textContent = "✗"; buzz();
      done(false);
    }
  }
  function done(ok) {
    S.phase = "wait";
    tiles().forEach(x => x.disabled = true);
    S.trials.push({ len: S.len, ok });
    if (ok) {
      $("flash").textContent = "✅";
      if (self.FA) FA.play("right", [20, 30, 20]);
      if (S.len >= MAX) return later(() => finish(true), WAIT);
      S.len++;
      $("say").textContent = "✅ صح!"; $("sub").textContent = `الجاية ${S.len} مربعات`;
      later(trial, WAIT + 300);
    } else {
      S.hearts--;
      paintTop();
      // play the right order again (in the order you had to tap); the ones you missed stay outlined
      const order = S.back ? S.seq.slice().reverse() : S.seq, k = S.k, step = Math.round(ON * 0.7);
      $("say").textContent = "❌ غلط، شوف الترتيب الصح";
      $("sub").textContent = S.hearts ? `باقي ${S.hearts === 1 ? "قلب واحد" : "قلبين"} · نفس العدد مرة ثانية` : "💔 خلصت القلوب";
      let t = 600;
      order.forEach((p, i) => {
        later(() => { tiles()[p].className = "on"; tiles()[p].textContent = ""; note(p); }, t);
        later(() => { tiles()[p].className = i < k ? "ok" : "was"; }, t + step);
        t += step + GAP;
      });
      later(() => S.hearts ? trial() : finish(false), t + WAIT);
    }
  }
  function finish(top) {
    const s = S; S = null; stopAll();
    const score = Math.max(0, ...s.trials.filter(t => t.ok).map(t => t.len)), prevBest = G.best[s.mode];
    const mins = Math.min(15, Math.max(0, (Date.now() - s.t0 - s.hidden) / 60000)), today = dayKey(), t = Date.now();
    if (!G.first) G.first = today;
    G.days[today] = (G.days[today] || 0) + mins;
    G.sessions.push({ t, mode: s.mode, score, trials: s.trials.map(x => (x.ok ? "+" : "-") + x.len).join(" ") }); G.sessions = G.sessions.slice(-300);
    const record = score > 0 && score > prevBest; if (record) G.best[s.mode] = score;
    G.last[s.mode] = score;
    save(); if (self.MindSync) MindSync.save("squares");
    last = { mode: s.mode, score, prevBest, record, first: !prevBest, top, trials: s.trials };
    view = "result"; render(); scrollTo(0, 0);
    if (self.FA) { if (record || top) { FA.confetti(); FA.play("win", [40, 40, 120]); } else FA.play("reveal"); }
  }

  /* ---------------- pause ---------------- */
  let hiddenAt = 0;
  function pause() {
    if (!S || S.paused) return;
    S.paused = true; stopAll(); hiddenAt = Date.now();
    const o = document.createElement("div"); o.className = "ov"; o.id = "ov";
    const snd = () => self.FX && FX.muted ? "🔇 الصوت مقفل · شغّله" : "🔊 الصوت شغال · اقفله";
    o.innerHTML = `<div class="box"><h2>⏸️ وقفنا</h2><p class="small muted" style="margin:0 0 12px">لما ترجع، تجيك محاولة جديدة بنفس العدد.</p>
      <button type="button" class="btn" data-act="resume">كمّل</button><button type="button" class="btn alt" data-act="mute">${snd()}</button><button type="button" class="btn alt" data-act="quit">اطلع</button></div>`;
    document.body.appendChild(o);
    o.querySelector("[data-act=resume]").focus({ preventScroll: true });
  }
  function resume() {
    const o = document.getElementById("ov"); if (o) o.remove();
    if (!S) return;
    S.hidden += Date.now() - hiddenAt; S.paused = false;
    trial();
  }

  /* ---------------- buttons and keys ---------------- */
  // squares answer on touch-down (faster), without the site's tap sound: each square plays its own note
  document.addEventListener("pointerdown", e => { const b = e.target.closest("[data-sq]"); if (!b) return; e.preventDefault(); e.stopPropagation(); tap(+b.dataset.sq); }, true);
  document.addEventListener("click", e => {
    const m = e.target.closest("[data-mode]");
    if (m) { G.mode = m.dataset.mode; save(); render(); return; }
    const b = e.target.closest("[data-act]"); if (!b) return;
    const a = b.dataset.act;
    if (a === "start") startSession();
    else if (a === "pause") pause();
    else if (a === "resume") resume();
    else if (a === "mute") { const x = document.querySelector(".fx-mute"); if (x) x.click(); b.textContent = self.FX && FX.muted ? "🔇 الصوت مقفل · شغّله" : "🔊 الصوت شغال · اقفله"; }
    else if (a === "quit") {
      if (!confirm("تطلع من الجلسة؟ ما راح تنحسب.")) return;
      const o = document.getElementById("ov"); if (o) o.remove();
      stopAll(); S = null; view = "intro"; render(); scrollTo(0, 0);
    }
  });
  // number keys like a phone keypad: 7 8 9 is the top row (left to right on the screen)
  const KEYPAD = { 7: [0, 0], 8: [0, 1], 9: [0, 2], 4: [1, 0], 5: [1, 1], 6: [1, 2], 1: [2, 0], 2: [2, 1], 3: [2, 2] };
  document.addEventListener("keydown", e => {
    if (view !== "play" || !S || e.repeat) return;
    const d = "٠١٢٣٤٥٦٧٨٩".indexOf(e.key) >= 0 ? "٠١٢٣٤٥٦٧٨٩".indexOf(e.key) : +e.key;
    const rc = KEYPAD[d]; if (!rc) return;
    e.preventDefault();
    const [r, cl] = rc, p = r * 3 + (getComputedStyle($("sq")).direction === "rtl" ? 2 - cl : cl);
    tap(p);
  });
  document.addEventListener("touchmove", e => { if (view === "play") e.preventDefault(); }, { passive: false });
  document.addEventListener("visibilitychange", () => { if (document.hidden && view === "play" && S) pause(); });

  render();
  if (self.FX && !document.querySelector(".fx-mute")) FX.muteButton();
  self.SQUARES = { get G() { return G; }, get S() { return S; }, tap };   // test hook
})();
