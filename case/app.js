/* قضية الغرفة 714 — a detective case played on one screen (a phone, or the TV for the whole group).
   The file starts with the A evidence; each mission asks for a theory (answer + evidence codes).
   A right theory with enough of the needed evidence opens the next envelope (B, C, D).
   Progress is kept on this device, so closing the page doesn't lose anything. */
(function () {
  "use strict";
  const C = self.CASE714, app = document.getElementById("app");
  // evidence codes (A5, C3…) kept whole inside Arabic text, so "(A5، A9)" reads right
  const codes = h => h.replace(/\b([A-D]\d{1,2})\b/g, "<bdi>$1</bdi>");
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const SOL = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(C.SOL), c => c.charCodeAt(0))));
  const KEY = "case-" + C.id + "-v1";
  const fresh = () => ({ solved: 0, seen: {}, hints: {}, tries: {}, ord: {}, letter: false, t0: Date.now(), t1: null });
  let G; try { G = Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY) || "null") || {}); } catch (e) { G = fresh(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(G)); } catch (e) {} };
  const ENV = ["A", "B", "C", "D"];
  const ENV_NAME = { A: "الملف الأساسي", B: "ظرف المهمة 1", C: "ظرف المهمة 2", D: "ظرف المهمة 3" };
  const openEnvs = () => ENV.slice(0, 1 + Math.min(3, G.solved));
  const evOpen = () => C.EV.filter(e => openEnvs().includes(e.id[0]));
  let view = "file", form = null, msg = "", lastOk = null;

  /* ---------- the file ---------- */
  function fileView() {
    const m = C.MISSIONS[G.solved];
    const groups = openEnvs().map(L => `<div class="grp"><h3>${L === "A" ? "📁" : "✉️"} ${ENV_NAME[L]} (${L}) <small>${C.EV.filter(e => e.id[0] === L).length} أدلة</small></h3>
      <div class="evs">${C.EV.filter(e => e.id[0] === L).map(e => `<button type="button" class="ev ${G.seen[e.id] ? "seen" : ""}" data-ev="${e.id}">${!G.seen[e.id] && L !== "A" ? `<span class="new">جديد</span>` : ""}${e.id}<small>${e.k} ${esc(e.t)}</small></button>`).join("")}</div></div>`).join("");
    const locked = ENV.slice(openEnvs().length).length ? `<div class="envs">${ENV.slice(1).map(L => { const op = openEnvs().includes(L); return `<div class="envimg ${op ? "open" : ""}"><img src="img/envelope.webp" alt=""><b>${ENV_NAME[L]} (${L})</b><span>${op ? "✅ مفتوح" : "🔒 مختوم"}</span></div>`; }).join("")}</div>` : "";
    const ms = C.MISSIONS.map((x, i) => `<div class="m ${i < G.solved ? "done" : ""}">${i < G.solved ? "✅" : i === G.solved ? "🔎" : "🔒"} ${x.final ? "المهمة الأخيرة" : "المهمة " + x.n}: ${esc(x.title)}<span class="st">${i < G.solved ? "انحلّت" : i === G.solved ? "الحين" : "مقفلة"}</span></div>`).join("");
    app.innerHTML = `<div class="hero folder"><img src="img/folder.webp" alt=""><div class="on"><h1>${esc(C.title)}</h1><p>${esc(C.place)}</p><span class="stamp">${G.solved >= 4 ? "انحلّت ✓" : "مُعاد فتحها"}</span></div></div>
      <div class="cols"><div>
        <div class="card letter"><h2>✉️ مرحباً أيها المحقق</h2>${G.letter ? C.LETTER : `<p>${esc("رسالة بخط اليد من لمى، بنت الضحية…")}</p><button type="button" class="btn alt" data-act="letter">اقرأ الرسالة</button>`}</div>
        <div class="card">${groups}${locked}</div>
      </div><div>
        <div class="card missions"><h2>المهام</h2>${ms}
          ${G.solved < 4 ? `<button type="button" class="btn mt" data-act="mission">🔎 ${m.final ? "المهمة الأخيرة" : "المهمة " + m.n}: ${esc(m.title)}</button>` : `<button type="button" class="btn mt" data-act="solution">📖 الحل الكامل</button>`}</div>
        <div class="card"><h2>كيف تلعبون؟</h2><ol style="margin:0;padding-inline-start:20px;font-size:15px">
          <li>اقرأوا رسالة لمى والأدلة. اضغط على أي دليل يفتح.</li><li>لما تكون عندكم نظرية، افتحوا المهمة واختاروا الإجابة والأدلة اللي تثبتها.</li><li>النظرية الصح تفتح ظرف جديد فيه أدلة جديدة.</li><li>علقتوا؟ كل مهمة فيها 3 تلميحات.</li></ol></div>
      </div></div>
      <p class="reset">تبون تبدأون القضية من أول؟ <button type="button" data-act="reset">ابدأ من جديد</button></p>`;
  }

  /* ---------- one piece of evidence ---------- */
  let sheet = null;
  function showEv(id) {
    const list = evOpen(), i = list.findIndex(e => e.id === id), e = list[i]; if (!e) return;
    G.seen[id] = 1; save();
    if (!sheet) {
      sheet = document.createElement("div"); sheet.className = "sheet in"; sheet.onclick = ev => { if (ev.target === sheet) closeEv(); };
      document.body.appendChild(sheet); document.documentElement.classList.add("lock");
      // swipe sideways between the pieces of evidence (right-to-left page: "next" sits on the left, so a swipe to the right brings it in)
      let x0 = null, y0 = null;
      sheet.addEventListener("touchstart", t => { x0 = t.touches[0].clientX; y0 = t.touches[0].clientY; }, { passive: true });
      sheet.addEventListener("touchend", t => {
        if (x0 === null) return; const dx = t.changedTouches[0].clientX - x0, dy = t.changedTouches[0].clientY - y0; x0 = null;
        if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        const go = sheet.querySelector(dx > 0 ? "[data-evgo]:last-of-type" : "[data-evgo]"); if (go && go.dataset.evgo) showEv(go.dataset.evgo);
      }, { passive: true });
    } else sheet.classList.remove("in");
    sheet.innerHTML = `<div role="dialog" aria-label="${esc(e.t)}"><div class="hd"><h3>${e.k} ${esc(e.t)}</h3><span class="code">${e.id}</span></div>${e.h}
      <div class="nav"><button type="button" class="btn alt" data-evgo="${list[i - 1] ? list[i - 1].id : ""}" ${i > 0 ? "" : "disabled"}>→ اللي قبل</button><button type="button" class="btn" data-act="closeev">سكّر</button><button type="button" class="btn alt" data-evgo="${list[i + 1] ? list[i + 1].id : ""}" ${list[i + 1] ? "" : "disabled"}>اللي بعد ←</button></div></div>`;
    sheet.scrollTop = 0; sheet.firstElementChild.scrollTop = 0;
    const d = sheet.firstElementChild; d.classList.add("swap"); requestAnimationFrame(() => requestAnimationFrame(() => d.classList.remove("swap")));
  }
  function closeEv() { if (sheet) { sheet.remove(); sheet = null; } document.documentElement.classList.remove("lock"); render(); }

  /* ---------- a theory ---------- */
  // each question's options in a random order (the same order for the whole game on this device)
  function order(i, pi, n) {
    const k = i + "-" + pi; G.ord = G.ord || {};
    if (!Array.isArray(G.ord[k]) || G.ord[k].length !== n) {
      const a = [...Array(n).keys()]; for (let j = n - 1; j > 0; j--) { const r = crypto.getRandomValues(new Uint32Array(1))[0] % (j + 1); [a[j], a[r]] = [a[r], a[j]]; }
      G.ord[k] = a; save();
    }
    return G.ord[k];
  }
  function missionView() {
    const i = G.solved, m = C.MISSIONS[i], s = SOL.m[i];
    if (!form || form.i !== i) form = { i, pick: m.parts.map(() => null), ev: [] };
    const used = G.hints[i] || 0;
    app.innerHTML = `<div class="hero"><h1>🔎 ${m.final ? "المهمة الأخيرة" : "المهمة " + m.n}</h1><p>${esc(m.title)}</p></div>
      <div class="cols"><div>
      <div class="card">${m.parts.map((p, pi) => `<div class="part"><h4>${esc(p.q)}</h4>${order(i, pi, p.o.length).map(oi => `<button type="button" class="opt ${form.pick[pi] === oi ? "on" : ""}" data-part="${pi}" data-o="${oi}">${esc(p.o[oi])}</button>`).join("")}</div>`).join("")}</div>
      <div class="card"><h2>الأدلة اللي تثبت نظريتك</h2><div class="chips">${evOpen().map(e => `<button type="button" class="chip ${form.ev.includes(e.id) ? "on" : ""}" data-chip="${e.id}"><b>${e.id}</b> ${esc(e.t)}</button>`).join("")}<p class="chip-lbl">اختار ${s.min === 3 ? "ثلاث أدلة" : "دليلين"} على الأقل. تبي تقرا دليل؟ ارجع للملف، واختياراتك تبقى محفوظة.</p></div></div>
      <button type="button" class="btn" data-act="submit">قدّم النظرية</button><p class="err" id="err">${esc(msg)}</p>
      </div><div>
      <div class="card hints"><h2>💡 التلميحات</h2>${m.hints.slice(0, used).map((h, k) => `<div class="h"><b>${k + 1}.</b> ${codes(esc(h))}</div>`).join("")}
        ${used < 3 ? `<button type="button" class="btn alt mt" data-act="hint">${used ? "التلميح اللي بعده" : "أبي تلميح"} (${used} من 3)</button>` : `<p class="chip-lbl">خلصت التلميحات.</p>`}</div>
      <button type="button" class="btn alt" data-act="file">→ رجوع للملف</button>
      </div></div>`;
  }
  function submit() {
    const i = G.solved, m = C.MISSIONS[i], s = SOL.m[i];
    if (form.pick.some(x => x === null)) { msg = m.parts.length > 1 ? "جاوب على الجزئين." : "اختار إجابة."; render(); showErr(); return; }
    if (form.ev.length < s.min) { msg = `اختار ${s.min === 3 ? "ثلاث أدلة" : "دليلين"} على الأقل تثبت نظريتك.`; render(); showErr(); return; }
    G.tries[i] = (G.tries[i] || 0) + 1;
    const right = form.pick.every((x, k) => x === s.a[k]), backed = form.ev.filter(e => s.need.includes(e)).length >= s.min;
    if (!(right && backed)) { save(); msg = "نظريتك ما ثبتت. راجع الأدلة وجرب مرة ثانية."; if (self.FA) FA.wrong(); render(); showErr(); return; }
    msg = ""; lastOk = i; G.solved = i + 1; if (G.solved >= 4) G.t1 = Date.now(); save(); form = null;
    view = "ok"; render(); scrollTo(0, 0);
    if (self.FA) { if (G.solved >= 4) { FA.confetti(); FA.play("win", [40, 40, 120]); } else FA.right(m.opens ? "✉️ " + ENV_NAME[m.opens] : "صح!"); }
  }
  function showErr() { const e = document.getElementById("err"); if (!e) return; e.scrollIntoView({ behavior: "smooth", block: "center" }); e.classList.remove("shake"); void e.offsetWidth; e.classList.add("shake"); }
  function okView() {
    const i = lastOk, m = C.MISSIONS[i], s = SOL.m[i];
    app.innerHTML = `<div class="hero"><h1>${G.solved >= 4 ? "🎉 حليت القضية!" : "✅ نظريتك صحيحة"}</h1></div>
      ${m.opens ? `<div class="openenv"><img src="img/envelope.webp" alt=""><b>${ENV_NAME[m.opens]} (${m.opens})</b></div>` : ""}
      <div class="card"><p class="okmsg">${esc(s.ok)}</p><h2>ليش هذي الإجابة؟</h2><ul class="why">${s.why.map(w => `<li>${codes(esc(w))}</li>`).join("")}</ul></div>
      ${m.opens ? `<button type="button" class="btn" data-act="file" data-go="${G.solved}">✉️ افتح ${ENV_NAME[m.opens]} (${m.opens})</button>` : `<button type="button" class="btn" data-act="solution">📖 الحل الكامل</button>`}`;
  }
  function solutionView() {
    const mins = Math.max(1, Math.round(((G.t1 || Date.now()) - G.t0) / 60000)), tries = Object.values(G.tries).reduce((a, b) => a + b, 0), hints = Object.values(G.hints).reduce((a, b) => a + b, 0);
    app.innerHTML = `<div class="hero"><h1>📖 الحل الكامل</h1><span class="stamp">انحلّت ✓</span></div>
      <div class="card"><div class="stats"><div>${tries}<small>محاولة</small></div><div>${hints}<small>تلميح</small></div><div>${mins >= 60 ? Math.floor(mins / 60) + ":" + String(mins % 60).padStart(2, "0") : mins + " د"}<small>الوقت</small></div><div>${rank(tries, hints)}<small>تقييمك</small></div></div></div>
      <div class="card"><p class="okmsg" style="color:var(--ink)">${esc(SOL.summary)}</p></div>
      <div class="card"><h2>⏱️ وش صار تلك الليلة</h2><div class="tw"><table class="tl"><tbody>${SOL.timeline.map(([t, x]) => `<tr><td>${esc(t)}</td><td>${esc(x)}</td></tr>`).join("")}</tbody></table></div></div>
      <div class="cols"><div class="card"><h2>🔍 الأخطاء اللي فضحتها</h2><ul class="why">${SOL.mistakes.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <div class="card"><h2>🙌 ليش الباقين أبرياء</h2><ul class="why">${SOL.innocent.map(([n, x]) => `<li><b>${esc(n)}:</b> ${esc(x)}</li>`).join("")}</ul></div></div>
      <button type="button" class="btn alt" data-act="file">→ رجوع للملف</button>
      <p class="reset">تبون تلعبونها مرة ثانية؟ <button type="button" data-act="reset">ابدأ من جديد</button></p>`;
  }
  const rank = (tries, hints) => { const x = (tries - 4) + hints * 1.5; return x <= 0 ? "🕵️ أسطوري" : x <= 3 ? "🥇 محقق خبير" : x <= 7 ? "🥈 محقق شاطر" : "🥉 محقق مبتدئ"; };

  function render() {
    if (view === "mission" && G.solved >= 4) view = "solution";
    ({ file: fileView, mission: missionView, ok: okView, solution: solutionView }[view] || fileView)();
    if (view !== lastView) { lastView = view; app.classList.remove("fade"); void app.offsetWidth; app.classList.add("fade"); }
  }
  let lastView = null;

  document.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    const a = b.dataset.act;
    if (b.dataset.ev) { showEv(b.dataset.ev); return; }
    if (b.dataset.evgo !== undefined) { if (b.dataset.evgo) showEv(b.dataset.evgo); return; }
    if (a === "closeev") { closeEv(); return; }
    if (a === "letter") { G.letter = true; save(); render(); return; }
    if (a === "mission") { view = "mission"; msg = ""; render(); scrollTo(0, 0); return; }
    if (a === "file") { view = "file"; render(); const g = b.dataset.go && document.querySelectorAll(".grp")[+b.dataset.go]; if (g) { g.scrollIntoView({ behavior: "smooth", block: "start" }); g.classList.add("flash"); } else scrollTo(0, 0); return; }
    if (a === "solution") { view = "solution"; render(); scrollTo(0, 0); return; }
    if (b.dataset.part !== undefined) { form.pick[+b.dataset.part] = +b.dataset.o; msg = ""; render(); return; }
    if (b.dataset.chip) { const id = b.dataset.chip; form.ev = form.ev.includes(id) ? form.ev.filter(x => x !== id) : form.ev.concat(id); msg = ""; render(); return; }
    if (a === "hint") { const i = G.solved; G.hints[i] = Math.min(3, (G.hints[i] || 0) + 1); save(); render(); return; }
    if (a === "submit") { submit(); return; }
    if (a === "reset") { if (confirm("تبدأون القضية من أول؟ بيروح كل اللي حليتوه.")) { G = fresh(); save(); form = null; view = "file"; render(); scrollTo(0, 0); } return; }
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && sheet) closeEv(); });
  render();
  self.CASE = { get G() { return G; }, SOL };   // test hook
})();
