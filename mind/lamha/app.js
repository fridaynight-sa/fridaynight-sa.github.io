/* لمحة — a speed-of-processing exercise (eyes on the middle, a car in the middle and a star at the edges,
   shown for a moment and then covered by noise). Right answers make the next look shorter, a wrong one
   longer; the session's number is the shortest look at which you still catch both.
   Everything is saved on this phone; a «رمز تقدمك» keeps a copy online so it can come back. */
(function () {
  "use strict";
  const D = self.LamhaDraw, app = document.getElementById("app");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rint = n => Math.floor(Math.random() * n);
  const pick = a => a[rint(a.length)];
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rint(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const N = n => Math.round(n).toLocaleString("en-US");

  const TRIALS = 30, PLAN_MIN = 600, DAY_MIN = 10, WEEKS = 12;
  const KEY = "lamha-v1";

  /* ---------------- saved progress ---------------- */
  const fresh = () => ({ v: 1, best: null, sessions: [], days: {}, first: null, code: null, doneAt: null });
  let G;
  try { G = Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY) || "null") || {}); } catch (e) { G = fresh(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(G)); } catch (e) {} };
  const dayKey = (d = new Date()) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const fromKey = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const totalMin = () => Object.values(G.days).reduce((a, b) => a + b, 0);
  function streak() {
    let n = 0; const d = new Date();
    if (!G.days[dayKey(d)]) d.setDate(d.getDate() - 1);          // today not played yet: count up to yesterday
    while (G.days[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  const week = () => G.first ? Math.min(WEEKS, Math.floor((new Date() - fromKey(G.first)) / (7 * 864e5)) + 1) : 1;

  /* ---------------- backup online («رمز تقدمك») ---------------- */
  let db = null;
  try { const C = self.FIREBASE_CONFIG; if (C && C.databaseURL && self.firebase) { if (!firebase.apps.length) firebase.initializeApp(C); db = firebase.database(); } } catch (e) {}
  const ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => ABC[b % ABC.length]).join("");
  const showCode = c => c ? c.slice(0, 4) + "-" + c.slice(4) : "";
  let backupMsg = "";
  async function backup() {
    if (!db) return;
    if (!G.code) { G.code = newCode(); save(); }
    try { await db.ref("mind/" + G.code).set({ j: JSON.stringify(G) }); backupMsg = ""; }
    catch (e) { backupMsg = "ما قدرت أحفظ نسخة أونلاين الحين. تقدمك محفوظ في جوالك."; }
  }
  function merge(a, b) {   // two copies of the progress → one (nothing is lost)
    const out = fresh(), seen = new Set();
    a.sessions.concat(b.sessions).sort((x, y) => x.t - y.t).forEach(s => { if (!seen.has(s.t)) { seen.add(s.t); out.sessions.push(s); } });
    out.sessions = out.sessions.slice(-200);
    Object.keys(Object.assign({}, a.days, b.days)).forEach(k => out.days[k] = Math.max(a.days[k] || 0, b.days[k] || 0));
    const bests = [a.best, b.best].filter(x => x); out.best = bests.length ? Math.min(...bests) : null;
    const firsts = [a.first, b.first].filter(x => x).sort(); out.first = firsts[0] || null;
    out.doneAt = [a.doneAt, b.doneAt].filter(x => x).sort()[0] || null;
    return out;
  }
  async function restore(code) {
    code = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length !== 8) return "الرمز 8 حروف وأرقام، مثل ABCD-EFGH.";
    if (!db) return "ما فيه اتصال الحين. جرّب بعدين.";
    try {
      const v = (await db.ref("mind/" + code).get()).val();
      const o = v && typeof v.j === "string" ? JSON.parse(v.j) : null;
      if (!o || !Array.isArray(o.sessions)) return "ما لقيت تقدم بهالرمز. تأكد منه.";
      G = Object.assign(merge(G, Object.assign(fresh(), o)), { code }); save(); backup();
      return "";
    } catch (e) { return "ما قدرت أرجّع التقدم. تأكد من الاتصال وجرّب مرة ثانية."; }
  }

  /* ---------------- screen timing ---------------- */
  // how long one screen refresh takes (16.7 ms on most screens): the shortest look is one refresh
  let frameMs = 1000 / 60;
  (function measure() {
    const t = []; let last = 0, n = 0;
    const step = now => { if (last) t.push(now - last); last = now; if (++n < 40) requestAnimationFrame(step); else { t.sort((a, b) => a - b); const m = t[t.length >> 1]; if (m > 4 && m < 40) frameMs = m; } };
    requestAnimationFrame(step);
  })();
  const msOf = f => f * frameMs;

  /* ---------------- views ---------------- */
  let view = "intro", session = null, lastResult = null, codeMsg = "";
  function programCard() {
    const today = G.days[dayKey()] || 0, tot = totalMin();
    const bar = (v, max) => `<div class="bar"><i style="width:${Math.min(100, v / max * 100).toFixed(1)}%"></i></div>`;
    return `<div class="card"><h2>📊 تقدمك في برنامج التدريب</h2>
      <div class="prog">
        <div><small>دقايقك اليوم</small><b>${Math.min(DAY_MIN, Math.floor(today))}</b> من ${DAY_MIN}${bar(today, DAY_MIN)}</div>
        <div><small>أيام متتالية</small><b>${streak()}</b> ${streak() === 1 ? "يوم" : "أيام"} 🔥</div>
        <div><small>مجموع تدريبك</small>${tot < 60 ? `<b>${Math.floor(tot)}</b> دقيقة` : `<b>${(tot / 60).toFixed(1)}</b> ساعة`} من 10 ساعات${bar(tot, PLAN_MIN)}</div>
        <div><small>أنت في الأسبوع</small><b>${week()}</b> من ${WEEKS}${bar(week(), WEEKS)}</div>
      </div></div>`;
  }
  function doneCard() {
    if (!G.doneAt) return "";
    const d = fromKey(G.doneAt), y1 = new Date(d), y3 = new Date(d); y1.setFullYear(d.getFullYear() + 1); y3.setFullYear(d.getFullYear() + 3);
    const f = x => x.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { year: "numeric", month: "long", day: "numeric" });
    return `<div class="card done"><h2>🎓 كمّلت برنامج التدريب!</h2><p style="margin:0">خلّصت 10 ساعات تدريب، نفس الكمية اللي انختبرت في الدراسة. تقدر تكمّل تلعب وتكسر رقمك متى ما بغيت.</p>
      <p class="small" style="margin:8px 0 0">🔁 جلسات التقوية تحافظ على النتيجة: الأولى بعد سنة (${f(y1)})، والثانية بعد 3 سنين (${f(y3)}).</p></div>`;
  }
  function introView() {
    app.innerHTML = `<header class="hero"><img src="../../icons/lamha.png" alt=""><h1>لمحة</h1><p>تمرين سرعة الالتقاط</p></header>
      ${G.best ? `<div class="card record"><div><small>🏅 رقمك اللي تكسره</small><span class="muted small">أقصر وقت التقطت فيه الاثنين</span></div><div style="text-align:center"><b>${N(G.best)}</b><small>ملّي ثانية</small></div></div>`
        : `<div class="card record"><div><small>🏅 أول جلسة لك</small><span class="muted small">بعدها يطلع لك رقم، وكل مرة تحاول تكسره</span></div><b>🎯</b></div>`}
      <button type="button" class="btn" data-act="start">ابدأ الجلسة (3 دقايق)</button>
      <p class="tip">💡 العب على شاشة كبيرة أو قرّب الجوال من عينك، وخل عينك ثابتة على نص الشاشة.</p>
      ${doneCard()}
      <div class="card"><h2>🎯 وش تدرّب</h2><div class="chips"><span class="chip">⚡ سرعة استيعاب اللي تشوفه</span><span class="chip">👀 الانتباه للأطراف</span></div>
        <p class="small" style="margin:10px 0 0">🔬 <b>قوة الدليل العلمي:</b> قوي لسرعة الالتقاط، وواعد للباقي.</p></div>
      <div class="card"><h2>📅 كم تلعب عشان تستفيد؟</h2>
        <p style="margin:0">لو استمريت عليها <b>10 دقايق يومياً، 5 أيام في الأسبوع، لمدة 12 أسبوع</b>، بتكمّل تقريباً <b>10 ساعات تدريب</b>. وهذي نفس كمية التدريب اللي انختبرت في أكبر دراسة علمية على ألعاب الدماغ.</p>
        <p class="small muted" style="margin:6px 0 0">الجلسة الوحدة 3 دقايق تقريباً، يعني 3 جلسات تكمّل لك دقايق اليوم.</p></div>
      ${programCard()}
      <div class="card"><h2>💪 وش لقوا الباحثين عند اللي تدربوا</h2><ul class="list">
        <li>تستوعب اللي تشوفه حولك بسرعة أكبر</li><li>تنتبه للأطراف وأنت مركّز على اللي قدامك</li><li>ردة فعلك أسرع وقيادتك أأمن</li><li>التحسن يستمر لسنين بعد ما توقف التدريب</li><li>خطر الخرف أقل مع التقدم في العمر</li></ul>
        <p class="note" style="margin:10px 0 0">ملاحظة: لمحة مستوحاة من التمرين اللي انختبر في الدراسة، والدراسة كانت على كبار السن. تحسّنك داخل اللعبة مؤكد، أما الفوايد خارجها فتختلف من شخص لثاني.</p></div>
      <div class="card"><h2>🎮 كيف تلعب</h2><ol class="steps">
        <li>كل جلسة لها <b>سيارتين</b>، تشوفهم قبل ما تبدأ. والجلسة اللي بعدها تتغير.</li>
        <li>ثبّت عينك على نص الشاشة، واضغط الزر اللي في النص.</li>
        <li>للحظة قصيرة تطلع <b>سيارة في النص</b> و<b>نجمة صفرا ⭐ في الأطراف</b>، وبعدها يغطيها تشويش.</li>
        <li>اختار أي سيارة من الثنتين شفتها.</li><li>اضغط المكان اللي كانت فيه النجمة.</li>
        <li>صح؟ يقصر وقت العرض. غلط؟ يطول. وفيه أشكال تشبه النجمة تحاول تلخبطك.</li>
        <li>الجلسة ${TRIALS} محاولة، ورقمك هو أقصر وقت تلتقط فيه الاثنين. <b>كل ما نزل الرقم أحسن.</b></li></ol></div>
      <div class="card"><h2>🔑 رمز تقدمك</h2>
        ${G.code ? `<div class="code">${showCode(G.code)}</div><p class="small muted" style="margin:6px 0 0">اكتبه عندك. لو غيّرت جوالك أو انمسح تقدمك، اكتبه هنا ويرجع كل شي.</p>`
          : `<p class="small muted" style="margin:0">يطلع لك بعد أول جلسة. تكتبه عندك عشان ترجّع تقدمك لو غيّرت جوالك.</p>`}
        <p class="small" style="margin:10px 0 6px">عندك رمز من قبل؟</p>
        <div class="row"><input id="rc" maxlength="9" placeholder="ABCD-EFGH" autocomplete="off" aria-label="رمز التقدم"><button type="button" data-act="restore">رجّع</button></div>
        <p class="small" id="rcmsg" style="margin:6px 0 0;color:#ffd43b">${esc(codeMsg)}</p></div>`;
  }

  /* ---------------- one session ---------------- */
  let S = 0, dpr = 1, cv = null, ctx = null, masks = [];
  // wide screens (TV, laptop, phone on its side): the questions sit beside the picture, so everything fits
  const isSide = () => innerWidth >= 800 && innerWidth > innerHeight * 1.2;
  function stageSize(side) { return side ? Math.max(220, Math.min(innerHeight - 90, innerWidth - 380, 680)) : Math.max(260, Math.min(innerWidth - 32, innerHeight - 250, 680)); }
  function makeTrial() {
    const pair = session.pair, shown = pick(pair), color = pick(D.CAR_COLORS);
    const dir = rint(8), far = Math.random() < 0.5;
    const others = shuffle([0, 1, 2, 3, 4, 5, 6, 7].filter(d => d !== dir)).slice(0, 4 + rint(4));
    const distract = others.map(d => ({ d, far: Math.random() < 0.5, kind: pick(D.DISTRACTORS) }));
    return { pair, shown, color, dir, far, distract, bg: pick(D.BGS), opts: shuffle(pair) };
  }
  const posOf = (d, far) => { const a = -Math.PI / 2 + d * Math.PI / 4, r = S * (far ? 0.40 : 0.255); return [S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r]; };
  function layer(draw) { const c = document.createElement("canvas"); c.width = Math.round(S * dpr); c.height = Math.round(S * dpr); const x = c.getContext("2d"); x.scale(dpr, dpr); draw(x); return c; }
  function prepare(tr) {
    tr.bgCv = layer(x => D.drawBg(x, tr.bg, S));
    tr.stim = layer(x => {
      x.drawImage(tr.bgCv, 0, 0, S, S);
      const r = S * 0.042;
      tr.distract.forEach(o => { const [px, py] = posOf(o.d, o.far); D.drawShape(x, o.kind, px, py, r); });
      const [sx, sy] = posOf(tr.dir, tr.far); D.drawShape(x, "star", sx, sy, r);
      D.drawCar(x, tr.shown, tr.color, S / 2, S / 2 - S * 0.02, S * 0.26);
    });
  }
  function drawFix(tr) { ctx.drawImage(tr.bgCv, 0, 0, S, S); ctx.fillStyle = "rgba(13,18,48,.35)"; ctx.fillRect(0, 0, S, S); ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(S / 2 - 12, S / 2); ctx.lineTo(S / 2 + 12, S / 2); ctx.moveTo(S / 2, S / 2 - 12); ctx.lineTo(S / 2, S / 2 + 12); ctx.stroke(); }
  function drawIdle(tr) { ctx.drawImage(tr.bgCv, 0, 0, S, S); ctx.fillStyle = "rgba(13,18,48,.55)"; ctx.fillRect(0, 0, S, S); }

  // like the original exercise: one pair of cars for the whole session, shown before it starts.
  // Every pair comes once before any comes again, and never the same pair twice in a row.
  function nextPair() {
    const all = D.PAIRS.map((_, i) => i), last = G.sessions.length ? G.sessions[G.sessions.length - 1].p : null;
    let q = Array.isArray(G.pq) ? G.pq.filter(i => all.includes(i)) : [];
    if (!q.length) { q = shuffle(all); if (q[0] === last && q.length > 1) q.push(q.shift()); }
    const i = q.shift(); G.pq = q; save(); return i;
  }
  function startSession() {
    const best = G.best, lastMs = G.sessions.length ? G.sessions[G.sessions.length - 1].ms : null;
    // first session starts slow (500 ms); later ones start a bit above the last number so the first tries are not a wall
    const startMs = lastMs ? Math.min(500, Math.max(120, lastMs * 1.8)) : 500;
    const p = nextPair();
    session = { i: 0, p, pair: D.PAIRS[p], frames: Math.max(1, Math.round(startMs / frameMs)), log: [], dirs: [], rev: [], ok: 0, t0: Date.now(), hidden: 0, hiddenAt: 0, best, aborted: false };
    view = "pair"; render();
  }
  const CAR_AR = { sedan: "سيدان", coupe: "كوبيه", hatch: "هاتشباك", suv: "جيب", van: "فان", pickup: "وانيت" };
  function pairView() {
    const w = Math.min(260, (Math.min(innerWidth, 640) - 70) / 2), color = "#1971c2";
    app.innerHTML = `<div class="card pairs"><h2>🚗 سيارات هالجلسة</h2>
        <p style="margin:0 0 12px">في كل محاولة بتطلع لك <b>وحدة من هالسيارتين</b> في النص. ركّز على الفرق بينهم.</p>
        <div class="cars">${session.pair.map(t => `<div><img src="${D.carImage(t, color, w)}" alt="${CAR_AR[t] || ""}"><b>${CAR_AR[t] || ""}</b></div>`).join("")}</div>
        <p class="small muted" style="margin:12px 0 0">لونها يتغير من محاولة لثانية، المهم شكلها.</p></div>
      <button type="button" class="btn" data-act="go">يلا نبدأ</button>
      <button type="button" class="btn alt" data-act="back">رجوع</button>`;
    app.querySelector("[data-act=go]").focus({ preventScroll: true });
  }
  function playView() {
    const side = isSide(); S = stageSize(side); dpr = Math.min(2, self.devicePixelRatio || 1);
    document.body.classList.toggle("wide", side); document.body.classList.add("playing");
    app.innerHTML = `<div class="playtop"><button type="button" class="x" data-act="quit" aria-label="اطلع">✕</button><span>محاولة <b id="ti">1</b> من ${TRIALS}</span><span>⏱️ <span class="ms" id="tms">–</span> م.ث</span>${session.best ? `<span>🏅 <span class="ms">${N(session.best)}</span></span>` : ""}</div>
      <div class="tbar"><i id="tp" style="width:0%"></i></div>
      <div class="playgrid${side ? " side" : ""}"><div class="stagewrap"><div class="stage" id="stage" style="width:${S}px;height:${S}px"><canvas id="cv" width="${Math.round(S * dpr)}" height="${Math.round(S * dpr)}" style="width:${S}px;height:${S}px"></canvas></div></div>
      <div class="ask" id="ask"></div></div>`;
    cv = document.getElementById("cv"); ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    masks = [0, 1, 2].map(() => D.makeMask(S, dpr));
  }
  function nextTrial() {
    if (!session || session.aborted) return;
    if (session.relayout) { session.relayout = false; playView(); }
    if (session.i >= TRIALS) return finish();
    const tr = session.tr = makeTrial(); prepare(tr); drawIdle(tr);
    document.getElementById("ti").textContent = session.i + 1;
    document.getElementById("tp").style.width = (session.i / TRIALS * 100) + "%";
    document.getElementById("tms").textContent = N(msOf(session.frames));
    document.getElementById("ask").innerHTML = `<p class="tip">ثبّت عينك على النص واضغط الزر</p>`;
    const st = document.getElementById("stage"), b = document.createElement("button");
    b.type = "button"; b.className = "go"; b.innerHTML = "👁️<br>اضغط"; b.onclick = () => { b.remove(); show(tr); };
    st.appendChild(b); b.focus({ preventScroll: true });
  }
  function show(tr) {
    drawFix(tr); tr.void = false;
    setTimeout(() => {
      if (!session || session.aborted) return;
      let n = 0;
      const frames = session.frames;
      const step = () => {
        if (n === 0) ctx.drawImage(tr.stim, 0, 0, S, S);
        else if (n >= frames) { ctx.drawImage(pick(masks), 0, 0, S, S); setTimeout(() => askCar(tr), 450); return; }
        n++; requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }, 450);
  }
  function askCar(tr) {
    if (!session || session.aborted) return;
    drawIdle(tr);
    const w = Math.min(200, (Math.min(innerWidth, 720) - 60) / 2);
    const ask = document.getElementById("ask");
    ask.innerHTML = `<h3>🚗 أي سيارة كانت في النص؟</h3><div class="cars">${tr.opts.map((t, i) => `<button type="button" data-car="${i}"><img src="${D.carImage(t, tr.color, w)}" alt="سيارة ${i + 1}"></button>`).join("")}</div>`;
    ask.querySelector("button").focus({ preventScroll: true });
    ask.onclick = e => { const b = e.target.closest("[data-car]"); if (!b) return; ask.onclick = null; tr.carPick = tr.opts[+b.dataset.car]; askStar(tr); };
  }
  function askStar(tr) {
    const ask = document.getElementById("ask"), st = document.getElementById("stage");
    ask.innerHTML = `<h3>⭐ وين كانت النجمة؟</h3><p class="tip">اضغط على المكان</p>`;
    for (let d = 0; d < 8; d++) {
      const a = -Math.PI / 2 + d * Math.PI / 4, r = S * 0.33, b = document.createElement("button");
      b.type = "button"; b.className = "dir"; b.dataset.dir = d; b.setAttribute("aria-label", "مكان " + (d + 1));
      b.style.left = (S / 2 + Math.cos(a) * r) + "px"; b.style.top = (S / 2 + Math.sin(a) * r) + "px";
      st.appendChild(b);
    }
    st.onclick = e => { const b = e.target.closest("[data-dir]"); if (!b) return; st.onclick = null; answer(tr, +b.dataset.dir); };
  }
  function answer(tr, dirPick) {
    const carOk = tr.carPick === tr.shown, starOk = dirPick === tr.dir, ok = carOk && starOk;
    const st = document.getElementById("stage");
    st.querySelectorAll(".dir").forEach(b => { const d = +b.dataset.dir; if (d === tr.dir) { b.classList.add("ok"); b.textContent = "⭐"; } else if (d === dirPick) b.classList.add("bad"); });
    document.getElementById("ask").innerHTML = `<p class="fb">${carOk ? "✅" : "❌"} السيارة · ${starOk ? "✅" : "❌"} النجمة</p>`;
    if (self.FX) FX.play(ok ? "right" : "wrong", ok ? 0 : 40);
    if (!tr.void) {
      // the staircase: right → one notch shorter (about 10%), wrong → about 37% longer (settles near 3 right out of 4)
      const f = session.frames, ms = msOf(f);
      session.log.push({ ms, ok });
      if (ok) session.ok++;
      const next = ok ? Math.max(1, Math.min(f - 1, Math.round(f * 0.9))) : Math.min(Math.round(1000 / frameMs), Math.max(f + 1, Math.round(f * 1.37)));
      const dirNow = next < f ? -1 : next > f ? 1 : 0, prev = session.dirs[session.dirs.length - 1];
      if (dirNow && prev && dirNow !== prev) session.rev.push(ms);
      if (dirNow) session.dirs.push(dirNow);
      session.frames = next; session.i++;
    }
    setTimeout(() => { st.querySelectorAll(".dir").forEach(b => b.remove()); nextTrial(); }, 900);
  }
  // the session's number: the middle of where the look kept turning back (last reversals), in ms
  function threshold(s) {
    const gm = a => Math.exp(a.reduce((x, v) => x + Math.log(v), 0) / a.length);
    if (s.rev.length >= 4) return gm(s.rev.slice(s.rev.length >= 8 ? 2 : 0).slice(-6));
    return gm(s.log.slice(-10).map(x => x.ms));
  }
  function finish() {
    const s = session; session = null;
    const ms = Math.round(threshold(s)), acc = Math.round(s.ok / s.log.length * 100);
    const mins = Math.min(5, Math.max(0, (Date.now() - s.t0 - s.hidden) / 60000));
    const today = dayKey(), prevBest = G.best;
    if (!G.first) G.first = today;
    G.days[today] = (G.days[today] || 0) + mins;
    G.sessions.push({ t: Date.now(), ms, acc, n: s.log.length, p: s.p }); G.sessions = G.sessions.slice(-200);
    const record = !prevBest || ms < prevBest;
    if (record) G.best = ms;
    const justDone = !G.doneAt && totalMin() >= PLAN_MIN; if (justDone) G.doneAt = today;
    save(); backup().then(() => { if (view === "result") render(); });
    lastResult = { ms, acc, prevBest, record, first: !prevBest, justDone };
    view = "result"; render(); scrollTo(0, 0);
    if (self.FA) { if (record || justDone) { FA.confetti(); FA.play("win", [40, 40, 120]); } else FA.play("reveal"); }
  }
  function chart() {
    const last = G.sessions.slice(-10); if (last.length < 2) return "";
    // oldest on the right, newest on the left (reads like Arabic)
    const W = 600, H = 210, max = Math.max(...last.map(s => s.ms)) * 1.15, bw = Math.min(110, (W - 20) / last.length), x0 = (W + bw * last.length) / 2;
    const bars = last.map((s, i) => { const h = Math.max(6, (s.ms / max) * (H - 50)), x = x0 - (i + 1) * bw + bw * 0.14, y = H - 6 - h, isBest = s.ms === G.best;
      return `<rect x="${x}" y="${y}" width="${bw * 0.72}" height="${h}" rx="8" fill="${isBest ? "#ffd43b" : "url(#lg)"}"/><text x="${x + bw * 0.36}" y="${y - 8}" text-anchor="middle" font-size="${last.length > 6 ? 22 : 26}" font-weight="800" fill="#eef1ff">${N(s.ms)}</text>`; }).join("");
    return `<div class="card"><h2>📈 تطورك في آخر الجلسات</h2><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="أرقامك في آخر الجلسات"><defs><linearGradient id="lg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#7fe0ff"/><stop offset="1" stop-color="#7c5cff"/></linearGradient></defs>${bars}</svg>
      <p class="small muted" style="margin:6px 0 0;text-align:center">الأقدم يمين والأحدث يسار · 🟨 أفضل رقم · كل ما قصر العمود أحسن</p></div>`;
  }
  function resultView() {
    const r = lastResult;
    let msg;
    if (r.first) msg = "🎯 هذا أول رقم لك. المرة الجاية حاول تكسره!";
    else if (r.record) msg = `🎉 رقم قياسي جديد! كسرت رقمك السابق (${N(r.prevBest)}) بـ ${N(r.prevBest - r.ms)} ملّي ثانية. استمر!`;
    else if (r.ms <= r.prevBest * 1.12) msg = `👌 قريب من أفضل رقم لك (${N(r.prevBest)}). التذبذب البسيط بين جلسة وجلسة طبيعي، الأهم إنك تستمر.`;
    else msg = `😴 أبطأ من أفضل رقم لك (${N(r.prevBest)}). ممكن سيارات هالجلسة أصعب من غيرها، والتعب وقلة النوم بعد يأثرون على سرعة الالتقاط. جرّب وأنت مرتاح.`;
    app.innerHTML = `<div class="card big"><span class="u">رقمك في هالجلسة</span><div class="n">${N(r.ms)}</div><span class="u">ملّي ثانية · أقصر وقت التقطت فيه الاثنين</span>
        <div class="stats"><div>${r.acc}%<small>دقتك</small></div><div>${N(G.best)}<small>🏅 أفضل رقم لك</small></div><div>${G.sessions.length}<small>جلسة</small></div></div></div>
      <div class="card"><p class="msg" style="margin:0">${esc(msg)}</p></div>
      ${r.justDone ? doneCard() : ""}
      ${chart()}
      ${programCard()}
      <button type="button" class="btn" data-act="start">العب جلسة ثانية</button>
      <a class="btn alt" href="../">ألعاب Mind Games</a>
      ${G.code ? `<p class="tip">🔑 رمز تقدمك: <b style="direction:ltr;unicode-bidi:isolate">${showCode(G.code)}</b>${backupMsg ? " · " + esc(backupMsg) : ""}</p>` : ""}`;
  }
  function render() { if (view !== "play") document.body.classList.remove("wide", "playing"); ({ intro: introView, pair: pairView, play: playView, result: resultView }[view] || introView)(); }

  /* ---------------- buttons ---------------- */
  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const a = b.dataset.act;
    if (a === "start") { startSession(); scrollTo(0, 0); return; }
    if (a === "go") { if (!session) return; session.t0 = Date.now(); session.hidden = 0; session.hiddenAt = 0; view = "play"; render(); nextTrial(); scrollTo(0, 0); return; }
    if (a === "back") { session = null; view = "intro"; render(); scrollTo(0, 0); return; }
    if (a === "quit") { if (confirm("تطلع من الجلسة؟ ما راح تنحسب.")) { if (session) session.aborted = true; session = null; view = "intro"; render(); } return; }
    if (a === "restore") { b.disabled = true; const m = await restore(document.getElementById("rc").value); codeMsg = m || "✅ رجع تقدمك."; render(); return; }
  });
  // screen turned or resized: redraw the play area at the new size (right away while waiting, or before the next look)
  let rz = 0;
  addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => {
    if (view !== "play" || !session) return;
    const side = isSide(); if (side === document.body.classList.contains("wide") && Math.abs(stageSize(side) - S) < 12) return;
    if (document.querySelector("#stage .go")) { playView(); nextTrial(); } else session.relayout = true;
  }, 300); });
  // a look that happened while the page was hidden doesn't count; hidden time isn't training time
  document.addEventListener("visibilitychange", () => {
    if (!session) return;
    if (document.hidden) { session.hiddenAt = Date.now(); if (session.tr) session.tr.void = true; }
    else if (session.hiddenAt) { session.hidden += Date.now() - session.hiddenAt; session.hiddenAt = 0; }
  });
  render();
  if (self.FX && !document.querySelector(".fx-mute")) FX.muteButton();
  self.LAMHA = { get G() { return G; }, threshold, get frameMs() { return frameMs; }, get session() { return session; } };   // test hook
})();
